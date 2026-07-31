#!/usr/bin/env node
// Swaps a re-voiced yt audio into its EXISTING publicStories doc in place:
// re-uploads the db record's canonical audioFile over the same storage object
// import-yt.mjs created, refreshes the download URL, and updates the doc's
// audio fields + duration + transcript. Never creates a doc.
//
//   node scripts/audio-db/refresh-yt-audio.mjs --only <slug> [--dry-run] [--yes]
//
// Targets records pinned in state.json (i.e. already imported).

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getFirestore, updateDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { ask, askHidden, retryable } from '../public-stories/lib.mjs';
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
  for (const name of ['winner.txt', 'variant-1.txt']) {
    const f = path.join(YT_OUT, videoSlug, name);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  }
  return '';
}

async function main() {
  validateDb();
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  let targets = RECORDS.filter((r) => r.audioFile && state[r.slug]);
  if (only.length) targets = targets.filter((r) => only.includes(r.slug));
  if (!targets.length) {
    console.log('nothing to refresh — pass --only <slug> for an imported yt audio.');
    return;
  }
  for (const r of targets) {
    const mp3 = path.join(YT_OUT, r.audioFile);
    const mb = fs.existsSync(mp3) ? (fs.statSync(mp3).size / 1e6).toFixed(1) : '✗ missing';
    console.log(`${r.slug.padEnd(22)} ${mb}MB → publicStories/${state[r.slug]}`);
    if (!fs.existsSync(mp3)) process.exitCode = 1;
  }
  if (process.exitCode) return;
  if (dryRun) { console.log('dry run — nothing swapped.'); return; }
  if (!yes) {
    const a = await ask(`swap ${targets.length} app audio(s) in place? (y/N): `);
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
    const storageRef = ref(storage, `generated-audio/daytime/${cred.user.uid}-pub-yt-${r.slug}.mp3`);
    await retryable(() => uploadBytes(storageRef, buf, { contentType: 'audio/mpeg' }), { label: `upload ${r.slug}` });
    await new Promise((res) => setTimeout(res, 300));
    const url = await getDownloadURL(storageRef);
    const minutes = Math.max(1, Math.round(buf.length / 16000 / 60));
    await updateDoc(doc(db, 'publicStories', state[r.slug]), {
      audioUrl: url,
      audioChunkURLs: [url],
      transcript: transcriptFor(r.onYoutube.videoSlug),
      duration: `${minutes} min`,
    });
    console.log(`✅ ${r.slug} swapped in place → publicStories/${state[r.slug]} (${minutes} min)`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
