import { db } from '@/config/firebase';
import { Narrator, PublicNarrator } from '@/types/narrator';
import { collection, doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const publicNarratorsCollection = collection(db, 'publicNarrators');

const removeUndefinedFields = <T extends Record<string, any>>(obj: T) => {
  const cleaned: Record<string, any> = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  return cleaned as T;
};

const ensureDate = (value?: Date | { toDate?: () => Date } | null): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date(value as any);
};

const ensureTimestamp = (value?: Date | { toDate?: () => Date } | null): Timestamp => {
  if (!value) return Timestamp.now();
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return Timestamp.fromDate(value.toDate());
  }
  return Timestamp.fromDate(new Date(value as any));
};

export async function publishNarratorToLibrary(
  narrator: Narrator,
  adminIdentifier: string,
  username: string
) {
  if (!narrator.id || !narrator.userId) {
    throw new Error('Narrator is missing required identifiers.');
  }

  if (!username || username.length < 3) {
    throw new Error('Username is required and must be at least 3 characters.');
  }

  const normalizedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

  const publishedAtTs = Timestamp.now();
  const publicNarratorRef = doc(publicNarratorsCollection, narrator.id);

  const payload: PublicNarrator = {
    id: narrator.id,
    name: narrator.name,
    gender: narrator.gender,
    customGender: narrator.customGender,
    description: narrator.description,
    relationship: narrator.relationship,
    additionalDetails: narrator.additionalDetails,
    userNameWithNarrator: narrator.userNameWithNarrator,
    userGenderWithNarrator: narrator.userGenderWithNarrator,
    userCustomGenderWithNarrator: narrator.userCustomGenderWithNarrator,
    voiceId: narrator.voiceId,
    voicePreviewAudio: narrator.voicePreviewAudio,
    createdAt: ensureDate(narrator.createdAt),
    updatedAt: new Date(),
    isPublished: true,
    publishedAt: publishedAtTs.toDate(),
    publishedBy: adminIdentifier,
    sourcePublicNarratorId: narrator.sourcePublicNarratorId || narrator.id,
    sourceUserId: narrator.sourceUserId || narrator.userId,
    username: normalizedUsername,
    usernameLowercase: normalizedUsername,
  };

  await setDoc(
    publicNarratorRef,
    removeUndefinedFields({
      ...payload,
      createdAt: ensureTimestamp(narrator.createdAt),
      updatedAt: Timestamp.now(),
      publishedAt: publishedAtTs,
    }),
    { merge: true }
  );

  await updateDoc(doc(db, 'users', narrator.userId, 'narrators', narrator.id), {
    isPublished: true,
    publishedAt: publishedAtTs,
    publishedBy: adminIdentifier,
    sourcePublicNarratorId: payload.sourcePublicNarratorId,
    username: normalizedUsername,
    usernameLowercase: normalizedUsername,
  });
}

interface CloneOptions {
  userNameOverride?: string;
  voiceIdOverride?: string;
}

export async function clonePublicNarratorToUser(
  publicNarrator: PublicNarrator,
  userId: string,
  options: CloneOptions = {}
) {
  const narratorId = `narrator_${Date.now()}`;
  const nowTs = Timestamp.now();
  const narratorRef = doc(db, 'users', userId, 'narrators', narratorId);

  const clonedNarrator: Narrator = {
    id: narratorId,
    userId,
    name: publicNarrator.name,
    gender: publicNarrator.gender,
    customGender: publicNarrator.customGender,
    description: publicNarrator.description,
    relationship: publicNarrator.relationship,
    additionalDetails: publicNarrator.additionalDetails,
    userNameWithNarrator: options.userNameOverride?.trim()?.length
      ? options.userNameOverride.trim()
      : publicNarrator.userNameWithNarrator,
    userGenderWithNarrator: publicNarrator.userGenderWithNarrator,
    userCustomGenderWithNarrator: publicNarrator.userCustomGenderWithNarrator,
    voiceId: options.voiceIdOverride ?? publicNarrator.voiceId,
    voicePreviewAudio: publicNarrator.voicePreviewAudio,
    color: publicNarrator.color,
    createdAt: nowTs.toDate(),
    updatedAt: nowTs.toDate(),
    isPublished: false,
    publishedAt: null,
    publishedBy: null,
    sourcePublicNarratorId: publicNarrator.id,
    sourceUserId: publicNarrator.sourceUserId,
  };

  await setDoc(
    narratorRef,
    removeUndefinedFields({
      ...clonedNarrator,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
  );

  return clonedNarrator;
}
