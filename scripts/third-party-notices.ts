// Builds THIRD_PARTY_NOTICES.txt, the licence texts of all third-party code the installer ships.
// Two kinds of package ship: those Vite bundles into out/ (React, TipTap, the font, ...), found from
// the modules Rollup actually included, and the runtime dependencies electron-builder copies as they
// are (the SQLite driver, zod). Code compiled into the SQLite driver's binary has no package of its
// own, so its notices are written by hand in build/native-notices.txt.
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export interface PackageNotice {
  name: string;
  version: string;
  license: string;
  homepage?: string;
  texts: string[];
}

interface Manifest {
  name?: string;
  version?: string;
  license?: string;
  homepage?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const NODE_MODULES = '/node_modules/';
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

function readManifest(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Manifest;
}

/** The installed package a bundled module belongs to, or null for the app's own and virtual modules. */
export function packageDirFromModuleId(id: string): string | null {
  const clean = id.replace(/^\0/, '').replace(/\?.*$/, '').replaceAll('\\', '/');
  const at = clean.lastIndexOf(NODE_MODULES);
  if (at < 0) return null;
  const segments = clean.slice(at + NODE_MODULES.length).split('/');
  const nameLength = segments[0]?.startsWith('@') ? 2 : 1;
  if (segments.length <= nameLength) return null;
  return clean.slice(0, at + NODE_MODULES.length) + segments.slice(0, nameLength).join('/');
}

/** A package's name, version, licence, and the text of every licence or notice file at its top level. */
export function readPackageNotice(dir: string): PackageNotice {
  const manifest = readManifest(dir);
  const texts = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8').trim());
  return {
    name: manifest.name ?? path.basename(dir),
    version: manifest.version ?? 'unknown',
    license: manifest.license ?? 'unknown',
    ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
    texts,
  };
}

/** Where Node would load `name` from, starting at `fromDir`, the way require() searches. */
function resolvePackageDir(fromDir: string, name: string, rootDir: string): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.resolve(dir) === path.resolve(rootDir)) return null;
    const parent = path.dirname(dir);
    // Leave a node_modules folder entirely before searching the next level up.
    dir = path.basename(parent) === 'node_modules' ? path.dirname(parent) : parent;
  }
}

/** Every package the app's runtime dependencies pull in: what electron-builder copies into the installer. */
export function runtimePackageDirs(rootDir: string): string[] {
  const found = new Set<string>();
  const visit = (fromDir: string, manifest: Manifest): void => {
    const optional = manifest.optionalDependencies ?? {};
    const names = Object.keys({ ...manifest.dependencies, ...optional });
    for (const name of names) {
      const dir = resolvePackageDir(fromDir, name, rootDir);
      if (!dir) {
        if (name in optional) continue;
        throw new Error(`Runtime dependency ${name} is not installed (needed by ${fromDir}).`);
      }
      if (found.has(dir)) continue;
      found.add(dir);
      visit(dir, readManifest(dir));
    }
  };
  visit(rootDir, readManifest(rootDir));
  return [...found];
}

/** One notice per package version, sorted by name. Refuses packages that ship no licence text. */
export function collectNotices(dirs: Iterable<string>): PackageNotice[] {
  const byKey = new Map<string, PackageNotice>();
  for (const dir of dirs) {
    const notice = readPackageNotice(dir);
    byKey.set(`${notice.name}@${notice.version}`, notice);
  }
  const missing = [...byKey].filter(([, notice]) => notice.texts.length === 0).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `No licence file found in ${missing.join(', ')}. Add the licence text by hand before shipping.`,
    );
  }
  return [...byKey.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

const RULE = '='.repeat(78);

export function formatNotices(notices: PackageNotice[], nativeNotices: string): string {
  const header = [
    'Katha — third-party software notices',
    '',
    'Katha includes the third-party software listed below. Each component remains under',
    'its own licence, reproduced here. Electron and Chromium licences are in',
    'LICENSE.electron.txt and LICENSES.chromium.html, next to this file.',
  ].join('\n');
  const sections = notices.map((notice) =>
    [
      `${notice.name} ${notice.version}`,
      `Licence: ${notice.license}`,
      ...(notice.homepage ? [notice.homepage] : []),
      '',
      notice.texts.join('\n\n'),
    ].join('\n'),
  );
  return [header, nativeNotices.trim(), ...sections].join(`\n\n${RULE}\n\n`) + '\n';
}

/**
 * Vite plugins that gather the packages each build bundles and write the notices file.
 * One collector serves every build, and each build rewrites the file with everything seen so far,
 * so the result is complete after the last build whatever order electron-vite runs them in.
 */
export function thirdPartyNotices(options: {
  rootDir: string;
  outFile: string;
  nativeNoticesFile: string;
}): { plugin: () => Plugin } {
  const dirs = new Set<string>(runtimePackageDirs(options.rootDir));
  return {
    plugin: () => ({
      name: 'katha-third-party-notices',
      apply: 'build',
      generateBundle() {
        for (const id of this.getModuleIds()) {
          const dir = packageDirFromModuleId(id);
          if (dir) dirs.add(path.resolve(dir));
        }
      },
      writeBundle() {
        const text = formatNotices(
          collectNotices(dirs),
          fs.readFileSync(options.nativeNoticesFile, 'utf8'),
        );
        fs.mkdirSync(path.dirname(options.outFile), { recursive: true });
        fs.writeFileSync(options.outFile, text);
      },
    }),
  };
}
