#!/usr/bin/env node
// Imports yt-pipeline audios into the app library (publicStories) so the
// YouTube ⊆ app invariant holds. Uploads the canonical mp3 (db record's
// audioFile) + the winner transcript, writes the doc with the record's
// shelf/tags, and pins the docId in state.json (read by check.mjs).
//
//   node scripts/audio-db/import-yt.mjs [--only <slug>] [--dry-run] [--yes]
//
// Idempotent: slugs already in state.json are skipped.

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, getFirestore, Timestamp } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { ask, askHidden, generateDepthLayers, retryable } from '../public-stories/lib.mjs';
import { COLLECTION_COLORS } from '../public-stories/specs.mjs';
import { RECORDS, validateDb } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

const YT_OUT = path.join(__dirname, '../marketing/yt-pipeline/out');
const STATE_FILE = path.join(__dirname, 'state.json');
const ADMIN_EMAIL = 'ellepotterhead2006@gmail.com';

const args = process.argv.slice(2);
const only = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--only') only.push(args[i + 1]);
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes');

function transcriptFor(videoSlug) {
  const dir = path.join(YT_OUT, videoSlug);
  for (const name of ['winner.txt', 'variant-1.txt']) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  }
  const cues = path.join(dir, 'cues.json');
  if (fs.existsSync(cues)) {
    try {
      return JSON.parse(fs.readFileSync(cues, 'utf8')).map((c) => c.text).join('\n');
    } catch { /* fall through */ }
  }
  return '';
}

async function main() {
  validateDb();
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

  let targets = RECORDS.filter((r) => r.origin === 'yt-pipeline' && r.inApp.expected);
  if (only.length) targets = targets.filter((r) => only.includes(r.slug));
  targets = targets.filter((r) => !state[r.slug]);
  if (!targets.length) {
    console.log('nothing to import — all yt audios are already in state.json.');
    return;
  }

  for (const r of targets) {
    const mp3 = path.join(YT_OUT, r.audioFile);
    const transcript = transcriptFor(r.onYoutube.videoSlug);
    const okFiles = fs.existsSync(mp3) && transcript.length > 0;
    console.log(`${r.slug.padEnd(22)} ${okFiles ? '✓' : '✗'} audio:${path.relative(process.cwd(), mp3)} transcript:${transcript.length} chars → shelf "${r.shelf}", tags [${r.tags.join(', ')}]`);
    if (!okFiles) {
      console.error(`   missing audio or transcript — fix before importing`);
      process.exitCode = 1;
    }
  }
  if (process.exitCode) return;
  if (dryRun) { console.log('\ndry run — nothing imported.'); return; }
  if (!yes) {
    const a = await ask(`import ${targets.length} yt audio(s) into publicStories? (y/N): `);
    if (!a.toLowerCase().startsWith('y')) { console.log('aborted.'); return; }
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
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  const db = getFirestore(app);
  const storage = getStorage(app);
  console.log(`✅ signed in as ${cred.user.uid}\n`);

  for (const r of targets) {
    const buf = fs.readFileSync(path.join(YT_OUT, r.audioFile));
    const transcript = transcriptFor(r.onYoutube.videoSlug);
    const folder = 'generated-audio/daytime';
    const filename = `${cred.user.uid}-pub-yt-${r.slug}.mp3`;
    const storageRef = ref(storage, `${folder}/${filename}`);
    await retryable(() => uploadBytes(storageRef, buf, { contentType: 'audio/mpeg' }), { label: `upload ${r.slug}` });
    await new Promise((res) => setTimeout(res, 300));
    const url = await getDownloadURL(storageRef);
    const minutes = Math.max(1, Math.round(buf.length / 16000 / 60));
    const palette = COLLECTION_COLORS[r.shelf] || ['#313E5E'];

    const docRef = await addDoc(collection(db, 'publicStories'), {
      title: r.title,
      genre: 'romance',
      isNighttime: false,
      duration: `${minutes} min`,
      audioUrl: url,
      audioChunkURLs: [url],
      transcript,
      narratorId: null,
      narratorName: null,
      collection: r.shelf,
      tags: r.tags,
      libraryCategory: 'daytime',
      coverColor: palette[0],
      topographyLayers: generateDepthLayers(5),
      createdAt: Timestamp.now(),
    });
    state[r.slug] = docRef.id;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    console.log(`✅ ${r.slug} → publicStories/${docRef.id} (${minutes} min)`);
  }
  console.log('\nrun scripts/audio-db/check.mjs to refresh the database reports.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
