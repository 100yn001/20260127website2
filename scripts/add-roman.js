// Run with: node scripts/add-roman.js
// Will prompt for password to authenticate

require('dotenv').config();
const readline = require('readline');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, addDoc, Timestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL = 'ellepotterhead2006@gmail.com';

const roman = {
  name: 'Roman',
  gender: 'male',
  description: 'grey eyes, strong jaw',
  relationship: 'your older, steel-edged CEO',
  additionalDetails: `he's all charcoal suits, crisp white shirts and heavy watches. he handles things: sends the driver, books the jet, clears his schedule the moment you sound tired. that silk tie he wore to the gala? it's in his pocket by the end of the night, ready to loop around your wrists the second you get home.`,
  userNameWithNarrator: 'darling',
  userGenderWithNarrator: 'other',
  voiceId: 'goT3UYdM9bhm0n2lmKQx',
  username: 'roman',
  usernameLowercase: 'roman',
  isPublished: true,
  publishedAt: Timestamp.now(),
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  color: '#9795A9',
};

function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    // Hide password input
    process.stdout.write('Enter password for ellepotterhead2006@gmail.com: ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    let password = '';
    process.stdin.on('data', (char) => {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        process.stdin.setRawMode(false);
        console.log('');
        rl.close();
        resolve(password);
      } else if (char === '\u0003') {
        process.exit();
      } else if (char === '\u007F') {
        password = password.slice(0, -1);
      } else {
        password += char;
      }
    });
  });
}

async function addRoman() {
  try {
    const password = await askPassword();
    
    console.log('Signing in...');
    await signInWithEmailAndPassword(auth, EMAIL, password);
    console.log('✓ Signed in successfully');
    
    console.log('Adding Roman to publicNarrators...');
    const docRef = await addDoc(collection(db, 'publicNarrators'), roman);
    console.log('✓ Roman added with ID:', docRef.id);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addRoman();
