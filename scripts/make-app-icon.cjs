/*
 * Builds the Windows app icon from the brand tiles: build/icon.ico (16 to 256 px, each size from
 * its own pixel-aligned SVG where one exists) and build/icon.png (512 px).
 *
 * It runs inside Electron, which is already a development dependency, so drawing the SVGs needs
 * no image library. Usage, from the repository root:
 *     npx electron scripts/make-app-icon.cjs
 * (Unset ELECTRON_RUN_AS_NODE first if your editor sets it.)
 */
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');
const brand = (name) => path.join(root, 'brand', name);
const SIZES = [
  [16, brand('katha-tile-16.svg')],
  [24, brand('katha-tile-24.svg')],
  [32, brand('katha-tile-32.svg')],
  [48, brand('katha-tile.svg')],
  [64, brand('katha-tile.svg')],
  [128, brand('katha-tile.svg')],
  [256, brand('katha-tile.svg')],
];

/** Draws one SVG at exactly size × size pixels and returns the PNG bytes. */
async function render(win, file, size) {
  const svg = fs.readFileSync(file, 'utf8');
  const dataUrl = await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const img = new Image(${size}, ${size});
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = ${size};
        canvas.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('could not draw the SVG'));
      img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    })`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** An .ico file holding PNG images: a 6-byte header, a 16-byte entry per image, then the data. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(([size, png]) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(([, png]) => png)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<!doctype html><title>icon</title>');
  try {
    const images = [];
    for (const [size, file] of SIZES) images.push([size, await render(win, file, size)]);
    fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico(images));
    fs.writeFileSync(
      path.join(root, 'build', 'icon.png'),
      await render(win, brand('katha-tile.svg'), 512),
    );
    console.log(
      `build/icon.ico (${SIZES.map(([s]) => s).join(', ')} px) and build/icon.png (512 px) written`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  app.quit();
});
