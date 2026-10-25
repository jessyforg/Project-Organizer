# ADR-0026: The Katha mark, the banig weave

- Status: Approved (product owner, 2026-10-26; part of 0.9.0 on `feature/milestones-0.9`, not merged)
- Date: 2026-10-26

## Context

After the rename to Katha (ADR-0025), the app had two unrelated marks from the old "forge" theme: the installer and window icon (four heat bars on graphite, `scripts/make-icon.py`) and a Lucide hammer in the sidebar and on the first-run screen. There was no SVG logo, favicon, or wordmark.

Three concepts were drawn and checked at real sizes on light and dark backgrounds: A, a banig weave; B, a "bookmark K"; and C, a simplified version of the heat bars. The product owner chose A.

## Decisions

### The mark

- **A 3×3 over-under weave** of blue (vertical) and amber (horizontal) strips. Each crossing shows the strip on top, a little longer along it and narrower across it, so it reads as woven rather than as a checkerboard.
- **Meaning:** separate strands (projects, tasks, notes) woven into one strong whole, as in a banig, the hand-woven Filipino mat. Only the weave is shown, not a literal mat, and no script or flag symbols are used.
- **Colours:** `#3566c8` and `#e39a2d` on light backgrounds, `#6f98e8` and `#f0a948` on dark ones. The app icon sets white and amber strips on the app's accent blue `#2a5aa6`. A graphite tile was tried and rejected because it disappeared on the dark Windows taskbar.

### Files and sources

- **`brand/`** holds every file, with a README of colours and rules, and `preview.html` for checking them.
- **`brand/make-marks.py`** (Python, no dependencies) generates the marks, tiles, and wordmarks from one weave function, so the weave is changed in one place.
- **Sharp small sizes:** the tiles at 16, 24, and 32 px are separate files whose edges fall on whole pixels. The general file is drawn on a 48 grid.
- **The wordmark** embeds Atkinson Hyperlegible Next ExtraBold (SIL OFL 1.1, which permits embedding).
- **Concept B** is kept in `brand/explorations/` for reference.

### In the app

- **App icon:** `scripts/make-app-icon.cjs` runs in Electron (already a development dependency), draws each tile at its exact size, and writes `build/icon.ico` (16, 24, 32, 48, 64, 128, and 256 px) and `build/icon.png` (512 px). electron-builder picks up `build/icon.ico` for the installer and the executable. No configuration change was needed.
- **In-app mark:** a `BrandMark` component draws the weave in one colour on the 16 px grid and replaces the hammer in the sidebar and on the first-run screen. It is decorative (`aria-hidden`), since the name always appears beside it.
- **`scripts/make-icon.py`** is kept for reference, with a note that it is superseded.

## Consequences

- The installer, the executable, the window, the app's own screens, the README, and (later) the website share one mark.
- The mark has not been searched against registered trademarks. That search (USPTO and WIPO design databases, Nice class 9) is recommended before relying on it commercially.
- GitHub serves SVGs with a strict content security policy that may block the embedded font, in which case the README wordmark falls back to a system font. Converting the text to outlines would remove that dependency; it needs font tooling and was not done.
