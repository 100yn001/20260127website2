import { db } from '@/config/firebase';
import { Voice } from '@/types/voice';
import { collection, getDocs } from 'firebase/firestore';

// Fallback voices used when Firestore fetch fails (e.g. offline).
const FALLBACK_VOICES: Voice[] = [
  { id: 'LEnmbrrxYsUYS7vsRRwD', accent: 'American', gender: 'female', descriptors: ['intimate', 'velvety'] },
  { id: 'Qe9WSybioZxssVEwlBSo', accent: 'British', gender: 'male', descriptors: ['smooth', 'calming'] },
  { id: 'adZJnAl6IYZw4EYI9FVd', accent: 'British', gender: 'male', descriptors: ['deep', 'mysterious'] },
  { id: 'qAZH0aMXY8tw1QufPN0D', accent: 'American', gender: 'male', descriptors: ['calm', 'authoritative'] },
  { id: '2gPFXx8pN3Avh27Dw5Ma', accent: 'American', gender: 'male', descriptors: ['deep', 'commanding'] },
  { id: 'fCxG8OHm4STbIsWe4aT9', accent: 'American', gender: 'male', descriptors: ['deep', 'velvety'] },
  { id: 'HZTk7bUIkiI7yT7FKH4h', accent: 'Australian', gender: 'male', descriptors: ['deep', 'soothing'] },
  { id: 'iIg0uI51lssRFauz7W21', accent: 'Australian', gender: 'male', descriptors: ['young', 'calm'] },
  { id: 'NihRgaLj2HWAjvZ5XNxl', accent: 'Australian', gender: 'female', descriptors: ['sweet', 'young'] },
  { id: '5TZtQYDIn8M40udRnoVI', accent: 'Australian', gender: 'female', descriptors: ['warm', 'calm'] },
  { id: 'mgpcWiEXIWuENJCy8ADX', accent: 'American', gender: 'female', descriptors: ['gentle', 'warm'] },
  { id: 'WxqqAhUiswIRQNTBz2a5', accent: 'American', gender: 'female', descriptors: ['whispery', 'smooth'] },
  { id: 'BpjGufoPiobT79j2vtj4', accent: 'British', gender: 'female', descriptors: ['velvety', 'laid-back'] },
  { id: 'rWArYo7a2NWuBYf5BE4V', accent: 'British', gender: 'female', descriptors: ['sweet', 'young'] },
  { id: 'QBKybXDLvDJ91ojuRiOU', accent: 'American', gender: 'neutral', descriptors: ['calm', 'laid-back'] },
  { id: 'B5jEZPqk2OJ2vkPw3wBM', accent: 'Irish', gender: 'male', descriptors: ['deep', 'laid-back'] },
  { id: 'dtVZnErhiiosqofxDzSH', accent: 'American (southern)', gender: 'male', descriptors: ['drawly', 'deep'] },
];

// Fetch static voices from Firestore 'staticVoices' collection.
// Falls back to hardcoded list if the fetch fails.
export async function fetchStaticVoices(): Promise<Voice[]> {
  try {
    console.log('🔍 Fetching staticVoices from Firestore...');
    const snapshot = await getDocs(collection(db, 'staticVoices'));
    console.log(`🔍 Got ${snapshot.size} docs from staticVoices`);
    if (snapshot.empty) {
      console.warn('⚠️ staticVoices collection is empty, using fallback');
      return FALLBACK_VOICES;
    }
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.id || doc.id,
        accent: data.accent || '',
        gender: data.gender || 'neutral',
        descriptors: Array.isArray(data.descriptors) ? data.descriptors : [],
      } as Voice;
    });
  } catch (error) {
    console.error('❌ Failed to fetch static voices from Firestore:', error);
    return FALLBACK_VOICES;
  }
}
