#!/usr/bin/env node
/**
 * Quick diagnostic: check Firestore story docs and test if audio URLs work
 */
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, getFirestore, limit, orderBy, query, where } from 'firebase/firestore';

dotenv.config();

const app = initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
});

const db = getFirestore(app);
const auth = getAuth(app);

const EMAIL = 'ellepotterhead2006@gmail.com';
const PASSWORD = process.env.USER_PASSWORD || '';

async function main() {
  // Sign in
  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const userId = cred.user.uid;
  console.log('✅ Signed in as:', userId);

  // Fetch latest 5 stories
  const q = query(
    collection(db, 'stories'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  
  const snap = await getDocs(q);
  console.log(`\n📚 Found ${snap.size} recent stories\n`);

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log('─'.repeat(70));
    console.log(`Story ID:        ${doc.id}`);
    console.log(`Title:           ${data.title || '(none)'}`);
    console.log(`Created:         ${data.createdAt?.toDate?.()}`);
    console.log(`audioUrl:        ${data.audioUrl || '❌ MISSING'}`);
    console.log(`audioUrl type:   ${typeof data.audioUrl}`);
    
    // Show audioChunkURLs in detail
    if (Array.isArray(data.audioChunkURLs)) {
      console.log(`audioChunkURLs:  [${data.audioChunkURLs.length} URLs]`);
      data.audioChunkURLs.forEach((url, i) => {
        console.log(`  chunk[${i}]:     ${url}`);
      });
      // Check if audioUrl === first chunk
      console.log(`audioUrl === chunk[0]: ${data.audioUrl === data.audioChunkURLs[0]}`);
    } else {
      console.log(`audioChunkURLs:  ❌ MISSING (value: ${JSON.stringify(data.audioChunkURLs)})`);
    }
    
    // Simulate what navigation params would look like
    const simChunks = data.audioChunkURLs || [];
    const jsonStr = simChunks.length > 0 ? JSON.stringify(simChunks) : '';
    console.log(`\nNav param simulation:`);
    console.log(`  JSON.stringify length: ${jsonStr.length} chars`);
    console.log(`  JSON.parse back:      ${jsonStr ? JSON.parse(jsonStr).length + ' URLs' : 'empty'}`);
    
    // All field names
    console.log(`\nAll fields:      ${Object.keys(data).sort().join(', ')}`);
    
    // Test EACH chunk URL
    const urlsToTest = Array.isArray(data.audioChunkURLs) && data.audioChunkURLs.length > 0
      ? data.audioChunkURLs
      : data.audioUrl ? [data.audioUrl] : [];
    
    for (let i = 0; i < urlsToTest.length; i++) {
      try {
        const resp = await fetch(urlsToTest[i], { method: 'HEAD' });
        const ct = resp.headers.get('content-type');
        const cl = resp.headers.get('content-length');
        const sizeMB = cl ? (parseInt(cl) / 1024).toFixed(1) + ' KB' : '?';
        console.log(`  URL[${i}] test:  ${resp.status} | ${ct} | ${sizeMB}`);
      } catch (e) {
        console.log(`  URL[${i}] test:  ❌ FAILED - ${e.message}`);
      }
    }
    console.log('');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
