import {
  getQueryString,
  resolveCatalogGenres,
  sendJson,
  type ServerlessRequest,
  type ServerlessResponse,
} from '../_lib/catalog.js';

export default async function handler(req: ServerlessRequest, res: ServerlessResponse) {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const source = getQueryString(req, 'source') || 'manual';
  const externalId = getQueryString(req, 'externalId').trim();
  const title = getQueryString(req, 'title').trim().slice(0, 200);
  const artist = getQueryString(req, 'artist').trim().slice(0, 200);

  if (!title && !artist && !externalId) {
    sendJson(res, 400, { error: 'Album metadata is required to resolve genres.' });
    return;
  }

  try {
    const genres = await resolveCatalogGenres({ source, externalId, title, artist });
    sendJson(res, 200, { genres });
  } catch (error) {
    console.error('Genre lookup error:', error);
    sendJson(res, 502, { error: 'Unable to resolve genres right now.' });
  }
}
