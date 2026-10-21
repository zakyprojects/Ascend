/**
 * The parts of vercel.json's routing that the site depends on, read the way Vercel reads them:
 * cleanUrls and trailingSlash, then redirects, then a file on disk, then rewrites, else 404.html
 * with status 404 (filesystem first: a rewrite only applies when no file matches). Used by the
 * local `vite preview` (vite.config.ts) and the tests, so routing can be checked before a deploy.
 * An approximation of Vercel, not Vercel itself: the deployed preview stays the real test.
 */

export interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export interface VercelConfig {
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  redirects?: { source: string; destination: string; permanent?: boolean }[];
  rewrites?: { source: string; destination: string }[];
  headers?: VercelHeaderRule[];
}

/**
 * A vercel.json `source` (path-to-regexp style) as a RegExp over the whole path. Supports what
 * this project uses: literal segments, `:name(regex)`, `(regex)` groups and bare `:name`.
 */
export function sourceToRegExp(source: string): RegExp {
  const pattern = source.replace(/:[A-Za-z_]\w*(?=\()/g, '').replace(/:[A-Za-z_]\w*/g, '([^/]+)');
  return new RegExp(`^${pattern}$`);
}

export const sourceMatches = (source: string, path: string): boolean => sourceToRegExp(source).test(path);

export type RouteResult =
  | { type: 'redirect'; status: 308 | 307; location: string }
  | { type: 'file'; file: string; status: 200 }
  | { type: 'notFound'; file: string; status: 404 };

/**
 * Where a request path ends up. `exists(file)` says whether a file is in the output
 * (paths like `index.html`, `features/journal.html`, `assets/x.js`).
 */
export function resolveRoute(config: VercelConfig, path: string, exists: (file: string) => boolean): RouteResult {
  if (config.trailingSlash === false && path.length > 1 && path.endsWith('/')) {
    return { type: 'redirect', status: 308, location: path.replace(/\/+$/, '') || '/' };
  }
  if (config.cleanUrls && /\.html$/.test(path)) {
    const clean = path.replace(/(\/index)?\.html$/, '') || '/';
    if (exists(path.slice(1))) return { type: 'redirect', status: 308, location: clean };
  }
  for (const redirect of config.redirects ?? []) {
    if (sourceMatches(redirect.source, path)) {
      return { type: 'redirect', status: redirect.permanent === false ? 307 : 308, location: redirect.destination };
    }
  }
  const file = fileFor(config, path, exists);
  if (file) return { type: 'file', file, status: 200 };
  for (const rewrite of config.rewrites ?? []) {
    if (!sourceMatches(rewrite.source, path)) continue;
    const target = fileFor(config, rewrite.destination, exists);
    if (target) return { type: 'file', file: target, status: 200 };
    // A rewrite to a function (/api/…): not a file here.
    return { type: 'file', file: rewrite.destination.slice(1), status: 200 };
  }
  return { type: 'notFound', file: '404.html', status: 404 };
}

function fileFor(config: VercelConfig, path: string, exists: (file: string) => boolean): string | null {
  const rel = path.replace(/^\/+/, '');
  if (rel === '' && exists('index.html')) return 'index.html';
  if (rel && exists(rel)) return rel;
  if (config.cleanUrls && rel && exists(`${rel}.html`)) return `${rel}.html`;
  return null;
}

/** Every header vercel.json sets on a response for this request path (later rules win, as on Vercel). */
export function headersFor(config: VercelConfig, path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of config.headers ?? []) {
    if (!sourceMatches(rule.source, path)) continue;
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}
