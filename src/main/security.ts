export const APP_SCHEME = 'app';
export const APP_HOST = 'renderer';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Custom schemes report origin "null"; build it explicitly.
    return parsed.protocol === `${APP_SCHEME}:`
      ? `${parsed.protocol}//${parsed.host}`
      : parsed.origin;
  } catch {
    return null;
  }
}

/** True only for the app's own pages (and the Vite dev server in development). */
export function isTrustedOrigin(url: string, devServerUrl?: string): boolean {
  const origin = originOf(url);
  if (origin === null) return false;
  if (origin === APP_ORIGIN) return true;
  return devServerUrl !== undefined && origin === originOf(devServerUrl);
}

/** Links that may be handed to the operating system's default handler. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function contentSecurityPolicy(devServerUrl?: string): string {
  if (devServerUrl !== undefined) {
    // Development only: Vite's React refresh injects an inline script and uses a websocket.
    const devOrigin = originOf(devServerUrl) ?? '';
    const ws = devOrigin.replace(/^http/, 'ws');
    return [
      `default-src 'self' ${devOrigin}`,
      `script-src 'self' 'unsafe-inline' ${devOrigin}`,
      `style-src 'self' 'unsafe-inline' ${devOrigin}`,
      `connect-src 'self' ${devOrigin} ${ws}`,
      "img-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
