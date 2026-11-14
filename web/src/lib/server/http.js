import { BadRequest } from './filters.js';

/** Uploads are immutable once stored, so their derived data can be cached at the CDN. */
export const IMMUTABLE_CACHE = 'public, max-age=60, s-maxage=86400, stale-while-revalidate=604800';

export const jsonError = (status, error) => Response.json({ error }, { status });

/** Wrap a route handler: map validation errors to 400, log and hide everything else. */
export function withErrors(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof BadRequest) return jsonError(400, err.message);
      console.error(JSON.stringify({ level: 'error', path: new URL(request.url).pathname, error: err.message, stack: err.stack }));
      return jsonError(500, 'Internal server error');
    }
  };
}
