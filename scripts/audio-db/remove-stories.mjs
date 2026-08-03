#!/usr/bin/env node
// Un-publishes stories from the public library: deletes the publicStories doc
// for records pinned in db.mjs (inApp.docId). Storage audio is NOT touched —
// the mp3s stay as archival copies; only the library listing disappears.
//
//   node scripts/audio-db/remove-stories.mjs --only <slug> [--only <slug>…] [--dry-run] [--yes]
//
// After running: mark the record inApp.expected=false in db.mjs (or delete
// it), then check.mjs + push-airtable.mjs to refresh the reports.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore } from 'firebase/firestore';
import { ask, askHidden } from '../public-stories/lib.mjs';
import { RECORDS } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

const ADMIN_EMAIL = 'ellepotterhead2006@gmail.com';
const args = process.argv.slice(2);
const only = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--only') only.push(args[i + 1]);
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes');

async function main() {
  if (!only.length) {
    console.error('refusing to run without an explicit --only <slug> selection.');
    process.exit(1);
  }
  const targets = RECORDS.filter((r) => only.includes(r.slug));
  const missing = only.filter((s) => !targets.some((r) => r.slug === s));
  if (missing.length) {
    console.error(`unknown slug(s): ${missing.join(', ')}`);
    process.exit(1);
  }
  for (const r of targets) {
    if (!r.inApp.docId) {
      console.error(`${r.slug}: no pinned docId in db.mjs — refusing to guess.`);
      process.exit(1);
    }
  }

  const app = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  const db = getFirestore(app);

  // Show what would actually be deleted (live title), then confirm.
  for (const r of targets) {
    const snap = await getDoc(doc(db, 'publicStories', r.inApp.docId));
    const live = snap.exists() ? JSON.stringify(snap.data().title) : '(already gone)';
    console.log(`${r.slug.padEnd(24)} publicStories/${r.inApp.docId}  ${live}`);
  }
  if (dryRun) {
    console.log('\ndry run — nothing deleted.');
    return;
  }
  if (!yes) {
    const a = await ask(`\ndelete ${targets.length} doc(s) from the public library? (y/N): `);
    if (!a.toLowerCase().startsWith('y')) {
      console.log('aborted.');
      return;
    }
  }

  const auth = getAuth(app);
  const password = process.env.YN_ADMIN_PASSWORD || (await askHidden(`Enter password for ${ADMIN_EMAIL}: `));
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  console.log(`✅ signed in as ${cred.user.uid}\n`);

  for (const r of targets) {
    await deleteDoc(doc(db, 'publicStories', r.inApp.docId));
    console.log(`🗑  ${r.slug} removed (doc ${r.inApp.docId}; storage audio kept)`);
  }
  console.log('\nnow mark the records removed in db.mjs, then run check.mjs + push-airtable.mjs.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
