#!/usr/bin/env node
// Uploads local masters into Firebase Storage under masters/… and pins their
// download URLs in artifacts-state.json — push-airtable.mjs turns those into
// click-to-play audio_url / video_url / transcript_url columns.
//
// What gets uploaded per record:
//   audio      yt-pipeline records only (canonical out/<dir>/<slug>.mp3).
//              App-batch/legacy audio already lives in Storage — its URL comes
//              from the live publicStories doc at push-airtable time.
//   video      records with onYoutube.expected: the rendered non-preview mp4
//              in the audio's out dir (stale renders upload too — same path,
//              so a re-render + re-run overwrites in place and refreshes URLs).
//   transcript yt winner.txt / app-batch out/<slug>.txt when present.
//
//   node scripts/audio-db/push-artifacts.mjs [--only <slug>] [--dry-run] [--yes]
//
// Re-runnable: uploads overwrite by path; state is rewritten every run.

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { ask, askHidden, retryable } from '../public-stories/lib.mjs';
import { RECORDS, validateDb } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

const YT_OUT = path.join(__dirname, '../marketing/yt-pipeline/out');
const BATCH_OUT = path.join(__dirname, '../public-stories/out');
const STATE_FILE = path.join(__dirname, 'artifacts-state.json');
const ADMIN_EMAIL = 'ellepotterhead2006@gmail.com';

const args = process.argv.slice(2);
const only = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--only') only.push(args[i + 1]);
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes');

// Which local files belong to a record. The yt dir comes from audioFile when
// set (not-jealous's canon is the v2 dir) and falls back to videoSlug.
function filesFor(r) {
  const files = [];
  const ytDir = r.audioFile ? path.dirname(r.audioFile) : r.onYoutube.videoSlug;
  if (r.origin === 'yt-pipeline' || (r.onYoutube.expected && ytDir)) {
    const audio = r.audioFile
      ? path.join(YT_OUT, r.audioFile)
      : path.join(YT_OUT, ytDir, `${ytDir}.mp3`);
    // yt-bound app records (the-bodyguard) upload their YouTube-safe cut too —
    // the state URL then outranks the live doc's app-cut URL in the sheet.
    if (fs.existsSync(audio)) {
      files.push({ kind: 'audio_url', local: audio, remote: `masters/yt/${ytDir}/${path.basename(audio)}`, type: 'audio/mpeg' });
    }
    const dir = path.join(YT_OUT, ytDir);
    if (r.onYoutube.expected && fs.existsSync(dir)) {
      const mp4 = fs.readdirSync(dir).find((f) => f.endsWith('.mp4') && !f.includes('preview'));
      if (mp4) files.push({ kind: 'video_url', local: path.join(dir, mp4), remote: `masters/yt/${ytDir}/${mp4}`, type: 'video/mp4' });
      const winner = path.join(dir, 'winner.txt');
      if (fs.existsSync(winner)) files.push({ kind: 'transcript_url', local: winner, remote: `masters/transcripts/${r.slug}.txt`, type: 'text/plain' });
    }
  }
  if (r.origin === 'app-batch') {
    const txt = path.join(BATCH_OUT, `${r.slug}.txt`);
    if (fs.existsSync(txt)) files.push({ kind: 'transcript_url', local: txt, remote: `masters/transcripts/${r.slug}.txt`, type: 'text/plain' });
  }
  return files;
}

async function main() {
  validateDb();
  let targets = RECORDS;
  if (only.length) targets = targets.filter((r) => only.includes(r.slug));

  const plan = targets
    .map((r) => ({ r, files: filesFor(r) }))
    .filter((p) => p.files.length);
  let totalBytes = 0;
  for (const { r, files } of plan) {
    for (const f of files) {
      const mb = fs.statSync(f.local).size / 1e6;
      totalBytes += fs.statSync(f.local).size;
      console.log(`${r.slug.padEnd(24)} ${f.kind.replace('_url', '').padEnd(10)} ${mb >= 1 ? mb.toFixed(0) + 'MB' : '<1MB'}  → ${f.remote}`);
    }
  }
  console.log(`\n${plan.length} records, ${(totalBytes / 1e6).toFixed(0)}MB total`);
  if (dryRun) { console.log('dry run — nothing uploaded.'); return; }
  if (!yes) {
    const a = await ask('upload? (y/N): ');
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
  const storage = getStorage(app);
  console.log(`✅ signed in as ${cred.user.uid}\n`);

  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  for (const { r, files } of plan) {
    for (const f of files) {
      const buf = fs.readFileSync(f.local);
      const fileRef = ref(storage, f.remote);
      await retryable(() => uploadBytes(fileRef, buf, { contentType: f.type }), { label: `upload ${r.slug} ${f.kind}` });
      await new Promise((res) => setTimeout(res, 300));
      const url = await getDownloadURL(fileRef);
      state[r.slug] = { ...(state[r.slug] || {}), [f.kind]: url };
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
      console.log(`✅ ${r.slug} ${f.kind.replace('_url', '')} (${(buf.length / 1e6).toFixed(0)}MB)`);
    }
  }
  console.log(`\n✅ done — run push-airtable.mjs to sync the links.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
