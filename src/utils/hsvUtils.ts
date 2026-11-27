export interface HsvAdjustment {
  h: number; // -180 .. 180 degrees
  s: number; // -100 .. 100 %
  v: number; // -100 .. 100 % (Lightness / Luminosidade)
  colorize?: boolean;
}

export function isNoopHsv(adj: HsvAdjustment): boolean {
  return !adj.colorize && adj.h === 0 && adj.s === 0 && adj.v === 0;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) * 0.5;

  if (d === 0) {
    return [0, 0, l];
  }

  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c * 0.5;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return [
    Math.max(0, Math.min(255, Math.round((r1 + m) * 255))),
    Math.max(0, Math.min(255, Math.round((g1 + m) * 255))),
    Math.max(0, Math.min(255, Math.round((b1 + m) * 255)))
  ];
}

/**
 * Applies one HSL/Colorize adjustment step to an RGB triplet (0..255).
 * Matches Photoshop / Clip Studio Paint Hue/Saturation/Lightness behavior:
 * - Hue rotates cleanly in HSL without distorting luminance.
 * - Saturation -100% -> pure gray; +100% -> smoothly boosts chromatic pixels without tinting neutrals.
 * - Lightness -100% -> pure black; +100% -> pure white (can lighten even pure black lineart!).
 * - Colorize tints all pixels to the target hue with controllable saturation & lightness.
 */
export function adjustRgbHsl(
  r: number,
  g: number,
  b: number,
  hDelta: number,
  sDelta: number,
  lDelta: number,
  colorize = false
): [number, number, number] {
  if (!colorize && hDelta === 0 && sDelta === 0 && lDelta === 0) {
    return [r, g, b];
  }

  let [h, s, l] = rgbToHsl(r, g, b);

  if (colorize) {
    h = ((hDelta % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, 0.5 + sDelta / 200));
  } else {
    h = ((h + hDelta) % 360 + 360) % 360;
    if (sDelta < 0) {
      s = Math.max(0, s * (1 + sDelta / 100));
    } else if (sDelta > 0 && s > 0.001) {
      s = Math.min(1, s + (1 - s) * (sDelta / 100));
    }
  }

  if (lDelta < 0) {
    l = Math.max(0, l * (1 + lDelta / 100));
  } else if (lDelta > 0) {
    l = Math.min(1, l + (1 - l) * (lDelta / 100));
  }

  return hslToRgb(h, s, l);
}

/**
 * Adjusts a hex color string (#rgb, #rrggbb, or #rrggbbaa) using exact HSL math.
 */
export function adjustHexHsl(
  hex: string,
  hDelta: number,
  sDelta: number,
  lDelta: number,
  colorize = false
): string {
  if (!hex || !hex.startsWith('#')) return hex;
  if (!colorize && hDelta === 0 && sDelta === 0 && lDelta === 0) return hex;

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

  const [nr, ng, nb] = adjustRgbHsl(r, g, b, hDelta, sDelta, lDelta, colorize);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}${alphaSuffix}`;
}

/**
 * Applies one or more sequential HSL/Colorize steps to every non-transparent pixel of `src`,
 * writing the result into `dst` (which is resized to match `src` if needed).
 * Skips alpha === 0 pixels for high performance on sparse animation cels.
 */
export function applyHslToCanvas(
  src: HTMLCanvasElement | HTMLImageElement,
  dst: HTMLCanvasElement,
  steps: HsvAdjustment | HsvAdjustment[]
): HTMLCanvasElement {
  const stepList = (Array.isArray(steps) ? steps : [steps]).filter((st) => !isNoopHsv(st));
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

  const imgData = dctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    for (let k = 0; k < stepList.length; k++) {
      const st = stepList[k];
      const [nr, ng, nb] = adjustRgbHsl(r, g, b, st.h, st.s, st.v, Boolean(st.colorize));
      r = nr;
      g = ng;
      b = nb;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  dctx.putImageData(imgData, 0, 0);
  return dst;
}
