import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
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

const STATIC_VOICES = [
  { id: 'LEnmbrrxYsUYS7vsRRwD', accent: 'American', gender: 'female', descriptors: 'intimate, velvety' },
  { id: 'Qe9WSybioZxssVEwlBSo', accent: 'British', gender: 'male', descriptors: 'smooth, calming' },
  { id: 'adZJnAl6IYZw4EYI9FVd', accent: 'British', gender: 'male', descriptors: 'deep, mysterious' },
  { id: 'qAZH0aMXY8tw1QufPN0D', accent: 'American', gender: 'male', descriptors: 'calm, authoritative' },
  { id: '2gPFXx8pN3Avh27Dw5Ma', accent: 'American', gender: 'male', descriptors: 'deep, commanding' },
  { id: 'fCxG8OHm4STbIsWe4aT9', accent: 'American', gender: 'male', descriptors: 'deep, velvety' },
  { id: 'HZTk7bUIkiI7yT7FKH4h', accent: 'Australian', gender: 'male', descriptors: 'deep, soothing' },
  { id: 'iIg0uI51lssRFauz7W21', accent: 'Australian', gender: 'male', descriptors: 'young, calm' },
  { id: 'NihRgaLj2HWAjvZ5XNxl', accent: 'Australian', gender: 'female', descriptors: 'sweet, young' },
  { id: '5TZtQYDIn8M40udRnoVI', accent: 'Australian', gender: 'female', descriptors: 'warm, calm' },
  { id: 'mgpcWiEXIWuENJCy8ADX', accent: 'American', gender: 'female', descriptors: 'gentle, warm' },
  { id: 'WxqqAhUiswIRQNTBz2a5', accent: 'American', gender: 'female', descriptors: 'whispery, smooth' },
  { id: 'BpjGufoPiobT79j2vtj4', accent: 'British', gender: 'female', descriptors: 'velvety, laid-back' },
  { id: 'rWArYo7a2NWuBYf5BE4V', accent: 'British', gender: 'female', descriptors: 'sweet, young' },
  { id: 'QBKybXDLvDJ91ojuRiOU', accent: 'American', gender: 'neutral', descriptors: 'calm, laid-back' },
  { id: 'B5jEZPqk2OJ2vkPw3wBM', accent: 'Irish', gender: 'male', descriptors: 'deep, laid-back' },
  { id: 'dtVZnErhiiosqofxDzSH', accent: 'American (southern)', gender: 'male', descriptors: 'drawly, deep' },
];

const askPassword = () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Enter password for ellepotterhead2006@gmail.com: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

const seedStaticVoices = async () => {
  const password = await askPassword();
  console.log('Signing in...');
  await signInWithEmailAndPassword(auth, 'ellepotterhead2006@gmail.com', password);

  console.log(`Seeding ${STATIC_VOICES.length} static voices...`);

  for (const voice of STATIC_VOICES) {
    const ref = doc(db, 'staticVoices', voice.id);
    await setDoc(ref, {
      id: voice.id,
      accent: voice.accent,
      gender: voice.gender,
      descriptors: voice.descriptors,
    });
    console.log(`  ✅ ${voice.accent} ${voice.gender} — ${voice.descriptors}`);
  }

  console.log(`\n✅ All ${STATIC_VOICES.length} static voices seeded to 'staticVoices' collection!`);
  process.exit(0);
};

seedStaticVoices().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
