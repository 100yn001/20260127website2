import { db } from '@/config/firebase';
import { DepthLayer } from '@/types/story';
import { addDoc, collection, Timestamp } from 'firebase/firestore';

export interface PublicStoryPayload {
  title: string;
  genre?: string;
  isNighttime: boolean;
  duration: string;
  audioUrl: string;
  /** All chunk URLs, in order — the player needs these for multi-chunk playback. */
  audioChunkURLs?: string[];
  transcript: string;
  narratorId?: string | null;
  /** Byline shown on library cards and in the player. */
  narratorName?: string | null;
  /** Shelf name the library groups by; stories without one land in "explore". */
  collection?: string | null;
  /** Curated tags, ordered vibe → hook → audience-exception. */
  tags?: string[];
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
    audioChunkURLs,
    transcript,
    narratorId,
    narratorName,
    collection: shelf,
    tags,
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
    audioChunkURLs: audioChunkURLs && audioChunkURLs.length > 0 ? audioChunkURLs : [audioUrl],
    transcript,
    narratorId: narratorId || null,
    narratorName: narratorName && narratorName.trim() ? narratorName.trim() : null,
    collection: shelf && shelf.trim() ? shelf.trim() : null,
    tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string' && t.trim()) : [],
    libraryCategory,
    coverColor: coverColor || null,
    topographyLayers: topographyLayers || null,
    createdAt: Timestamp.now(),
  });
}
