#!/usr/bin/env node
// Consolidates legacy shelf names so the library never shows near-duplicate
// shelves. Today that's the hand-promoted-era "bedtime stories" shelf
// (goldilocks, beauty-and-the-beast) folding into the batch-era "bedtime".
//
//   node scripts/audio-db/consolidate-shelves.mjs [--dry-run] [--yes]
//
// Idempotent: only docs whose collection matches a MERGES key are touched.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, query, updateDoc, where } from 'firebase/firestore';
import { ask, askHidden } from '../public-stories/lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

const ADMIN_EMAIL = 'ellepotterhead2006@gmail.com';
const MERGES = {
  'bedtime stories': 'bedtime',
};

const dryRun = process.argv.includes('--dry-run');
const yes = process.argv.includes('--yes');

async function main() {
  const app = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  const db = getFirestore(app);

  const targets = [];
  for (const [from, to] of Object.entries(MERGES)) {
    const snap = await getDocs(query(collection(db, 'publicStories'), where('collection', '==', from)));
    for (const d of snap.docs) targets.push({ id: d.id, title: d.data().title, from, to });
  }

  if (!targets.length) {
    console.log('nothing to consolidate — no docs on a legacy shelf.');
    return;
  }
  for (const t of targets) console.log(`${t.id}  ${JSON.stringify(t.title)}  "${t.from}" → "${t.to}"`);
  if (dryRun) {
    console.log(`\ndry run — ${targets.length} doc(s) would be updated.`);
    return;
  }
  if (!yes) {
    const a = await ask(`\nupdate ${targets.length} doc(s)? (y/N): `);
    if (!a.toLowerCase().startsWith('y')) {
      console.log('aborted.');
      return;
    }
  }

  const auth = getAuth(app);
  const password = process.env.YN_ADMIN_PASSWORD || (await askHidden(`Enter password for ${ADMIN_EMAIL}: `));
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  console.log(`✅ signed in as ${cred.user.uid}\n`);

  for (const t of targets) {
    await updateDoc(doc(db, 'publicStories', t.id), { collection: t.to });
    console.log(`✅ ${t.id} → "${t.to}"`);
  }
  console.log('\nrun scripts/audio-db/check.mjs to refresh the database reports.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
