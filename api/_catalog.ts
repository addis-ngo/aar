import { Router } from 'express';

export interface CatalogAlbum {
  externalId: string;
  source: 'spotify' | 'itunes';
  title: string;
  artist: string;
  releaseYear: string;
  coverUrl: string;
  genres: string[];
}

interface SpotifyTokenCache {
  token: string;
  expiresAt: number;
}

let spotifyTokenCache: SpotifyTokenCache | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  if (spotifyTokenCache && spotifyTokenCache.expiresAt > now + 30_000) {
    return spotifyTokenCache.token;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed (${response.status})`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Spotify token response missing access_token');
  }

  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return spotifyTokenCache.token;
}

function sanitizeId(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
}

function sanitizeYear(raw: unknown): string {
  const match = String(raw ?? '').match(/\d{4}/);
  return match ? match[0] : '';
}

function sanitizeHttpsUrl(raw: unknown): string {
  const url = String(raw ?? '').trim();
  if (!url.startsWith('https://')) {
    return '';
  }
  return url.slice(0, 500);
}

const UPPERCASE_GENRE_TOKENS = new Set([
  'r&b',
  'edm',
  'uk',
  'us',
  'id',
  'idm',
  'mpb',
  'ost',
  'k-pop',
  'j-pop',
  'c-pop',
  'lo-fi',
]);

function formatGenreLabel(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'r&b') return 'R&B';
      if (lower === 'k-pop') return 'K-Pop';
      if (lower === 'j-pop') return 'J-Pop';
      if (lower === 'lo-fi') return 'Lo-Fi';
      if (UPPERCASE_GENRE_TOKENS.has(lower)) return word.toUpperCase();
      return word
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join('-');
    })
    .join(' ')
    .slice(0, 60);
}

function normalizeGenres(rawList: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const formatted = formatGenreLabel(item);
    if (!formatted) continue;
    const key = formatted.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(formatted);
    if (result.length >= 10) break;
  }
  return result;
}

async function searchSpotifyAlbums(query: string, token: string): Promise<CatalogAlbum[]> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=10`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Spotify search failed (${response.status})${errBody ? `: ${errBody}` : ''}`);
  }

  const data = (await response.json()) as {
    albums?: {
      items?: Array<{
        id?: string;
        name?: string;
        artists?: Array<{ name?: string }>;
        release_date?: string;
        images?: Array<{ url?: string; width?: number }>;
      }>;
    };
  };

  const items = data.albums?.items ?? [];
  return items
    .map((item): CatalogAlbum | null => {
      const externalId = sanitizeId(item.id);
      const title = String(item.name ?? '').trim().slice(0, 200);
      const artist = (item.artists ?? [])
        .map((a) => a.name?.trim())
        .filter(Boolean)
        .join(', ')
        .slice(0, 200);
      const sortedImages = [...(item.images ?? [])].sort(
        (a, b) => (b.width ?? 0) - (a.width ?? 0)
      );
      const coverUrl = sanitizeHttpsUrl(sortedImages[0]?.url);
      if (!externalId || !title || !artist || !coverUrl) {
        return null;
      }
      return {
        externalId,
        source: 'spotify',
        title,
        artist,
        releaseYear: sanitizeYear(item.release_date),
        coverUrl,
        genres: [],
      };
    })
    .filter((album): album is CatalogAlbum => album !== null);
}

async function searchItunesAlbums(query: string): Promise<CatalogAlbum[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=12`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Catalog search failed (${response.status})`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      collectionId?: number;
      collectionName?: string;
      artistName?: string;
      releaseDate?: string;
      artworkUrl100?: string;
      primaryGenreName?: string;
    }>;
  };

  const results = data.results ?? [];
  return results
    .map((item): CatalogAlbum | null => {
      const externalId = sanitizeId(item.collectionId);
      const title = String(item.collectionName ?? '').trim().slice(0, 200);
      const artist = String(item.artistName ?? '').trim().slice(0, 200);
      const highResArtwork = String(item.artworkUrl100 ?? '')
        .replace('http://', 'https://')
        .replace('100x100bb.jpg', '600x600bb.jpg');
      const coverUrl = sanitizeHttpsUrl(highResArtwork);
      if (!externalId || !title || !artist || !coverUrl) {
        return null;
      }
      return {
        externalId,
        source: 'itunes',
        title,
        artist,
        releaseYear: sanitizeYear(item.releaseDate),
        coverUrl,
        genres: normalizeGenres([item.primaryGenreName]),
      };
    })
    .filter((album): album is CatalogAlbum => album !== null);
}

async function fetchSpotifyTracks(externalId: string, token: string): Promise<string[]> {
  const tracks: string[] = [];
  let nextUrl: string | null = `https://api.spotify.com/v1/albums/${encodeURIComponent(externalId)}/tracks?limit=10`;
  let pages = 0;

  while (nextUrl && tracks.length < 100 && pages < 10) {
    if (!nextUrl.startsWith('https://api.spotify.com/')) {
      break;
    }
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(
        `Spotify tracks request failed (${response.status})${errBody ? `: ${errBody}` : ''}`
      );
    }
    const data = (await response.json()) as {
      items?: Array<{ name?: string }>;
      next?: string | null;
    };
    for (const track of data.items ?? []) {
      const name = String(track.name ?? '').trim().slice(0, 160);
      if (name) {
        tracks.push(name);
      }
      if (tracks.length >= 100) break;
    }
    nextUrl = typeof data.next === 'string' ? data.next : null;
    pages += 1;
  }

  return tracks;
}

