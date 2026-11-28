export type AlbumSource = 'spotify' | 'itunes' | 'manual';

export interface CatalogAlbumResult {
  externalId: string;
  source: 'spotify' | 'itunes';
  title: string;
  artist: string;
  releaseYear: string;
  coverUrl: string;
  genres?: string[];
}

export interface AlbumReview {
  id: string;
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
  createdAtMs: number;
  updatedAtMs: number;
}

export type SortMode = 'rating-desc' | 'recent' | 'title-asc';
export type AppView = 'map' | 'analyze' | 'list';
