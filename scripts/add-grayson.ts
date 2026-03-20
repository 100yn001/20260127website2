import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const addGrayson = async () => {
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
    voiceId: 'fCxG8OHm4STbIsWe4aT9', // American male, deep, velvety
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
};

addGrayson().catch(console.error);
