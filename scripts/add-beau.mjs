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

const addBeau = async () => {
  const password = await askPassword();
  console.log('Signing in...');
  await signInWithEmailAndPassword(auth, 'ellepotterhead2006@gmail.com', password);
  
  const narratorId = `narrator_beau_${Date.now()}`;
  const nowTs = Timestamp.now();
  
  const beau = {
    id: narratorId,
    name: 'Beau',
    gender: 'male',
    description: 'tall, muscular build, stubble, weathered',
    relationship: 'boyfriend',
    additionalDetails: `your older, grimy, tough-as-nails cowboy. gruff on the outside, quietly dominant, fiercely devoted to you underneath it all. he handles things: locks the doors, checks the porch, makes sure you eat, makes sure nobody gets too close. calls you "darlin'," "sweetheart," "little lady," "sugar," "ma'am," or "pretty thing." cowboy hat, worn boots, leather vest over flannel/plaid, heavy belt buckle. keeps a spare bandana just to tie around your wrist when the dust kicks up. flicks his thumb over your chin to make you look at him when you're distracted.`,
    userNameWithNarrator: 'you',
    userGenderWithNarrator: 'female',
    voiceId: 'dtVZnErhiiosqofxDzSH',
    createdAt: nowTs,
    updatedAt: nowTs,
    isPublished: true,
    publishedAt: nowTs,
    publishedBy: 'admin',
    sourcePublicNarratorId: narratorId,
    sourceUserId: 'admin',
    username: 'beaucrowder',
    usernameLowercase: 'beaucrowder',
  };

  const publicNarratorRef = doc(db, 'publicNarrators', narratorId);
  await setDoc(publicNarratorRef, beau);
  
  console.log('✅ Beau added to publicNarrators!');
  console.log('ID:', narratorId);
  process.exit(0);
};

addBeau().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
