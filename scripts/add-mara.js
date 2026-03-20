// Run with: node scripts/add-mara.js
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

const EMAIL = 'ellepotterhead@gmail.com';

const mara = {
  name: 'Mara',
  gender: 'female',
  description: 'short and curvy, long orange curls',
  relationship: 'your tavern barmaid',
  additionalDetails: `warm smile, quick hands, and eyes that hold the kingdom in them: torchlight on stone, distant horns on the wind, old victories and older losses. elves whisper she's got fey blood, her pointed ears half-hidden beneath her curls; humans just mutter she's "not to be trifled with." sleeves always rolled, apron stained by years of spilled ale, berry mead, and hearth-smoke. and for wanderers like you, she's got a soft spot she doesn't bother to hide.`,
  userNameWithNarrator: 'wanderer',
  userGenderWithNarrator: 'other',
  voiceId: 'kOvUpYLYS0rKGldsKcD1',
  username: 'mara',
  usernameLowercase: 'mara',
  isPublished: true,
  publishedAt: Timestamp.now(),
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  color: '#992C46',
};

function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    // Hide password input
    process.stdout.write('Enter password for ellepotterhead@gmail.com: ');
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

async function addMara() {
  try {
    const password = await askPassword();
    
    console.log('Signing in...');
    await signInWithEmailAndPassword(auth, EMAIL, password);
    console.log('✓ Signed in successfully');
    
    console.log('Adding Mara to publicNarrators...');
    const docRef = await addDoc(collection(db, 'publicNarrators'), mara);
    console.log('✓ Mara added with ID:', docRef.id);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addMara();
