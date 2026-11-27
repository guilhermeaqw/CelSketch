import { PostProcessSettings } from '../types/harmony';
import { applyPostProcessWebGL } from './webglPostProcess';

export const DEFAULT_POST_PROCESS: PostProcessSettings = {
  enabled: false,
  bloomIntensity: 0,
  bloomRadius: 14,
  bloomThreshold: 175,
  chromaticAberration: 0,
  vignette: 0,
  motionBlur: 0,
  motionBlurAngle: 0,
  filmGrain: 0
};

export interface PostProcessPreset {
  id: string;
  label: string;
  desc: string;
  settings: PostProcessSettings;
}

export const POST_PROCESS_PRESETS: PostProcessPreset[] = [
  {
    id: 'anime_bloom',
    label: 'Anime Bloom (Shinkai)',
    desc: 'Brilho difuso luminoso nas altas luzes + vinheta leve',
    settings: {
      enabled: true,
      bloomIntensity: 55,
      bloomRadius: 18,
      bloomThreshold: 170,
      chromaticAberration: 1.5,
      vignette: 22,
      motionBlur: 0,
      motionBlurAngle: 0,
      filmGrain: 6
    }
  },
  {
    id: 'impact_rgb',
    label: 'Impacto Cromático',
    desc: 'Aberração cromática forte + glow intenso para golpes',
    settings: {
      enabled: true,
      bloomIntensity: 45,
      bloomRadius: 12,
      bloomThreshold: 165,
      chromaticAberration: 8,
      vignette: 32,
      motionBlur: 0,
      motionBlurAngle: 0,
      filmGrain: 8
    }
  },
  {
    id: 'speed_action',
    label: 'Ação / Velocidade',
    desc: 'Motion blur horizontal + leve separação cromática',
    settings: {
      enabled: true,
      bloomIntensity: 25,
      bloomRadius: 10,
      bloomThreshold: 185,
      chromaticAberration: 3,
      vignette: 20,
      motionBlur: 10,
      motionBlurAngle: 0,
      filmGrain: 4
    }
  },
  {
    id: 'cinema_90s',
    label: 'Anime Anos 90 / Filme',
    desc: 'Glow suave analógico + grão de película + vinheta',
    settings: {
      enabled: true,
      bloomIntensity: 38,
      bloomRadius: 16,
      bloomThreshold: 180,
      chromaticAberration: 2,
      vignette: 38,
      motionBlur: 0,
      motionBlurAngle: 0,
      filmGrain: 18
    }
  }
];

export function hasActivePostProcess(pp?: PostProcessSettings | null): boolean {
  if (!pp || !pp.enabled) return false;
  return (
    pp.bloomIntensity > 0 ||
    pp.chromaticAberration > 0 ||
    pp.vignette > 0 ||
    pp.motionBlur > 0 ||
    pp.filmGrain > 0
  );
}

// Reusable scratch buffers to minimize GC during live playback & drawing
let ppScratchA: HTMLCanvasElement | null = null;
let ppScratchB: HTMLCanvasElement | null = null;
let grainTileCanvas: HTMLCanvasElement | null = null;

function ensureScratch(slot: 'A' | 'B', w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  let c = slot === 'A' ? ppScratchA : ppScratchB;
  if (!c) {
    c = document.createElement('canvas');
    if (slot === 'A') ppScratchA = c;
    else ppScratchB = c;
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, w, h);
  return { canvas: c, ctx };
}

function getGrainTile(): HTMLCanvasElement {
  if (grainTileCanvas) return grainTileCanvas;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  const d = img.data;
  let seed = 1337;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = seed & 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTileCanvas = c;
  return c;
}

/**
 * Applies real-time Anime Post-Production filters in-place on `canvas`:
 * 1. Directional Motion Blur
 * 2. Chromatic Aberration (RGB Split)
 * 3. Anime Bloom / Highlights Glow (thresholded half-res screen composite)
 * 4. Cinematic Vignette
 * 5. Subtle Analog Film Grain
 */
