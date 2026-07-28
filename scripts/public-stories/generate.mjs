#!/usr/bin/env node
/**
 * Batch generator for the public library (`publicStories`).
 *
 * Three phases, all resumable via out/manifest.json:
 *
 *   node scripts/public-stories/generate.mjs --phase narrators
 *       Resolve every narratorKey referenced by specs.mjs against the live
 *       publicNarrators collection; create the NEW_NARRATORS that are missing.
 *       Needs the admin password (YN_ADMIN_PASSWORD env or interactive prompt).
 *
 *   node scripts/public-stories/generate.mjs --phase text [--dry-run]
 *       Generate transcripts with claude-fable-5 (3-stage pipeline) into
 *       out/<slug>.txt. Only needs ANTHROPIC_API_KEY. Existing .txt files are
 *       skipped (edit them freely; --force regenerates). Review/edit the
 *       transcripts by hand before publishing — this is the review gate.
 *
 *   node scripts/public-stories/generate.mjs --phase publish [--dry-run]
 *       Chunk → ElevenLabs TTS (cached in out/audio/<slug>/) → Firebase
 *       Storage upload → publicStories doc. Prints a cost preflight (total
 *       chars ≈ eleven_v3 credits) and asks for confirmation before any TTS.
 *       Needs ELEVENLABS + Firebase env + admin password.
 *
 *   node scripts/public-stories/generate.mjs --phase retrofit [--dry-run]
 *       Sync ALREADY-PUBLISHED docs to the current specs: collection (shelf),
 *       tags, coverColor, genre, and re-measured duration when the local
 *       audio cache exists. Use after editing specs.mjs metadata so live
 *       stories match new stories. Needs Firebase env + admin password.
 *
 * Common flags: --only <slug> (repeatable) · --limit N · --force · --yes
 *
 * Un-publishing a story: delete its publicStories doc in the Firebase console
 * and remove its entry from out/manifest.json (not automated on purpose).
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

import {
  announcementCount,
  ask,
  askHidden,
  chunkTtsText,
  createVoiceFromPreview,
  DELIVERY_PREFIX,
  designVoicePreviews,
  enforceHardLimit,
  generateDepthLayers,
  generateTranscript,
  loadManifest,
  mapWithConcurrency,
  retryable,
  saveManifest,
  sha256,
  splitTextIntoChunks,
  ttsChunk,
  TTS_CONCURRENCY,
} from './lib.mjs';
import {
  AUDITION_TEXT,
  colorForSpec,
  NEW_NARRATORS,
  RENDER_TUNING,
  SPECS,
  validateSpecs,
  VOICE_CANDIDATES,
} from './specs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

const OUT_DIR = path.join(__dirname, 'out');
const AUDIO_DIR = path.join(OUT_DIR, 'audio');
const MANIFEST_FILE = path.join(OUT_DIR, 'manifest.json');
const ADMIN_EMAIL = 'ellepotterhead2006@gmail.com';

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    phase: null, only: [], limit: Infinity, force: false, dryRun: false, yes: false,
    ttsOnly: false, pick: [], assign: [], setNarrator: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--phase') args.phase = argv[++i];
    else if (a === '--only') args.only.push(argv[++i]);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--tts-only') args.ttsOnly = true;
    else if (a === '--pick') args.pick.push(argv[++i]);
    else if (a === '--assign') args.assign.push(argv[++i]);
    else if (a === '--set-narrator') args.setNarrator.push(argv[++i]);
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(1);
    }
  }
  if (!['narrators', 'text', 'publish', 'retrofit', 'voices', 'rerender'].includes(args.phase)) {
    console.error('usage: node scripts/public-stories/generate.mjs --phase narrators|text|publish|retrofit|voices|rerender [--only <slug>] [--limit N] [--force] [--dry-run] [--yes] [--pick key:idx] [--assign male|female=key] [--set-narrator narrator=key]');
    process.exit(1);
  }
  return args;
}

// One-shot stories resolve, in priority order: per-slug override → per-gender
// override → the spec's hardcoded voiceId. Narrator-paired stories always use
// the narrator doc's voice (change those via --set-narrator).
function resolveVoiceId(spec, manifest) {
  if (spec.narratorKey) return manifest.narrators[spec.narratorKey]?.voiceId || null;
  return (
    manifest.voiceSlugOverrides?.[spec.slug] ||
    manifest.voiceOverrides?.[spec.genderOther] ||
    spec.voiceId ||
    null
  );
}

// Per-voice render tuning (RENDER_TUNING is keyed by candidate key; find the
// key by reverse-matching the resolved voiceId through manifest.voices).
function tuningForVoice(voiceId, manifest) {
  const entry = Object.entries(manifest.voices || {}).find(([, v]) => v.voiceId === voiceId);
  return (entry && RENDER_TUNING[entry[0]]) || {};
}

function selectSpecs({ only, limit }) {
  let specs = SPECS;
  if (only.length) {
    const wanted = new Set(only);
    specs = specs.filter((s) => wanted.has(s.slug));
    const missing = only.filter((slug) => !SPECS.some((s) => s.slug === slug));
    if (missing.length) {
      console.error(`unknown slug(s): ${missing.join(', ')}`);
      process.exit(1);
    }
  }
  return specs.slice(0, limit);
}

// Cover colors cycle per shelf — index each spec within its collection once.
const COLLECTION_INDEX = (() => {
  const counters = {};
  const map = {};
  for (const spec of SPECS) {
    counters[spec.collection] = counters[spec.collection] ?? 0;
    map[spec.slug] = counters[spec.collection]++;
  }
  return map;
})();

const txtPath = (slug) => path.join(OUT_DIR, `${slug}.txt`);
const durationLabel = (d) => d.replace(/^(\d+)min$/, '$1 min'); // '10min' → '10 min' (existing doc convention)

// Fable (especially immersive mode) often lands under the word target, so the
// published duration reflects the actual rendered audio: mp3_44100_128 is
// 128 kbps ≈ 16 KB/s. Falls back to the spec bucket if files are unreadable.
function measuredDurationLabel(spec, dir, chunkCount) {
  try {
    let bytes = 0;
    for (let i = 0; i < chunkCount; i++) bytes += fs.statSync(path.join(dir, `chunk${i}.mp3`)).size;
    const minutes = Math.max(1, Math.round(bytes / 16000 / 60));
    return `${minutes} min`;
  } catch {
    return durationLabel(spec.duration);
  }
}

// ── firebase ────────────────────────────────────────────────────────────────
let fb = null;
async function firebaseSignIn() {
  if (fb) return fb;
  const required = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_APP_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`missing env: ${missing.join(', ')}`);
    process.exit(1);
  }
  const app = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  const password = process.env.YN_ADMIN_PASSWORD || (await askHidden(`Enter password for ${ADMIN_EMAIL}: `));
  console.log('🔑 signing in…');
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  console.log(`✅ signed in as ${cred.user.uid}\n`);
  fb = { db: getFirestore(app), storage: getStorage(app), uid: cred.user.uid };
  return fb;
}

// ── phase: narrators ────────────────────────────────────────────────────────
async function phaseNarrators(args, manifest) {
  const referenced = [...new Set(SPECS.filter((s) => s.narratorKey).map((s) => s.narratorKey))];
  console.log(`narrator keys referenced by specs: ${referenced.join(', ')}\n`);
  if (args.dryRun) {
    const missing = referenced.filter((k) => !manifest.narrators[k]);
    console.log(`resolved in manifest: ${referenced.length - missing.length}, unresolved: ${missing.length} (${missing.join(', ') || 'none'})`);
    return;
  }
  const { db } = await firebaseSignIn();

  // Narrator keys are friendly names; usernames often differ (grayscleats,
  // beaucrowder, julialovespomegranate), so fall back to matching the doc's
  // name field when the username query misses. The collection is tiny.
  let allNarrators = null;
  const findByName = async (key) => {
    if (!allNarrators) allNarrators = (await getDocs(collection(db, 'publicNarrators'))).docs;
    return allNarrators.find((d) => (d.data().name || '').toLowerCase() === key) || null;
  };

  for (const key of referenced) {
    const snap = await getDocs(query(collection(db, 'publicNarrators'), where('usernameLowercase', '==', key)));
    const d = !snap.empty ? snap.docs[0] : await findByName(key);
    if (d) {
      const data = d.data();
      manifest.narrators[key] = { docId: d.id, voiceId: data.voiceId || null, name: data.name || key };
      console.log(`✅ found ${key} → ${d.id} (voice ${data.voiceId || 'none'})`);
      continue;
    }
    const seed = NEW_NARRATORS.find((n) => n.usernameLowercase === key);
    if (!seed) {
      console.error(`❌ narrator "${key}" not found in publicNarrators and not defined in NEW_NARRATORS`);
      process.exitCode = 1;
      continue;
    }
    const now = Timestamp.now();
    const docRef = await addDoc(collection(db, 'publicNarrators'), {
      ...seed,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    manifest.narrators[key] = { docId: docRef.id, voiceId: seed.voiceId, name: seed.name };
    console.log(`✨ created ${seed.name} → ${docRef.id} (voice ${seed.voiceId})`);
  }
  saveManifest(MANIFEST_FILE, manifest);
  console.log('\nnarrator map saved to manifest.');
}

// ── phase: text ─────────────────────────────────────────────────────────────
async function phaseText(args, manifest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('missing ANTHROPIC_API_KEY');
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const selected = selectSpecs(args);
  const rows = [];
  for (const spec of selected) {
    const file = txtPath(spec.slug);
    const entry = manifest.stories[spec.slug] || {};
    const exists = fs.existsSync(file);
    if (exists && !args.force) {
      rows.push([spec.slug, spec.narrationMode, spec.duration, '—', '—', 'kept (file exists)']);
      continue;
    }
    if (args.dryRun) {
      rows.push([spec.slug, spec.narrationMode, spec.duration, '—', '—', 'would generate']);
      continue;
    }
    if (args.force) {
      // regenerating text invalidates any downstream TTS/upload/publish state
      delete entry.ttsHash;
      delete entry.chunkCount;
      delete entry.audioChunkURLs;
      fs.rmSync(path.join(AUDIO_DIR, spec.slug), { recursive: true, force: true });
    }
    process.stdout.write(`📝 ${spec.slug} (${spec.narrationMode}, ${spec.duration}, ${spec.isNighttime ? 'nsfw' : 'sfw'})… `);
    try {
      const { transcript, targetWords } = await generateTranscript(anthropic, spec, spec.narrationMode, spec.isNighttime);
      fs.writeFileSync(file, transcript, 'utf8');
      const words = transcript.split(/\s+/).length;
      const ann = announcementCount(transcript);
      manifest.stories[spec.slug] = {
        ...entry,
        status: 'text',
        textHash: sha256(transcript),
        words,
        targetWords,
        announcements: ann,
      };
      saveManifest(MANIFEST_FILE, manifest);
      console.log(`${words} words (target ${targetWords}), announcements ${ann}`);
      rows.push([spec.slug, spec.narrationMode, spec.duration, `${words}/${targetWords}`, String(ann), 'ok']);
    } catch (err) {
      const moderation = /CONTENT_MODERATION/.test(String(err?.message));
      manifest.stories[spec.slug] = {
        ...entry,
        status: moderation ? 'failed:text-moderation' : 'failed:text-error',
        error: String(err?.message || err).slice(0, 300),
      };
      saveManifest(MANIFEST_FILE, manifest);
      console.log(moderation ? '🚫 moderation refusal' : `❌ ${err.message}`);
      rows.push([spec.slug, spec.narrationMode, spec.duration, '—', '—', moderation ? 'MODERATION' : 'ERROR']);
    }
  }

  console.log('\nslug                        mode        dur    words        ann  status');
  console.log('─'.repeat(88));
  for (const [slug, mode, dur, words, ann, status] of rows) {
    console.log(`${slug.padEnd(28)}${mode.padEnd(12)}${dur.padEnd(7)}${String(words).padEnd(13)}${String(ann).padEnd(5)}${status}`);
  }
  const failed = rows.filter(([, , , , , s]) => s === 'MODERATION' || s === 'ERROR').length;
  if (args.dryRun) {
    console.log(`\ndry run — ${rows.length} spec(s) selected, nothing generated.`);
  } else {
    console.log(`\n${rows.length - failed}/${rows.length} transcripts ready in ${path.relative(process.cwd(), OUT_DIR)}/`);
    console.log('review/edit the .txt files, then run --phase publish.');
  }
  if (failed) process.exitCode = 1;
}

// ── phase: publish / rerender ───────────────────────────────────────────────
// mode 'publish': stories not yet published → TTS → upload → addDoc.
// mode 'rerender': stories ALREADY published → re-TTS (the cache is keyed by
// transcript+voice+delivery, so a voice change regenerates automatically) →
// re-upload → updateDoc audio fields in place. Use after re-voicing.
async function phasePublishLike(args, manifest, mode) {
  if (!process.env.ELEVENLABS) {
    console.error('missing ELEVENLABS key in env');
    process.exit(1);
  }
  const selected = selectSpecs(args).filter((s) => {
    const st = manifest.stories[s.slug]?.status;
    return mode === 'rerender' ? st === 'published' && manifest.stories[s.slug]?.docId : st !== 'published';
  });
  if (!selected.length) {
    console.log(mode === 'rerender'
      ? 'nothing to rerender — no published stories in the selection.'
      : 'nothing to publish — everything selected is already published.');
    return;
  }

  // Load transcripts + resolve voices up front so the preflight covers everything.
  const jobs = [];
  for (const spec of selected) {
    const file = txtPath(spec.slug);
    if (!fs.existsSync(file)) {
      console.error(`❌ ${spec.slug}: no transcript at ${path.relative(process.cwd(), file)} — run --phase text first`);
      process.exitCode = 1;
      continue;
    }
    const voiceId = resolveVoiceId(spec, manifest);
    if (!voiceId) {
      console.error(`❌ ${spec.slug}: no voice resolved — run --phase narrators (paired) or check specs/voiceOverrides`);
      process.exitCode = 1;
      continue;
    }
    const transcript = fs.readFileSync(file, 'utf8').trim();
    const chunks = enforceHardLimit(splitTextIntoChunks(transcript));
    const tuning = tuningForVoice(voiceId, manifest);
    const prefix = tuning.prefix ?? DELIVERY_PREFIX;
    const settings = tuning.speed ? { speed: tuning.speed } : {};
    const chars = chunks.reduce((s, c) => s + chunkTtsText(c, spec.delivery, prefix).length, 0);
    jobs.push({ spec, transcript, chunks, chars, voiceId, prefix, settings });
  }
  if (!jobs.length) return;

  // Cost preflight — total characters ≈ eleven_v3 credits.
  const cacheKeyFor = (j) => sha256([
    j.transcript,
    j.voiceId,
    j.spec.delivery === 'plain' ? '' : j.prefix,
    JSON.stringify(j.settings),
  ].join('::'));
  const totalChars = jobs.reduce((s, j) => s + j.chars, 0);
  const totalChunks = jobs.reduce((s, j) => s + j.chunks.length, 0);
  console.log(`\n${mode} preflight`);
  console.log('─'.repeat(64));
  for (const j of jobs) {
    const cached = manifest.stories[j.spec.slug]?.ttsHash === cacheKeyFor(j);
    console.log(`${j.spec.slug.padEnd(28)}${String(j.chars).padStart(6)} chars  ${String(j.chunks.length).padStart(2)} chunks  ${j.voiceId.slice(0, 8)}…${cached ? '  (tts cached)' : ''}`);
  }
  console.log('─'.repeat(64));
  console.log(`total: ${jobs.length} stories · ${totalChunks} chunks · ${totalChars} chars ≈ ${totalChars.toLocaleString()} eleven_v3 credits\n`);
  if (args.dryRun) return;
  if (!args.yes) {
    const action = args.ttsOnly ? 'TTS to local previews only (no upload, nothing live changes)' : `TTS + upload + ${mode === 'rerender' ? 'doc update' : 'publish'}`;
    const answer = await ask(`proceed with ${action}? (y/N): `);
    if (!answer.toLowerCase().startsWith('y')) {
      console.log('aborted.');
      return;
    }
  }

  // --tts-only renders and stitches local previews without touching Firebase
  // (no password needed): listen, then re-run without the flag — the cache
  // skips straight to upload.
  const PREVIEW_DIR = path.join(OUT_DIR, 'rerender-previews');
  if (args.ttsOnly) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const { db, storage, uid } = args.ttsOnly ? {} : await firebaseSignIn();

  for (const job of jobs) {
    const { spec, transcript, chunks, voiceId, prefix, settings } = job;
    const slug = spec.slug;
    const entry = manifest.stories[slug] || {};
    const hash = cacheKeyFor(job);
    const dir = path.join(AUDIO_DIR, slug);
    console.log(`\n🎙  ${slug} — ${chunks.length} chunk(s), voice ${voiceId}`);

    // 1. TTS (cache keyed by transcript + voice + delivery prefix)
    const allCached =
      entry.ttsHash === hash &&
      entry.chunkCount === chunks.length &&
      chunks.every((_, i) => fs.existsSync(path.join(dir, `chunk${i}.mp3`)));
    if (!allCached) {
      if (entry.ttsHash && entry.ttsHash !== hash) {
        console.log('   audio inputs changed (text, voice, or delivery) — regenerating audio');
        delete entry.audioChunkURLs;
      }
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      try {
        await mapWithConcurrency(chunks, TTS_CONCURRENCY, async (text, i) => {
          const buf = await retryable(() => ttsChunk(chunkTtsText(text, spec.delivery, prefix), voiceId, process.env.ELEVENLABS, settings), { label: `${slug} chunk${i}`, retries: 5, baseMs: 4000 });
          fs.writeFileSync(path.join(dir, `chunk${i}.mp3`), buf);
          process.stdout.write(`   🎤 chunk ${i} done (${(buf.length / 1024).toFixed(0)} KB)\n`);
        });
      } catch (err) {
        const moderation = /CONTENT_MODERATION/.test(String(err?.message));
        manifest.stories[slug] = { ...entry, status: moderation ? 'failed:tts-moderation' : 'failed:tts-error', error: String(err?.message).slice(0, 300) };
        saveManifest(MANIFEST_FILE, manifest);
        console.log(`   ${moderation ? '🚫 TTS moderation' : `❌ TTS failed: ${err.message}`} — continuing with next story`);
        continue;
      }
      entry.ttsHash = hash;
      entry.chunkCount = chunks.length;
      entry.status = 'tts';
      manifest.stories[slug] = entry;
      saveManifest(MANIFEST_FILE, manifest);
    } else {
      console.log('   ♻️  TTS cache hit');
    }

    if (args.ttsOnly) {
      const stitched = Buffer.concat(chunks.map((_, i) => fs.readFileSync(path.join(dir, `chunk${i}.mp3`))));
      const previewFile = path.join(PREVIEW_DIR, `${slug}.mp3`);
      fs.writeFileSync(previewFile, stitched);
      console.log(`   🎧 preview → ${path.relative(process.cwd(), previewFile)} (${(stitched.length / 16000 / 60).toFixed(1)} min)`);
      continue;
    }

    // 2. Upload (deterministic names → re-runs overwrite instead of orphaning)
    const folder = spec.isNighttime ? 'generated-audio/nighttime' : 'generated-audio/daytime';
    const urls = Array.isArray(entry.audioChunkURLs) ? [...entry.audioChunkURLs] : [];
    let uploadFailed = false;
    for (let i = 0; i < chunks.length; i++) {
      if (urls[i]) continue; // already uploaded for this transcript hash
      const filename = `${uid}-pub-${slug}-chunk${i}.mp3`;
      try {
        const buf = fs.readFileSync(path.join(dir, `chunk${i}.mp3`));
        const storageRef = ref(storage, `${folder}/${filename}`);
        await retryable(() => uploadBytes(storageRef, buf, { contentType: 'audio/mpeg' }), { label: `${slug} upload${i}` });
        await new Promise((r) => setTimeout(r, 300));
        urls[i] = await getDownloadURL(storageRef);
        entry.audioChunkURLs = urls;
        entry.status = 'uploading';
        manifest.stories[slug] = entry;
        saveManifest(MANIFEST_FILE, manifest);
        console.log(`   📤 chunk ${i} uploaded`);
      } catch (err) {
        console.log(`   ❌ upload chunk ${i} failed: ${err.message} — story left resumable`);
        manifest.stories[slug] = { ...entry, status: 'failed:upload', error: String(err?.message).slice(0, 300) };
        saveManifest(MANIFEST_FILE, manifest);
        uploadFailed = true;
        break;
      }
    }
    if (uploadFailed) continue;
    entry.status = 'uploaded';
    manifest.stories[slug] = entry;
    saveManifest(MANIFEST_FILE, manifest);

    // 3. Firestore doc
    try {
      if (mode === 'rerender') {
        await updateDoc(doc(db, 'publicStories', entry.docId), {
          audioUrl: urls[0],
          audioChunkURLs: urls,
          transcript,
          duration: measuredDurationLabel(spec, dir, chunks.length),
        });
        manifest.stories[slug] = { ...entry, status: 'published' };
        saveManifest(MANIFEST_FILE, manifest);
        console.log(`   ✅ re-rendered → publicStories/${entry.docId}`);
      } else {
        const docRef = await addDoc(collection(db, 'publicStories'), {
          title: spec.title,
          genre: spec.genre || null,
          isNighttime: spec.isNighttime,
          duration: measuredDurationLabel(spec, dir, chunks.length),
          audioUrl: urls[0],
          audioChunkURLs: urls,
          transcript,
          narratorId: spec.narratorKey ? manifest.narrators[spec.narratorKey].docId : null,
          narratorName: spec.narratorName || null,
          collection: spec.collection,
          tags: spec.tags,
          libraryCategory: spec.isNighttime ? 'nighttime' : 'daytime',
          coverColor: colorForSpec(spec, COLLECTION_INDEX[slug]),
          topographyLayers: generateDepthLayers(5),
          createdAt: Timestamp.now(),
        });
        manifest.stories[slug] = { ...entry, status: 'published', docId: docRef.id };
        saveManifest(MANIFEST_FILE, manifest);
        console.log(`   ✅ published → publicStories/${docRef.id}`);
      }
    } catch (err) {
      manifest.stories[slug] = { ...entry, status: mode === 'rerender' ? 'published' : 'failed:firestore', error: String(err?.message).slice(0, 300) };
      saveManifest(MANIFEST_FILE, manifest);
      console.log(`   ❌ firestore write failed: ${err.message} — re-run to retry just the doc write`);
      if (mode === 'rerender') process.exitCode = 1;
    }
  }

  // Summary
  console.log(`\n${mode} summary`);
  console.log('─'.repeat(64));
  for (const spec of selected) {
    const st = manifest.stories[spec.slug]?.status || 'pending';
    console.log(`${spec.slug.padEnd(28)}${st}`);
  }
  const bad = selected.filter((s) => (manifest.stories[s.slug]?.status || '').startsWith('failed')).length;
  if (bad) {
    console.log(`\n${bad} story(ies) failed — fix and re-run (state is resumable).`);
    process.exitCode = 1;
  }
}

// ── phase: voices ───────────────────────────────────────────────────────────
// Audition workflow for the whisper voice redesign:
//   1. `--phase voices`                       design previews for every candidate
//      → listen to scripts/public-stories/out/voice-auditions/*.mp3
//   2. `--phase voices --pick dusk:1`         create the permanent voice from a preview
//   3. `--phase voices --assign male=dusk --assign female=veil`
//                                             route one-shot stories to the winners
//   4. `--phase voices --set-narrator grayson=dusk`  (optional, app-wide)
//                                             point a narrator doc at a new voice
const AUDITION_DIR = path.join(OUT_DIR, 'voice-auditions');

async function phaseVoices(args, manifest) {
  manifest.voiceCandidates = manifest.voiceCandidates || {};
  manifest.voices = manifest.voices || {};
  manifest.voiceOverrides = manifest.voiceOverrides || {};

  if (args.pick.length) {
    if (!process.env.ELEVENLABS) { console.error('missing ELEVENLABS key'); process.exit(1); }
    for (const p of args.pick) {
      const [key, idxStr] = p.split(':');
      const idx = parseInt(idxStr ?? '0', 10);
      const cand = VOICE_CANDIDATES.find((c) => c.key === key);
      const designed = manifest.voiceCandidates[key];
      if (!cand || !designed?.previews?.[idx]) {
        console.error(`❌ --pick ${p}: no designed preview — run --phase voices first (keys: ${VOICE_CANDIDATES.map((c) => c.key).join(', ')})`);
        process.exitCode = 1;
        continue;
      }
      if (manifest.voices[key]) {
        console.log(`♻️  ${key} already created → ${manifest.voices[key].voiceId} (delete from manifest.voices to redo)`);
        continue;
      }
      const voiceId = await retryable(
        () => createVoiceFromPreview(cand.name, cand.description, designed.previews[idx].generatedVoiceId, process.env.ELEVENLABS),
        { label: `create ${key}` },
      );
      manifest.voices[key] = { voiceId, name: cand.name, gender: cand.gender, previewIndex: idx };
      saveManifest(MANIFEST_FILE, manifest);
      console.log(`✨ created ${cand.name} from preview ${idx} → ${voiceId}`);
    }
    console.log(`\nnext: --phase voices --assign male=<key> --assign female=<key>, then --phase rerender`);
    return;
  }

  if (args.assign.length) {
    manifest.voiceSlugOverrides = manifest.voiceSlugOverrides || {};
    for (const a of args.assign) {
      const [target, key] = a.split('=');
      const created = manifest.voices[key];
      if (!created) {
        console.error(`❌ --assign ${a}: voice "${key}" not created yet — use --pick first`);
        process.exitCode = 1;
        continue;
      }
      if (['male', 'female'].includes(target)) {
        manifest.voiceOverrides[target] = created.voiceId;
        console.log(`✅ ${target}-voiced one-shots (default) → ${created.name} (${created.voiceId})`);
        continue;
      }
      const spec = SPECS.find((s) => s.slug === target);
      if (!spec) {
        console.error(`❌ --assign ${a}: "${target}" is neither male/female nor a known slug`);
        process.exitCode = 1;
        continue;
      }
      if (spec.narratorKey) {
        console.error(`❌ --assign ${a}: ${target} is narrator-paired (${spec.narratorKey}) — use --set-narrator ${spec.narratorKey}=${key} instead`);
        process.exitCode = 1;
        continue;
      }
      manifest.voiceSlugOverrides[target] = created.voiceId;
      console.log(`✅ ${target} → ${created.name} (${created.voiceId})`);
    }
    saveManifest(MANIFEST_FILE, manifest);
    console.log(`\nnext: --phase rerender (updates the published stories in place), and --phase publish for the rest`);
    return;
  }

  if (args.setNarrator.length) {
    const { db } = await firebaseSignIn();
    for (const s of args.setNarrator) {
      const [nKey, cKey] = s.split('=');
      const narr = manifest.narrators[nKey];
      const created = manifest.voices[cKey];
      if (!narr?.docId) { console.error(`❌ --set-narrator ${s}: narrator "${nKey}" unresolved — run --phase narrators`); process.exitCode = 1; continue; }
      if (!created) { console.error(`❌ --set-narrator ${s}: voice "${cKey}" not created — use --pick first`); process.exitCode = 1; continue; }
      await retryable(() => updateDoc(doc(db, 'publicNarrators', narr.docId), { voiceId: created.voiceId, updatedAt: Timestamp.now() }), { label: `narrator ${nKey}` });
      manifest.narrators[nKey] = { ...narr, voiceId: created.voiceId };
      saveManifest(MANIFEST_FILE, manifest);
      console.log(`✅ narrator ${nKey} now speaks with ${created.name} — note this changes ${nKey} app-wide (user-generated stories too)`);
    }
    console.log(`\nnext: --phase rerender to re-voice that narrator's published stories`);
    return;
  }

  // Design mode: generate audition previews for every candidate.
  if (!process.env.ELEVENLABS) { console.error('missing ELEVENLABS key'); process.exit(1); }
  fs.mkdirSync(AUDITION_DIR, { recursive: true });
  for (const cand of VOICE_CANDIDATES) {
    if (manifest.voiceCandidates[cand.key] && !args.force) {
      console.log(`♻️  ${cand.key}: previews already designed (use --force to redo)`);
      continue;
    }
    if (args.dryRun) { console.log(`would design: ${cand.key} (${cand.gender}) — ${cand.description.slice(0, 60)}…`); continue; }
    process.stdout.write(`🎨 designing ${cand.key} (${cand.gender})… `);
    const previews = await retryable(() => designVoicePreviews(cand.description, AUDITION_TEXT, process.env.ELEVENLABS), { label: `design ${cand.key}` });
    const stored = [];
    previews.forEach((pv, i) => {
      const audio = pv.audio_base_64 || pv.audioBase64;
      if (audio) fs.writeFileSync(path.join(AUDITION_DIR, `${cand.key}-preview${i}.mp3`), Buffer.from(audio, 'base64'));
      stored.push({ generatedVoiceId: pv.generated_voice_id });
    });
    manifest.voiceCandidates[cand.key] = { description: cand.description, previews: stored };
    saveManifest(MANIFEST_FILE, manifest);
    console.log(`${stored.length} previews saved`);
  }
  if (!args.dryRun) {
    console.log(`\n🎧 listen: ${path.relative(process.cwd(), AUDITION_DIR)}/<key>-preview<N>.mp3 — all speak the same passage.`);
    console.log('then: --phase voices --pick <key>:<N> for each winner, --assign male=<key> --assign female=<key>, --phase rerender.');
  }
}

// ── phase: retrofit ─────────────────────────────────────────────────────────
// Push current spec metadata onto already-published docs so live stories stay
// consistent after spec edits (shelf renames, palette changes, tag reworks).
async function phaseRetrofit(args, manifest) {
  const published = selectSpecs(args).filter((s) => manifest.stories[s.slug]?.status === 'published' && manifest.stories[s.slug]?.docId);
  if (!published.length) {
    console.log('no published stories in the manifest — nothing to retrofit.');
    return;
  }

  console.log('retrofit plan');
  console.log('─'.repeat(72));
  const updates = [];
  for (const spec of published) {
    const entry = manifest.stories[spec.slug];
    const dir = path.join(AUDIO_DIR, spec.slug);
    const patch = {
      collection: spec.collection,
      tags: spec.tags,
      coverColor: colorForSpec(spec, COLLECTION_INDEX[spec.slug]),
      genre: spec.genre || null,
      narratorName: spec.narratorName || null,
      libraryCategory: spec.isNighttime ? 'nighttime' : 'daytime',
      duration: measuredDurationLabel(spec, dir, entry.chunkCount || 0),
    };
    updates.push({ spec, docId: entry.docId, patch });
    console.log(`${spec.slug.padEnd(26)} → ${patch.collection.padEnd(14)} ${patch.coverColor}  ${patch.duration.padEnd(7)} [${patch.tags.join(', ')}]`);
  }
  console.log('─'.repeat(72));
  if (args.dryRun) {
    console.log(`dry run — ${updates.length} doc(s) would be updated.`);
    return;
  }
  if (!args.yes) {
    const answer = await ask(`update ${updates.length} live publicStories doc(s)? (y/N): `);
    if (!answer.toLowerCase().startsWith('y')) {
      console.log('aborted.');
      return;
    }
  }

  const { db } = await firebaseSignIn();
  for (const { spec, docId, patch } of updates) {
    try {
      await retryable(() => updateDoc(doc(db, 'publicStories', docId), patch), { label: `retrofit ${spec.slug}` });
      console.log(`✅ ${spec.slug} → publicStories/${docId}`);
    } catch (err) {
      console.log(`❌ ${spec.slug}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  const { count } = validateSpecs();
  console.log(`specs OK — ${count} stories\n`);
  const manifest = loadManifest(MANIFEST_FILE);

  if (args.phase === 'narrators') await phaseNarrators(args, manifest);
  else if (args.phase === 'text') await phaseText(args, manifest);
  else if (args.phase === 'publish') await phasePublishLike(args, manifest, 'publish');
  else if (args.phase === 'rerender') await phasePublishLike(args, manifest, 'rerender');
  else if (args.phase === 'voices') await phaseVoices(args, manifest);
  else if (args.phase === 'retrofit') await phaseRetrofit(args, manifest);

  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
