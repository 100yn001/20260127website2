import { db } from '@/config/firebase';
import { DepthLayer } from '@/types/story';
import { addDoc, collection, Timestamp } from 'firebase/firestore';

export interface PublicStoryPayload {
  title: string;
  genre?: string;
  isNighttime: boolean;
  duration: string;
  audioUrl: string;
  transcript: string;
  narratorId?: string | null;
  libraryCategory: 'daytime' | 'nighttime';
  coverColor?: string;
  topographyLayers?: DepthLayer[];
}

export async function addPublicStory(payload: PublicStoryPayload) {
  const {
    title,
    genre,
    isNighttime,
    duration,
    audioUrl,
    transcript,
    narratorId,
    libraryCategory,
    coverColor,
    topographyLayers,
  } = payload;

  await addDoc(collection(db, 'publicStories'), {
    title: title || 'untitled story',
    genre: genre && genre.trim().length > 0 ? genre : null,
    isNighttime: Boolean(isNighttime),
    duration: duration || '10 min',
    audioUrl,
    transcript,
    narratorId: narratorId || null,
    libraryCategory,
    coverColor: coverColor || null,
    topographyLayers: topographyLayers || null,
    createdAt: Timestamp.now(),
  });
}