export function applyPostProcessToCanvas(
  canvas: HTMLCanvasElement,
  pp?: PostProcessSettings | null
): void {
  if (!hasActivePostProcess(pp) || !pp) return;
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return;

  // GPU Fast-Path (WebGL2 multi-pass shaders: < 1ms at 1080p!). Seamlessly falls back to Canvas 2D if unavailable.
  if (applyPostProcessWebGL(canvas, pp)) {
    return;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  // 1. Directional Motion Blur (multi-tap smooth velocity trail)
  if (pp.motionBlur > 0.5) {
    const copy = ensureScratch('A', w, h);
    if (copy) {
      copy.ctx.drawImage(canvas, 0, 0);
      const dist = Math.min(28, pp.motionBlur);
      const rad = ((pp.motionBlurAngle || 0) * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const taps = 6;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 1; i <= taps; i++) {
        const frac = i / taps;
        const step = frac * dist;
        ctx.globalAlpha = 0.22 * (1 - frac * 0.65);
        ctx.drawImage(copy.canvas, dx * step, dy * step);
        ctx.drawImage(copy.canvas, -dx * step, -dy * step);
      }
      ctx.restore();
    }
  }

  // 2. Chromatic Aberration (crisp horizontal RGB channel split)
  if (pp.chromaticAberration >= 0.5) {
    const shift = Math.max(1, Math.min(24, Math.round(pp.chromaticAberration)));
    const img = ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(img.data);
    const dst = img.data;
    for (let y = 0; y < h; y++) {
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        const idx = (rowOff + x) * 4;
        if (src[idx + 3] === 0) continue;
        const rx = x - shift >= 0 ? x - shift : 0;
        const bx = x + shift < w ? x + shift : w - 1;
        dst[idx] = src[(rowOff + rx) * 4];         // shifted Red
        dst[idx + 2] = src[(rowOff + bx) * 4 + 2]; // shifted Blue
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // 3. Anime Bloom / Luminous Highlights Glow (half-res threshold + gaussian blur + 'screen' blend)
  if (pp.bloomIntensity > 0) {
    const bw = Math.max(2, Math.round(w * 0.5));
    const bh = Math.max(2, Math.round(h * 0.5));
    const hiBuf = ensureScratch('A', bw, bh);
    const blurBuf = ensureScratch('B', bw, bh);
    if (hiBuf && blurBuf) {
      hiBuf.ctx.drawImage(canvas, 0, 0, bw, bh);
      const hiImg = hiBuf.ctx.getImageData(0, 0, bw, bh);
      const d = hiImg.data;
      const thresh = Math.max(60, Math.min(250, pp.bloomThreshold ?? 175));
      const invSpan = 1 / Math.max(1, 255 - thresh);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (lum <= thresh) {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = 0;
        } else {
          const factor = Math.min(1, (lum - thresh) * invSpan);
          d[i] = Math.round(d[i] * factor);
          d[i + 1] = Math.round(d[i + 1] * factor);
          d[i + 2] = Math.round(d[i + 2] * factor);
        }
      }
      hiBuf.ctx.putImageData(hiImg, 0, 0);

      const radius = Math.max(2, Math.min(36, (pp.bloomRadius || 14) * 0.5));
      blurBuf.ctx.filter = `blur(${radius.toFixed(1)}px)`;
      blurBuf.ctx.drawImage(hiBuf.canvas, 0, 0);
      blurBuf.ctx.filter = 'none';

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.max(0, Math.min(1, pp.bloomIntensity / 100));
      ctx.drawImage(blurBuf.canvas, 0, 0, bw, bh, 0, 0, w, h);
      ctx.restore();
    }
  }

  // 4. Cinematic Vignette
  if (pp.vignette > 0) {
    const strength = Math.max(0, Math.min(0.92, (pp.vignette / 100) * 0.85));
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.hypot(cx, cy);
    const innerR = outerR * 0.42;
    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.65, `rgba(0,0,0,${(strength * 0.35).toFixed(3)})`);
    grad.addColorStop(1, `rgba(0,0,0,${strength.toFixed(3)})`);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 5. Analog Film Grain
  if (pp.filmGrain > 0) {
    const pat = ctx.createPattern(getGrainTile(), 'repeat');
    if (pat) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Math.max(0, Math.min(0.45, (pp.filmGrain / 100) * 0.55));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
