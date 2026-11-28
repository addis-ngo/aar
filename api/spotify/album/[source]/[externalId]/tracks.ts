import {
  fetchAlbumTracksAndGenres,
  getQueryString,
  sendJson,
  type ServerlessRequest,
  type ServerlessResponse,
} from '../../../../_lib/catalog.js';

export default async function handler(req: ServerlessRequest, res: ServerlessResponse) {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let source = getQueryString(req, 'source');
  let externalId = getQueryString(req, 'externalId');

  if ((!source || !externalId) && req.url) {
    const pathOnly = req.url.split('?')[0] ?? '';
    const match = pathOnly.match(/\/api\/spotify\/album\/([^/]+)\/([^/]+)\/tracks$/);
    if (match) {
      source = source || decodeURIComponent(match[1]);
      externalId = externalId || decodeURIComponent(match[2]);
    }
  }

  if (source !== 'spotify' && source !== 'itunes') {
    sendJson(res, 400, { error: 'Invalid catalog source.' });
    return;
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(externalId)) {
    sendJson(res, 400, { error: 'Invalid album identifier.' });
    return;
  }

  try {
    const data = await fetchAlbumTracksAndGenres(source, externalId);
    sendJson(res, 200, data);
  } catch (error) {
    console.error('Album tracks error:', error);
    sendJson(res, 502, { error: 'Unable to load album tracks.' });
  }
}
