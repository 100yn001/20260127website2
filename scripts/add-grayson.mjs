import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getFirestore, setDoc, Timestamp } from 'firebase/firestore';
import readline from 'readline';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const askPassword = () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Enter password for ellepotterhead2006@gmail.com: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

const addGrayson = async () => {
  // Sign in as admin
  const password = await askPassword();
  console.log('Signing in...');
  await signInWithEmailAndPassword(auth, 'ellepotterhead2006@gmail.com', password);
  const narratorId = `narrator_grayson_${Date.now()}`;
  const nowTs = Timestamp.now();
  
  const grayson = {
    id: narratorId,
    name: 'Grayson',
    gender: 'male',
    description: 'broad shoulders, short curls, gray eyes, easy smile with dimples',
    relationship: 'boyfriend',
    additionalDetails: `your protective, super golden retriever football player boyfriend. gives you all his jerseys, calls you "princess," "baby girl," "sweetheart," or "my pretty girl," always slides his big hand to the small of your back in crowded places, instinctively walks on the street-side of the sidewalk, quietly does stretching and ice baths after rough practices because he promised he'd take care of himself for you. loves warming your cold hands between his large palms and blowing gentle warm air on them. has your initials secretly written on the inside of his wrist tape.`,
    userNameWithNarrator: 'you',
    userGenderWithNarrator: 'female',
    voiceId: 'fCxG8OHm4STbIsWe4aT9',
    createdAt: nowTs,
    updatedAt: nowTs,
    isPublished: true,
    publishedAt: nowTs,
    publishedBy: 'admin',
    sourcePublicNarratorId: narratorId,
    sourceUserId: 'admin',
    username: 'grayscleats',
    usernameLowercase: 'grayscleats',
  };

  const publicNarratorRef = doc(db, 'publicNarrators', narratorId);
  await setDoc(publicNarratorRef, grayson);
  
  console.log('✅ Grayson added to publicNarrators!');
  console.log('ID:', narratorId);
  process.exit(0);
};

addGrayson().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
