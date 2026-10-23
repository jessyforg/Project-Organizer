import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRendererPath } from '../../src/main/protocol';
import { contentSecurityPolicy, isSafeExternalUrl, isTrustedOrigin } from '../../src/main/security';

describe('isTrustedOrigin', () => {
  it('trusts only the app origin in production', () => {
    expect(isTrustedOrigin('app://renderer/index.html')).toBe(true);
    expect(isTrustedOrigin('http://localhost:5173/')).toBe(false);
    expect(isTrustedOrigin('app://renderer.evil/index.html')).toBe(false);
  });

  it('additionally trusts the dev server origin when given', () => {
    expect(isTrustedOrigin('http://localhost:5173/x', 'http://localhost:5173')).toBe(true);
    expect(isTrustedOrigin('http://localhost:5174/x', 'http://localhost:5173')).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  it.each(['https://example.com', 'http://example.com', 'mailto:a@example.com'])(
    'allows %s',
    (url) => {
      expect(isSafeExternalUrl(url)).toBe(true);
    },
  );

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'ms-msdt:/id',
    'smb://server/share',
    'C:\\Windows\\notepad.exe',
    '',
  ])('blocks %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });
});

describe('contentSecurityPolicy', () => {
  it('production policy allows no inline or remote scripts', () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('http');
  });

  it('loads images only from the app, data URLs, and blob URLs it made itself (ADR-0017)', () => {
    const imgSrc = contentSecurityPolicy()
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('img-src'));
    expect(imgSrc).toBe("img-src 'self' data: blob:");
  });
});

describe('resolveRendererPath', () => {
  const root = path.resolve('/app/out/renderer');

  it('maps app URLs to files inside the renderer directory', () => {
    expect(resolveRendererPath(root, 'app://renderer/')).toBe(path.join(root, 'index.html'));
    expect(resolveRendererPath(root, 'app://renderer/assets/a.js')).toBe(
      path.join(root, 'assets', 'a.js'),
    );
  });

  it.each([
    'app://renderer/../../secret.txt',
    'app://renderer/%2e%2e/%2e%2e/secret.txt',
    'app://renderer/..%5c..%5csecret.txt',
    'app://other/index.html',
    'not a url',
  ])('refuses %s', (url) => {
    const resolved = resolveRendererPath(root, url);
    if (resolved !== null) expect(resolved.startsWith(root + path.sep)).toBe(true);
    else expect(resolved).toBeNull();
  });
});
