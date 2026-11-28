import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  fetchAlbumTracksAndGenres,
  resolveCatalogGenres,
  searchCatalogAlbums,
} from './api/_lib/catalog';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/spotify/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery || rawQuery.length > 120) {
      res.status(400).json({ error: 'Search query must be between 1 and 120 characters.' });
      return;
    }

    try {
      const result = await searchCatalogAlbums(rawQuery);
      res.json(result);
    } catch (error) {
      console.error('Album search error:', error);
      res.status(502).json({ error: 'Unable to search albums right now.' });
    }
  });

  app.get('/api/spotify/album/:source/:externalId/tracks', async (req, res) => {
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
      const data = await fetchAlbumTracksAndGenres(source, externalId);
      res.json(data);
    } catch (error) {
      console.error('Album tracks error:', error);
      res.status(502).json({ error: 'Unable to load album tracks.' });
    }
  });

  app.get('/api/catalog/genres', async (req, res) => {
    const source = typeof req.query.source === 'string' ? req.query.source : 'manual';
    const externalId = typeof req.query.externalId === 'string' ? req.query.externalId.trim() : '';
    const title = typeof req.query.title === 'string' ? req.query.title.trim().slice(0, 200) : '';
    const artist = typeof req.query.artist === 'string' ? req.query.artist.trim().slice(0, 200) : '';

    if (!title && !artist && !externalId) {
      res.status(400).json({ error: 'Album metadata is required to resolve genres.' });
      return;
    }

    try {
      const genres = await resolveCatalogGenres({ source, externalId, title, artist });
      res.json({ genres });
    } catch (error) {
      console.error('Genre lookup error:', error);
      res.status(502).json({ error: 'Unable to resolve genres right now.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`AAR server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
