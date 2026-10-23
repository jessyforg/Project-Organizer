import fs from 'node:fs';

/** Writes bytes next to their destination first, then renames them into place. */
export function writeFileAtomic(destination: string, data: Uint8Array): void {
  const partial = `${destination}.partial`;
  try {
    fs.writeFileSync(partial, data, { flush: true });
    fs.renameSync(partial, destination);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
}