async function fetchSpotifyGenresForAlbum(
  externalId: string,
  token: string
): Promise<{ genres: string[]; title?: string; artist?: string }> {
  try {
    const albumRes = await fetch(
      `https://api.spotify.com/v1/albums/${encodeURIComponent(externalId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!albumRes.ok) {
      return { genres: [] };
    }
    const albumData = (await albumRes.json()) as {
      name?: string;
      genres?: string[];
      artists?: Array<{ id?: string; name?: string }>;
    };

    const collected: string[] = Array.isArray(albumData.genres) ? [...albumData.genres] : [];
    const primaryArtists = (albumData.artists ?? []).slice(0, 2);

    if (collected.length === 0 && primaryArtists.length > 0) {
      for (const artist of primaryArtists) {
        if (!artist.id) continue;
        try {
          const artistRes = await fetch(
            `https://api.spotify.com/v1/artists/${encodeURIComponent(artist.id)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (artistRes.ok) {
            const artistData = (await artistRes.json()) as { genres?: string[] };
            if (Array.isArray(artistData.genres)) {
              collected.push(...artistData.genres);
            }
          }
        } catch {
          // Ignore individual artist genre lookup errors
        }
      }
    }

    return {
      genres: normalizeGenres(collected),
      title: albumData.name,
      artist: primaryArtists.map((a) => a.name).filter(Boolean).join(', '),
    };
  } catch {
    return { genres: [] };
  }
}

