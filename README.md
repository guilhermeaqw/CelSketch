# CelSketch

**CelSketch** is an open-source 2D animation and digital drawing desktop application for **Windows** and **Linux**.

## Downloads
Download the latest release from the [Releases](https://github.com/guilhermeaqw/CelSketch/releases) page:
- **Windows Installer**: `CelSketch Setup 1.0.0.exe`
- **Windows Portable**: `CelSketch 1.0.0.exe`
- **Linux AppImage**: `CelSketch-1.0.0.AppImage`
- **Linux Debian/Ubuntu**: `celsketch_1.0.0_amd64.deb`

## Features
- **Drawing Engine**: Universal pen tablet pressure sensitivity, smooth variable-width strokes, and real-time **Stabilizer** (Pulled String).
- **Visual Brush Gallery**: Organized into **Padrão** and **Borrar** categories with live stroke previews and exact circular brush outline cursor (`[` / `´` to resize).
- **Canvas Controls**: Hold `Space` to pan, hold `R` to rotate (with `0°` reset), `F1` to flip horizontally, `C` for interactive 8-handle Canvas Crop/Resize, `Ctrl+Y` for Rec.709 Grayscale value proofing, and `Ctrl+U` for Layer Hue/Saturation/Value.
- **Selection Tools**: Freehand Lasso (`Q`, hold `Alt` for polygonal), Polygonal Lasso (`Shift+Q`), and `Ctrl+A` Select All, with Fill (`Alt+Backspace`), Delete (`Del`), and Move.
- **Animation Timeline**: Multi-layer timeline with Opacity, Visibility, Lock, **Hold Exposure**, Onion Skinning, Light Table, configurable `In`/`Out` playback range, `ArrowLeft`/`ArrowRight` frame stepping, and `Shift+Space` playback.
- **Dockable & Floating Workspace**: Resizable and detachable panels (**Tools**, **Colour & Brushes**, **Timeline**) plus interactive **Node View**.
- **Native Project & Export**: Native `.celsketch` project files (`Ctrl+S` / `Ctrl+Shift+S`) and unified **Export** dialog for **MP4 Video**, **Animated GIF**, **PNG Sequence**, and **PNG Frame**.

## Development & Build
```bash
npm install
npm run dev        # Run in development mode
npm run dist:win   # Build Windows Installer & Portable (.exe)
npx electron-builder --linux  # Build Linux AppImage & .deb
```
