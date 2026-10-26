import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectNotices,
  formatNotices,
  packageDirFromModuleId,
  readPackageNotice,
  runtimePackageDirs,
} from '../../scripts/third-party-notices';
import { tempDir } from './helpers';

/** Writes a fake installed package and returns its folder. */
function fakePackage(
  nodeModules: string,
  name: string,
  manifest: Record<string, unknown> = {},
  files: Record<string, string> = { LICENSE: `MIT licence of ${name}` },
): string {
  const dir = path.join(nodeModules, ...name.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', license: 'MIT', ...manifest }),
  );
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

describe('third-party notices', () => {
  it('finds the package folder of a bundled module', () => {
    expect(packageDirFromModuleId('C:/app/node_modules/react/cjs/react.production.js')).toBe(
      'C:/app/node_modules/react',
    );
    expect(packageDirFromModuleId('C:\\app\\node_modules\\@tiptap\\core\\dist\\index.js')).toBe(
      'C:/app/node_modules/@tiptap/core',
    );
    // The innermost node_modules wins, and Rollup's prefixes and queries are ignored.
    expect(
      packageDirFromModuleId('\0C:/app/node_modules/a/node_modules/b/index.js?commonjs-proxy'),
    ).toBe('C:/app/node_modules/a/node_modules/b');
    expect(packageDirFromModuleId('C:/app/src/renderer/main.tsx')).toBeNull();
    expect(packageDirFromModuleId('\0vite/preload-helper.js')).toBeNull();
  });

  it('reads the name, version, licence, and every licence file', () => {
    const modules = tempDir();
    const dir = fakePackage(
      modules,
      '@scope/lib',
      { version: '2.3.4', license: 'Apache-2.0', homepage: 'https://example.org' },
      { 'LICENSE.md': 'Apache text', NOTICE: 'Notice text', 'README.md': 'not a licence' },
    );
    expect(readPackageNotice(dir)).toEqual({
      name: '@scope/lib',
      version: '2.3.4',
      license: 'Apache-2.0',
      homepage: 'https://example.org',
      texts: ['Apache text', 'Notice text'],
    });
  });

  it('follows runtime dependencies, including nested copies, and skips optional ones not installed', () => {
    const root = tempDir();
    const modules = path.join(root, 'node_modules');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { a: '1.0.0' }, devDependencies: { dev: '1.0.0' } }),
    );
    fakePackage(modules, 'a', {
      dependencies: { b: '^1.0.0' },
      optionalDependencies: { gone: '1' },
    });
    fakePackage(modules, 'b', { version: '1.0.0' });
    fakePackage(path.join(modules, 'a', 'node_modules'), 'b', { version: '2.0.0' });
    fakePackage(modules, 'dev');

    const names = runtimePackageDirs(root).map((dir) => path.relative(modules, dir));
    expect(names.sort()).toEqual(['a', path.join('a', 'node_modules', 'b')]);
  });

  it('refuses a package without licence text, naming it', () => {
    const modules = tempDir();
    const good = fakePackage(modules, 'good');
    const bare = fakePackage(modules, 'bare', {}, {});
    expect(() => collectNotices([good, bare])).toThrow(/bare@1\.0\.0/);
  });

  it('lists each package version once, sorted, after the hand-written notices', () => {
    const modules = tempDir();
    const zed = fakePackage(modules, 'zed');
    const alpha = fakePackage(modules, 'alpha', { homepage: 'https://alpha.dev' });
    const notices = collectNotices([zed, alpha, zed]);
    expect(notices.map((n) => n.name)).toEqual(['alpha', 'zed']);

    const text = formatNotices(notices, 'NATIVE NOTICES');
    expect(text.indexOf('NATIVE NOTICES')).toBeLessThan(text.indexOf('alpha 1.0.0'));
    expect(text).toContain('alpha 1.0.0\nLicence: MIT\nhttps://alpha.dev\n\nMIT licence of alpha');
    expect(text.indexOf('alpha 1.0.0')).toBeLessThan(text.indexOf('zed 1.0.0'));
    expect(text.match(/zed 1\.0\.0/g)).toHaveLength(1);
  });

  it('keeps the hand-written SQLite notices in step with the installed driver', () => {
    // A driver update can change what its binary contains: update build/native-notices.txt with it.
    const driver = path.join('node_modules', 'better-sqlite3-multiple-ciphers');
    const source = fs.readFileSync(path.join(driver, 'deps', 'sqlite3', 'sqlite3.c'), 'utf8');
    const notices = fs.readFileSync(path.join('build', 'native-notices.txt'), 'utf8');
    const { version } = JSON.parse(fs.readFileSync(path.join(driver, 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(notices).toContain(`better-sqlite3-multiple-ciphers ${version}`);
    expect(notices).toContain(`SQLite ${/#define SQLITE_VERSION\s+"([^"]+)"/.exec(source)?.[1]}`);
    expect(notices).toContain(/SQLITE3MC_VERSION_STRING\s+"([^"]+)"/.exec(source)?.[1]);
  });
});