async function fetchSpotifyGenresByArtistName(
  artistName: string,
  token: string
): Promise<string[]> {
  const primaryArtist = artistName.split(',')[0]?.trim();
  if (!primaryArtist) return [];
  try {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(primaryArtist)}&type=artist&limit=5`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      artists?: { items?: Array<{ name?: string; genres?: string[] }> };
    };
    const items = data.artists?.items ?? [];
    const exactMatch =
      items.find((a) => a.name?.toLowerCase() === primaryArtist.toLowerCase()) ?? items[0];
    return normalizeGenres(exactMatch?.genres ?? []);
  } catch {
    return [];
  }
}

async function fetchItunesGenresBySearch(title: string, artist: string): Promise<string[]> {
  const term = `${title} ${artist}`.trim() || artist.trim() || title.trim();
  if (!term) return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        collectionName?: string;
        artistName?: string;
        primaryGenreName?: string;
      }>;
    };
    const results = data.results ?? [];
    const titleLower = title.trim().toLowerCase();
    const artistLower = artist.trim().toLowerCase();
    const best =
      results.find(
        (r) =>
          (!titleLower || r.collectionName?.toLowerCase().includes(titleLower)) &&
          (!artistLower || r.artistName?.toLowerCase().includes(artistLower))
      ) ?? results[0];
    return normalizeGenres([best?.primaryGenreName]);
  } catch {
    return [];
  }
}

async function fetchItunesTracksAndGenres(
  externalId: string
): Promise<{ tracks: string[]; genres: string[] }> {
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(externalId)}&entity=song&limit=100`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Catalog tracks request failed (${response.status})`);
  }
  const data = (await response.json()) as {
    results?: Array<{ wrapperType?: string; trackName?: string; primaryGenreName?: string }>;
  };
  const results = data.results ?? [];
  const collection = results.find((item) => item.wrapperType === 'collection');
  const genres = normalizeGenres([collection?.primaryGenreName]);
  const tracks = results
    .filter((item) => item.wrapperType === 'track')
    .map((track) => String(track.trackName ?? '').trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 100);
  return { tracks, genres };
}

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/spotify/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery || rawQuery.length > 120) {
      res.status(400).json({ error: 'Search query must be between 1 and 120 characters.' });
      return;
    }

    try {
      const token = await getSpotifyToken();
      if (token) {
        try {
          const albums = await searchSpotifyAlbums(rawQuery, token);
          res.json({ provider: 'spotify', albums });
          return;
        } catch (spotifyErr) {
          console.error('Spotify search error, falling back to catalog:', spotifyErr);
        }
      }

      const albums = await searchItunesAlbums(rawQuery);
      res.json({ provider: 'itunes', albums });
    } catch (error) {
      console.error('Album search error:', error);
      res.status(502).json({ error: 'Unable to search albums right now.' });
    }
  });

  router.get('/spotify/album/:source/:externalId/tracks', async (req, res) => {
    const source = req.params.source;
    const externalId = req.params.externalId;

    if (source !== 'spotify' && source !== 'itunes') {
      res.status(400).json({ error: 'Invalid catalog source.' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(externalId)) {
      res.status(400).json({ error: 'Invalid album identifier.' });
      return;
    }

    try {
      if (source === 'spotify') {
        const token = await getSpotifyToken();
        if (!token) {
          res.status(503).json({ error: 'Spotify credentials are not configured on the server.' });
          return;
        }
        const [tracks, spotifyDetails] = await Promise.all([
          fetchSpotifyTracks(externalId, token),
          fetchSpotifyGenresForAlbum(externalId, token),
        ]);
        let genres = spotifyDetails.genres;
        if (genres.length === 0 && (spotifyDetails.title || spotifyDetails.artist)) {
          genres = await fetchItunesGenresBySearch(
            spotifyDetails.title ?? '',
            spotifyDetails.artist ?? ''
          );
        }
        res.json({ tracks, genres });
        return;
      }

      const { tracks, genres } = await fetchItunesTracksAndGenres(externalId);
      res.json({ tracks, genres });
    } catch (error) {
      console.error('Album tracks error:', error);
      res.status(502).json({ error: 'Unable to load album tracks.' });
    }
  });

  router.get('/catalog/genres', async (req, res) => {
    const source = typeof req.query.source === 'string' ? req.query.source : 'manual';
    const externalId = typeof req.query.externalId === 'string' ? req.query.externalId.trim() : '';
    const title = typeof req.query.title === 'string' ? req.query.title.trim().slice(0, 200) : '';
    const artist = typeof req.query.artist === 'string' ? req.query.artist.trim().slice(0, 200) : '';

    if (!title && !artist && !externalId) {
      res.status(400).json({ error: 'Album metadata is required to resolve genres.' });
      return;
    }

    try {
      let genres: string[] = [];
      const token = await getSpotifyToken().catch(() => null);

      if (source === 'spotify' && externalId && /^[a-zA-Z0-9_-]{1,128}$/.test(externalId) && token) {
        const spotifyDetails = await fetchSpotifyGenresForAlbum(externalId, token);
        genres = spotifyDetails.genres;
      } else if (source === 'itunes' && externalId && /^[a-zA-Z0-9_-]{1,128}$/.test(externalId)) {
        const lookup = await fetchItunesTracksAndGenres(externalId).catch(() => ({
          tracks: [],
          genres: [],
        }));
        genres = lookup.genres;
      }

      if (genres.length === 0 && artist && token) {
        genres = await fetchSpotifyGenresByArtistName(artist, token);
      }

      if (genres.length === 0 && (title || artist)) {
        genres = await fetchItunesGenresBySearch(title, artist);
      }

      res.json({ genres });
    } catch (error) {
      console.error('Genre lookup error:', error);
      res.status(502).json({ error: 'Unable to resolve genres right now.' });
    }
  });

  return router;
}
