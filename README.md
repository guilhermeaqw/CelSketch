# CelSketch

**CelSketch** is a professional 2D animation and drawing desktop application for Windows (built with Electron, React, TypeScript, and HTML5 Canvas).

## Features
- **Pro Drawing Engine**: Universal drawing tablet pen pressure support (Wacom, Huion, XP-Pen, Surface Pen), smooth variable-width ribbon strokes, and Photoshop-style **Stabilizer** (Pulled String / Lazy Mouse).
- **Visual Brush Gallery**: Curated **Padrão** and **Borrar** brush categories with live S-curve stroke previews and exact circular brush outline cursor (`[` / `´` to resize).
- **Canvas Controls**: Hold `Space` to pan, hold `R` to rotate (with `0°` reset button), `F1` to flip horizontally, `C` for interactive 8-handle Canvas Crop/Resize, `Ctrl+Y` for Rec.709 Grayscale value proofing, and `Ctrl+U` for Layer Hue/Saturation/Value.
- **Photoshop-Style Selection**: Freehand Lasso (`Q`, hold `Alt` for polygonal), Polygonal Lasso (`Shift+Q`), `Ctrl+A` Select All, with Fill (`Alt+Backspace`), Delete (`Del`), and Move.
- **Animation Timeline**: Multi-layer timeline with Opacity, Visibility, Lock, **Hold Exposure (`📌`)**, Onion Skinning, Light Table, configurable `In`/`Out` playback range, `ArrowLeft`/`ArrowRight` frame stepping, and `Shift+Space` playback.
- **Node View**: Interactive draggable compositing node graph (`Drawing` -> `Composite` -> `Display` / `Write`).
- **Native Windows File I/O & Export**: Native `.celsketch` project files (`Ctrl+S` / `Ctrl+Shift+S`) and unified **Export** modal for **MP4 Video**, **Animated GIF**, **PNG Sequence**, and **Current Frame PNG**.

## Development & Build
```bash
npm install
npm run dev        # Run in development mode
npm run dist:win   # Build Windows NSIS installer (.exe)
```
