import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, User } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AlbumSource } from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const OWNER_EMAIL = 'ngoaddis06@gmail.com';

export function isOwnerUser(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export interface SanitizedAlbumPayload {
  ownerUid: string;
  externalId: string;
  source: AlbumSource;
  title: string;
  artist: string;
  releaseYear: string;
  coverUrl: string;
  rating: number;
  thoughts: string;
  favoriteSongs: string[];
  tracklist: string[];
  genres: string[];
  isPublic: boolean;
}

export function sanitizeGenresList(genres?: string[]): string[] {
  if (!Array.isArray(genres)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of genres) {
    const trimmed = String(raw ?? '').trim().slice(0, 60);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(trimmed);
    if (clean.length >= 10) break;
  }
  return clean;
}

export function sanitizeAlbumPayload(input: {
  ownerUid: string;
  externalId: string;
  source: AlbumSource;
  title: string;
  artist: string;
  releaseYear: string;
  coverUrl: string;
  rating: number;
  thoughts: string;
  favoriteSongs: string[];
  tracklist: string[];
  genres?: string[];
}): SanitizedAlbumPayload {
  const cleanExternalId = input.externalId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || `manual_${Date.now()}`;
  const cleanYearMatch = input.releaseYear.match(/\d{4}/);
  const cleanYear = cleanYearMatch ? cleanYearMatch[0] : '';
  const cleanCover = input.coverUrl.trim().slice(0, 500);
  if (!cleanCover.startsWith('https://')) {
    throw new Error('Cover artwork URL must start with https://');
  }

  const clampedRating = Math.max(0, Math.min(100, Math.round(Number(input.rating) || 0)));
  const cleanTitle = input.title.trim().slice(0, 200);
  const cleanArtist = input.artist.trim().slice(0, 200);
  if (!cleanTitle || !cleanArtist) {
    throw new Error('Album title and artist are required.');
  }

  const cleanFavs = input.favoriteSongs
    .map((s) => s.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 20);

  const cleanTracks = input.tracklist
    .map((s) => s.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 100);

  const cleanGenres = sanitizeGenresList(input.genres);

  return {
    ownerUid: input.ownerUid,
    externalId: cleanExternalId,
    source: input.source,
    title: cleanTitle,
    artist: cleanArtist,
    releaseYear: cleanYear,
    coverUrl: cleanCover,
    rating: clampedRating,
    thoughts: input.thoughts.trim().slice(0, 2000),
    favoriteSongs: cleanFavs,
    tracklist: cleanTracks,
    genres: cleanGenres,
    isPublic: true,
  };
}
