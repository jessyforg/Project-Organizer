import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_HOST } from './security';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Maps an app:// URL to a file inside the renderer build directory.
 * Returns null for other hosts and for any path that escapes the directory.
 */
export function resolveRendererPath(rendererDir: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.host !== APP_HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const root = path.resolve(rendererDir);
  const resolved = path.resolve(root, '.' + pathname);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

export function createAppProtocolHandler(rendererDir: string, csp: string) {
  return async (request: Request): Promise<Response> => {
    const file = resolveRendererPath(rendererDir, request.url);
    if (file === null) return new Response('Not found', { status: 404 });
    try {
      const body = await fs.readFile(file);
      return new Response(body, {
        headers: {
          'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
          'content-security-policy': csp,
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}
