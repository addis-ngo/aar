import {
  getQueryString,
  searchCatalogAlbums,
  sendJson,
  type ServerlessRequest,
  type ServerlessResponse,
} from '../_lib/catalog.js';

export default async function handler(req: ServerlessRequest, res: ServerlessResponse) {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const rawQuery = getQueryString(req, 'q').trim();
  if (!rawQuery || rawQuery.length > 120) {
    sendJson(res, 400, { error: 'Search query must be between 1 and 120 characters.' });
    return;
  }

  try {
    const result = await searchCatalogAlbums(rawQuery);
    sendJson(res, 200, result);
  } catch (error) {
    console.error('Album search error:', error);
    sendJson(res, 502, { error: 'Unable to search albums right now.' });
  }
}
