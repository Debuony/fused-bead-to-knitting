# 拼豆变围巾 · Bead to Scarf

把拼豆作品照片变成针织围巾的花卡和效果图。
Turn a photo of your fused-bead art into a knitting chart and a textured scarf mockup.

## 流程 Workflow

1. **上传照片 Upload**: drag and drop, choose a file, or paste. Crop and straighten the photo.
2. **像素化 Pixelize**: set the bead grid (or auto-detect it) and snap to a bead palette (MARD / Perler / Hama, or colours taken from the photo). You can cap the colour count and remove the background.
3. **编辑图纸 Edit**:
   - Tools: pencil, eraser, fill, eyedropper, replace colour.
   - Canvas: add or remove rows/columns, flip, rotate, trim empty space.
   - Undo/redo (Ctrl/⌘+Z).
   - Export or import the pattern as PNG/JSON.
4. **花卡 Knitting chart**:
   - Gauge correction keeps the motif in proportion, since knit stitches are wider than tall.
   - Scarf layout: placement (both ends / centre / repeat), seed or garter edge, main yarn colour.
   - The chart has a symbol per colour, a colour key, and yarn estimates.
   - Export as PNG or a tiled A4 PDF.
5. **围巾效果 Scarf**: a stitch-by-stitch knitted texture with fringe, drape and shadow. Download it as a PNG.

## 设置 Settings

The ⚙️ panel switches between 中文 and English, and changes the background (presets, a custom colour, or your own image), light/dark mode, accent colour, text size, panel opacity, and the workflow defaults (palette, grid size, yarn weight/gauge, scarf length).
Settings are saved in the browser (localStorage).

- To add a background preset, add an entry to `BACKGROUND_PRESETS` in `src/store/settingsStore.ts` and a label under `bg` in `src/i18n/*.json`.
- To add or edit bead colours, see `src/lib/palettes.ts`.
- Theme colours are CSS variables in `src/styles/theme.css`.

## 开发 Development

Requires Node.js 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (colour, pixelize, chart)
npm run build    # static site in dist/
npm run build:single  # one self-contained HTML in dist-single/ (open by double-click, good for sharing)
```

Pushing to `master` deploys the site to GitHub Pages via `.github/workflows/deploy.yml`.

A Chinese user tutorial (source + screenshots) lives in `docs/tutorial/`.

Everything runs in the browser, with no server and no uploads.

## 结构 Structure

```
src/
  lib/          colour math, palettes, pixelize, knitting chart, chart/scarf renderers, export
  store/        zustand stores (project + persisted settings)
  steps/        one component per workflow step
  components/   stepper, settings drawer, grid canvas, form fields
  i18n/         zh.json / en.json
```
