/**
 * Answers a request for a build file that does not exist (`/assets/<old-hash>.js` after a deploy).
 *
 * vercel.json gives everything under /assets a year-long `immutable` cache header, and Vercel adds
 * it to 404s too, so a browser or the CDN could keep a missing file's 404 for a year. Real files
 * are served before rewrites, so only a missing one is rewritten here, and a Function's own
 * Cache-Control wins over vercel.json: the 404 is never stored.
 */
function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function GET(): Response {
  return notFound();
}

export function HEAD(): Response {
  return notFound();
}
