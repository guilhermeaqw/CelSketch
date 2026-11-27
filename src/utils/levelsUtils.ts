import { applyLevelsWebGL } from './webglFilters';

export interface LevelsAdjustment {
  blackPoint: number; // 0 .. 250
  gamma: number;      // 0.2 .. 3.0 (default 1.0)
  whitePoint: number; // 5 .. 255
  brightness: number; // -100 .. 100
  contrast: number;   // -100 .. 100
}

export const DEFAULT_LEVELS: LevelsAdjustment = {
  blackPoint: 0,
  gamma: 1,
  whitePoint: 255,
  brightness: 0,
  contrast: 0
};

export function isNoopLevels(adj: LevelsAdjustment): boolean {
  return (
    adj.blackPoint === 0 &&
    Math.abs(adj.gamma - 1) < 0.005 &&
    adj.whitePoint === 255 &&
    adj.brightness === 0 &&
    adj.contrast === 0
  );
}

/**
 * Builds a 256-entry lookup table for ultra-fast Levels + Brightness + Contrast pixel mapping.
 */
export function buildLevelsLut(adj: LevelsAdjustment): Uint8Array {
  const lut = new Uint8Array(256);
  const bp = Math.max(0, Math.min(250, adj.blackPoint));
  const wp = Math.max(bp + 1, Math.min(255, adj.whitePoint));
  const invRange = 1 / (wp - bp);
  const invGamma = 1 / Math.max(0.15, Math.min(4, adj.gamma || 1));

  // Standard Photoshop-like contrast factor
  const cVal = Math.max(-100, Math.min(100, adj.contrast)) * 2.55;
  const cFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
  const bOffset = (Math.max(-100, Math.min(100, adj.brightness)) / 100) * 180;

  for (let i = 0; i < 256; i++) {
    // 1. Levels (Black Point -> Gamma -> White Point)
    let norm = (i - bp) * invRange;
    if (norm < 0) norm = 0;
    else if (norm > 1) norm = 1;
    let v = Math.pow(norm, invGamma) * 255;

    // 2. Brightness & Contrast
    v = cFactor * (v + bOffset - 128) + 128;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    lut[i] = Math.round(v);
  }
  return lut;
}

export function adjustHexLevels(hex: string, adj: LevelsAdjustment): string {
  if (!hex || !hex.startsWith('#') || isNoopLevels(adj)) return hex;
  let clean = hex.slice(1);
  let alphaSuffix = '';
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  } else if (clean.length === 8) {
    alphaSuffix = clean.slice(6);
    clean = clean.slice(0, 6);
  }
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;

  const lut = buildLevelsLut(adj);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(lut[r])}${toHex(lut[g])}${toHex(lut[b])}${alphaSuffix}`;
}

export function applyLevelsToCanvas(
  src: HTMLCanvasElement | HTMLImageElement,
  dst: HTMLCanvasElement,
  steps: LevelsAdjustment | LevelsAdjustment[]
): HTMLCanvasElement {
  const stepList = (Array.isArray(steps) ? steps : [steps]).filter((st) => !isNoopLevels(st));
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (w <= 0 || h <= 0) return dst;

  if (dst.width !== w || dst.height !== h) {
    dst.width = w;
    dst.height = h;
  }
  const dctx = dst.getContext('2d', { willReadFrequently: true });
  if (!dctx) return dst;

  dctx.clearRect(0, 0, w, h);
  dctx.drawImage(src, 0, 0, w, h);
  if (stepList.length === 0) return dst;

  // Compose all sequential LUT steps into a single 256-byte LUT for O(N) single-pass speed!
  const composed = new Uint8Array(256);
  for (let i = 0; i < 256; i++) composed[i] = i;
  for (const st of stepList) {
    const lut = buildLevelsLut(st);
    for (let i = 0; i < 256; i++) {
      composed[i] = lut[composed[i]];
    }
  }

  // GPU Fast-Path (WebGL2 1D LUT texture < 0.2ms at 1080p)
  if (applyLevelsWebGL(src, dst, composed)) {
    return dst;
  }

  const imgData = dctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = composed[data[i]];
    data[i + 1] = composed[data[i + 1]];
    data[i + 2] = composed[data[i + 2]];
  }
  dctx.putImageData(imgData, 0, 0);
  return dst;
}
