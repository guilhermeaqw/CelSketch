import { DrawingLayer, LayerTransformKeyframe, Point, PostProcessSettings, Stroke } from '../types/harmony';
import { LINE_SUT_TIP_URL, SKETCH_SUT_TIP_URL, SKETCH_SUT_PAPER_URL } from './customBrushAssets';
import { applyHslToCanvas, HsvAdjustment } from './hsvUtils';
import { applyLevelsToCanvas, LevelsAdjustment } from './levelsUtils';
import { applyPostProcessToCanvas, hasActivePostProcess } from './postProcessUtils';
import { traceSelectionPath } from './selectionUtils';
import { applyCameraTransformToCtx, getActiveCameraLayer, getInterpolatedCamera } from './cameraUtils';

// Preload extracted .sut brush tip & paper texture images
function preloadBrushImg(url: string): HTMLImageElement {
  const img = new Image();
  img.onload = () => {
    window.dispatchEvent(new Event('celsketch:image-loaded'));
  };
  img.src = url;
  return img;
}

const lineSutImg = preloadBrushImg(LINE_SUT_TIP_URL);
const sketchSutImg = preloadBrushImg(SKETCH_SUT_TIP_URL);
const sketchPaperImg = preloadBrushImg(SKETCH_SUT_PAPER_URL);

// Adaptive hardware detection & Eco mode scaling (runs smoothly on no-GPU PCs, scales up on strong GPUs)
let cachedWeakHardware: boolean | null = null;
let globalEcoMode = false;

export function detectIsWeakHardware(): boolean {
  if (cachedWeakHardware !== null) return cachedWeakHardware;
  try {
    const cores = navigator.hardwareConcurrency || 4;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) {
      cachedWeakHardware = true;
      return true;
    }
    const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const renderer = String((gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
      if (/swiftshader|basic render|llvmpipe|software|mesa|virgl/i.test(renderer)) {
        cachedWeakHardware = true;
        return true;
      }
    }
    cachedWeakHardware = cores <= 4;
  } catch {
    cachedWeakHardware = false;
  }
  return cachedWeakHardware;
}

export function setGlobalEcoMode(eco: boolean) {
  globalEcoMode = eco;
}

const tintedSutCache = new Map<string, HTMLCanvasElement>();
const filteredImageCache = new Map<string, HTMLCanvasElement>();
const FILTERED_IMAGE_CACHE_MAX = 64;

function getFilteredImage(
  imageDataUrl: string,
  img: HTMLImageElement,
  hsvSteps: HsvAdjustment[],
  levelsSteps: LevelsAdjustment[]
): HTMLCanvasElement {
  const hsvKey = hsvSteps.map((st) => `${st.h},${st.s},${st.v},${st.colorize ? 1 : 0}`).join('|');
  const lvlKey = levelsSteps
    .map((st) => `${st.blackPoint},${st.gamma},${st.whitePoint},${st.brightness},${st.contrast}`)
    .join('|');
  const key = `${imageDataUrl.length}:${imageDataUrl.slice(0, 64)}:${imageDataUrl.slice(-32)}:${hsvKey}#${lvlKey}`;
  const hit = filteredImageCache.get(key);
  if (hit) {
    filteredImageCache.delete(key);
    filteredImageCache.set(key, hit);
    return hit;
  }
  const out = document.createElement('canvas');
  let curSrc: HTMLImageElement | HTMLCanvasElement = img;
  if (hsvSteps.length > 0) {
    applyHslToCanvas(curSrc, out, hsvSteps);
    curSrc = out;
  }
  if (levelsSteps.length > 0) {
    applyLevelsToCanvas(curSrc, out, levelsSteps);
  }
  if (filteredImageCache.size >= FILTERED_IMAGE_CACHE_MAX) {
    const oldest = filteredImageCache.keys().next().value;
    if (oldest) filteredImageCache.delete(oldest);
  }
  filteredImageCache.set(key, out);
  return out;
}

function hexToRgbaZero(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},0)`;
    }
  }
  return 'rgba(0,0,0,0)';
}

// Reusable zero-allocation scratch canvas + cached paper pattern for Sketch.sut & brush compositing
let sketchScratchCanvas: HTMLCanvasElement | null = null;
let sketchScratchCtx: CanvasRenderingContext2D | null = null;
let sketchPaperPattern: CanvasPattern | null = null;
let blurScratchA: HTMLCanvasElement | null = null;
let blurScratchB: HTMLCanvasElement | null = null;

function getReusableCanvas(slot: 'A' | 'B', w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const cw = Math.min(3072, Math.max(1, Math.ceil(w)));
  const ch = Math.min(3072, Math.max(1, Math.ceil(h)));
  let c = slot === 'A' ? blurScratchA : blurScratchB;
  if (!c) {
    c = document.createElement('canvas');
    if (slot === 'A') blurScratchA = c;
    else blurScratchB = c;
  }
  if (c.width !== cw || c.height !== ch) {
    c.width = cw;
    c.height = ch;
  }
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, cw, ch);
  return { canvas: c, ctx };
}

function getSketchScratch(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; pattern: CanvasPattern | null } {
  const cw = Math.min(3072, Math.max(256, Math.ceil(Number.isFinite(w) ? w : 256)));
  const ch = Math.min(3072, Math.max(256, Math.ceil(Number.isFinite(h) ? h : 256)));
  if (!sketchScratchCanvas) {
    sketchScratchCanvas = document.createElement('canvas');
    sketchScratchCanvas.width = cw;
    sketchScratchCanvas.height = ch;
    sketchScratchCtx = sketchScratchCanvas.getContext('2d')!;
  } else if (sketchScratchCanvas.width < cw || sketchScratchCanvas.height < ch) {
    sketchScratchCanvas.width = Math.min(3072, Math.max(sketchScratchCanvas.width, cw));
    sketchScratchCanvas.height = Math.min(3072, Math.max(sketchScratchCanvas.height, ch));
    sketchPaperPattern = null; // re-create pattern after resize
  }
  const ctx = sketchScratchCtx!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  if (!sketchPaperPattern && sketchPaperImg.complete && sketchPaperImg.naturalWidth > 0) {
    sketchPaperPattern = ctx.createPattern(sketchPaperImg, 'repeat');
  }
  return { canvas: sketchScratchCanvas, ctx, pattern: sketchPaperPattern };
}

function getTintedSutTip(kind: 'line' | 'sketch', color: string): HTMLCanvasElement | null {
  const src = kind === 'line' ? lineSutImg : sketchSutImg;
  if (!src.complete || src.naturalWidth === 0) return null;
  const key = `sut:${kind}:${color}`;
  const cached = tintedSutCache.get(key);
  if (cached) return cached;
  if (tintedSutCache.size > 120) {
    const first = tintedSutCache.keys().next().value;
    if (first) tintedSutCache.delete(first);
  }
  const c = document.createElement('canvas');
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const cctx = c.getContext('2d')!;
  cctx.drawImage(src, 0, 0);
  cctx.globalCompositeOperation = 'source-in';
  cctx.fillStyle = color;
  cctx.fillRect(0, 0, c.width, c.height);
  tintedSutCache.set(key, c);
  return c;
}

export function getInterpolatedLayerTransform(
  layer: DrawingLayer,
  frame: number
): LayerTransformKeyframe {
  const base: LayerTransformKeyframe = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: layer.opacity
  };
  if (!layer.keyframes) return base;
  const keys = Object.keys(layer.keyframes)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) return base;
  if (layer.keyframes[frame]) return layer.keyframes[frame];
  if (frame <= keys[0]) return layer.keyframes[keys[0]];
  if (frame >= keys[keys.length - 1]) return layer.keyframes[keys[keys.length - 1]];

  // Smooth ease-in-out interpolation between surrounding keyframes
  let prevF = keys[0];
  let nextF = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i] <= frame && keys[i + 1] >= frame) {
      prevF = keys[i];
      nextF = keys[i + 1];
      break;
    }
  }
  const tRaw = (frame - prevF) / Math.max(1, nextF - prevF);
  const t = tRaw * tRaw * (3 - 2 * tRaw); // smoothstep ease
  const a = layer.keyframes[prevF];
  const b = layer.keyframes[nextF];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    rotation: a.rotation + (b.rotation - a.rotation) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t
  };
}

const MAX_IMAGE_CACHE = 480;
const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(dataUrl: string): HTMLImageElement {
  let img = imageCache.get(dataUrl);
  if (img) {
    // Refresh LRU order
    imageCache.delete(dataUrl);
    imageCache.set(dataUrl, img);
    return img;
  }
  img = new Image();
  img.onload = () => {
    window.dispatchEvent(new Event('celsketch:image-loaded'));
  };
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
  while (imageCache.size > MAX_IMAGE_CACHE) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) break;
    imageCache.delete(oldestKey);
  }
  return img;
}

/**
 * Preload and decode all image strokes in the requested frame range directly into imageCache
 * so exports, thumbnails, and previews never skip Paint Bucket fills or imported images.
 */
export async function preloadFrameImages(
  layers: DrawingLayer[],
  startFrame?: number,
  endFrame?: number
): Promise<void> {
  const urls = new Set<string>();
  for (const layer of layers) {
    if (layer.type === 'folder') continue;
    for (const [fKey, strokes] of Object.entries(layer.frames || {})) {
      const f = Number(fKey);
      // Include earlier frames too in case of holdFrames / celDurations carrying into startFrame..endFrame
      if (endFrame !== undefined && f > endFrame) continue;
      if (startFrame !== undefined && f < startFrame && !layer.holdFrames && !(layer.celDurations && (layer.celDurations[f] || 1) > 1)) {
        continue;
      }
      for (const st of strokes || []) {
        if (st.tool === 'image' && st.imageDataUrl) {
          urls.add(st.imageDataUrl);
        }
      }
    }
  }
  if (urls.size === 0) return;
  await Promise.all(
    Array.from(urls).map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = getCachedImage(url);
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const finish = () => {
            img.removeEventListener('load', finish);
            img.removeEventListener('error', finish);
            resolve();
          };
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        })
    )
  );
}

export function isLayerEffectivelyVisible(layer: DrawingLayer, allLayers: DrawingLayer[]): boolean {
  if (layer.type === 'folder') return false;
  if (!layer.visible) return false;
  // Walk full ancestor folder chain (supports nested folders)
  let curParentId = layer.parentId;
  let guard = 0;
  while (curParentId && guard < 16) {
    const parent = allLayers.find((l) => l.id === curParentId);
    if (!parent) break;
    if (!parent.visible) return false;
    curParentId = parent.parentId;
    guard++;
  }
  // If any layer is Soloed, only Soloed layers render!
  const anySolo = allLayers.some((l) => l.type !== 'folder' && l.solo);
  if (anySolo && !layer.solo) return false;
  return true;
}

export function getLayerEffectiveOpacity(layer: DrawingLayer, allLayers: DrawingLayer[], frame: number): number {
  const kf = getInterpolatedLayerTransform(layer, frame);
  let opacity = kf.opacity;
  let curParentId = layer.parentId;
  let guard = 0;
  while (curParentId && guard < 16) {
    const parent = allLayers.find((l) => l.id === curParentId);
    if (!parent) break;
    opacity *= parent.opacity;
    curParentId = parent.parentId;
    guard++;
  }
  return Math.max(0, Math.min(1, opacity));
}

/**
 * Returns the source start frame number whose strokes array is active on `frame`
 * (or 0 if empty). Allows bitmap caching to deduplicate held cels & holdFrames across frames!
 */
export function getEffectiveCelSourceFrame(layer: DrawingLayer, frame: number): number {
  if (layer.frames[frame] !== undefined) return frame;
  if (layer.celDurations) {
    for (let f = frame - 1; f >= 1; f--) {
      if (layer.frames[f] !== undefined) {
        const dur = layer.celDurations[f] || 1;
        if (dur > 1 && frame < f + dur) return f;
        break;
      }
    }
  }
  if (!layer.holdFrames) return 0;
  for (let f = frame - 1; f >= 1; f--) {
    if (layer.frames[f] !== undefined) return f;
  }
  return 0;
}

export function getEffectiveFrameStrokes(layer: DrawingLayer, frame: number): Stroke[] {
  const direct = layer.frames[frame];
  // Explicit frame entry (even `[]` blank Cel!) takes precedence and stops earlier hold/celDurations
  if (direct !== undefined) return direct;

  // Check explicit Cel Exposure blocks (e.g. celDurations[1] = 3 covers frames 1, 2, 3)
  if (layer.celDurations) {
    for (let f = frame - 1; f >= 1; f--) {
      if (layer.frames[f] !== undefined) {
        const dur = layer.celDurations[f] || 1;
        if (dur > 1 && frame < f + dur) {
          return layer.frames[f];
        }
        break;
      }
    }
  }

  if (!layer.holdFrames) return [];

  // Hold exposure: find the nearest previous frame entry (explicit blank `[]` stops hold!)
  for (let f = frame - 1; f >= 1; f--) {
    const prev = layer.frames[f];
    if (prev !== undefined) return prev;
  }
  return [];
}

/**
 * Zero-phase bidirectional Gaussian smoothing (Clip Studio / SAI style — eliminates hand tremor & digitizer waves
 * while preserving exact start/end points and zero lag/skew!)
 */
function smoothPoints(pts: Point[], strength: number, maxPassesOverride?: number): Point[] {
  if (pts.length < 3 || strength <= 0) return pts;

  // Normalize point spacing first so 240Hz tablets and 60Hz mice smooth identically!
  const spaced: Point[] = [pts[0]];
  let acc = 0;
  const targetStep = 3.0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 0.001) continue;
    acc += d;
    if (acc >= targetStep || i === pts.length - 1) {
      spaced.push(b);
      acc = 0;
    }
  }
  if (spaced.length < 3) return spaced;

  // Gentle micro-smoothing (1-2 passes max) since the live stabilizer already smooths pointer input in real time.
  // Never over-smooths or shrinks corners on pen-up!
  const rawPasses = strength > 50 ? 2 : 1;
  const passes = maxPassesOverride !== undefined ? Math.min(rawPasses, maxPassesOverride) : rawPasses;
  let cur = spaced.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure ?? 1 }));
  let next = cur.map((p) => ({ ...p }));

  for (let pass = 0; pass < passes; pass++) {
    next[0].x = cur[0].x;
    next[0].y = cur[0].y;
    next[0].pressure = cur[0].pressure;
    const last = cur.length - 1;
    next[last].x = cur[last].x;
    next[last].y = cur[last].y;
    next[last].pressure = cur[last].pressure;

    for (let i = 1; i < last; i++) {
      next[i].x = cur[i - 1].x * 0.25 + cur[i].x * 0.5 + cur[i + 1].x * 0.25;
      next[i].y = cur[i - 1].y * 0.25 + cur[i].y * 0.5 + cur[i + 1].y * 0.25;
      next[i].pressure = cur[i - 1].pressure * 0.2 + cur[i].pressure * 0.6 + cur[i + 1].pressure * 0.2;
    }
    const tmp = cur;
    cur = next;
    next = tmp;
  }
  return cur;
}

/**
 * Subdivide points along quadratic midpoints for silky-smooth curves
 */
function subdivideCurve(pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  const result: Point[] = [pts[0]];

  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = i === 1 ? pts[0] : {
      x: (pts[i - 1].x + pts[i].x) / 2,
      y: (pts[i - 1].y + pts[i].y) / 2,
      pressure: ((pts[i - 1].pressure ?? 1) + (pts[i].pressure ?? 1)) / 2
    };
    const p1 = pts[i];
    const p2 = i === pts.length - 2 ? pts[pts.length - 1] : {
      x: (pts[i].x + pts[i + 1].x) / 2,
      y: (pts[i].y + pts[i + 1].y) / 2,
      pressure: ((pts[i].pressure ?? 1) + (pts[i + 1].pressure ?? 1)) / 2
    };

    const dist = Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const steps = Math.max(2, Math.min(12, Math.ceil(dist / 3)));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const inv = 1 - t;
      const x = inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x;
      const y = inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y;
      const pressure =
        inv * inv * (p0.pressure ?? 1) +
        2 * inv * t * (p1.pressure ?? 1) +
        t * t * (p2.pressure ?? 1);
      result.push({ x, y, pressure });
    }
  }
  return result;
}

/**
 * Resample a polyline by exact Euclidean arc-length spacing (eliminates speed-dependent dots/blobs)
 */
interface ResampledPoint extends Point {
  angle: number;
  t: number; // normalized 0..1 progress along stroke
}

function resampleByDistance(pts: Point[], spacing: number): ResampledPoint[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) {
    return [{ ...pts[0], angle: 0, t: 0 }];
  }
  const step = Math.max(0.75, spacing);
  const out: ResampledPoint[] = [];
  let totalDist = 0;
  for (let i = 1; i < pts.length; i++) {
    totalDist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  if (totalDist < 0.001) {
    return [{ ...pts[0], angle: 0, t: 0 }];
  }

  let carry = 0;
  let walked = 0;
  const firstAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  out.push({ ...pts[0], angle: firstAngle, t: 0 });

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.0001) continue;
    const angle = Math.atan2(dy, dx);
    const pa = a.pressure ?? 1;
    const pb = b.pressure ?? 1;

    let d = step - carry;
    while (d <= segLen) {
      const f = d / segLen;
      out.push({
        x: a.x + dx * f,
        y: a.y + dy * f,
        pressure: pa + (pb - pa) * f,
        angle,
        t: Math.min(1, (walked + d) / totalDist)
      });
      d += step;
    }
    carry = segLen - (d - step);
    walked += segLen;
  }

  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  out.push({ ...last, angle: Math.atan2(last.y - prev.y, last.x - prev.x), t: 1 });

  // Smooth centered tangent angles over a ±2 neighbor window for zero angle jitter
  if (out.length >= 3) {
    for (let i = 0; i < out.length; i++) {
      const pA = out[Math.max(0, i - 2)];
      const pB = out[Math.min(out.length - 1, i + 2)];
      if (Math.hypot(pB.x - pA.x, pB.y - pA.y) > 0.01) {
        out[i].angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
      }
    }
  }
  return out;
}

/**
 * Deterministic hash for procedural brush grain (zero flicker across re-renders)
 */
function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Cached procedural tinted brush tip canvases (Graphite Grain, Bristle Tufts, Soft Gaussian, Watercolor Ring)
 */
const tipCache = new Map<string, HTMLCanvasElement>();

function getProceduralTip(kind: 'graphite' | 'pencil' | 'bristle' | 'soft' | 'water', color: string): HTMLCanvasElement {
  const key = `${kind}:${color}`;
  const cached = tipCache.get(key);
  if (cached) return cached;

  // Cap cache size to prevent unbounded growth
  if (tipCache.size > 160) {
    const firstKey = tipCache.keys().next().value;
    if (firstKey) tipCache.delete(firstKey);
  }

  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const half = S / 2;

  if (kind === 'soft') {
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'water') {
    // Soft translucent center + subtle darker wet-edge pigment ring
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, color);
    g.addColorStop(0.7, color);
    g.addColorStop(0.88, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(half, half, half * 0.84, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'bristle') {
    // Organic painterly multi-bristle tuft (18 fine hair fibers)
    ctx.fillStyle = color;
    for (let i = 0; i < 20; i++) {
      const a = hash2d(i, 1.7) * Math.PI * 2;
      const dist = Math.sqrt(hash2d(i, 3.1)) * (half * 0.78);
      const bx = half + Math.cos(a) * dist;
      const by = half + Math.sin(a) * dist;
      const rx = 3.2 + hash2d(i, 5.3) * 5.5;
      const ry = 1.6 + hash2d(i, 7.9) * 3.2;
      ctx.globalAlpha = 0.32 + hash2d(i, 9.2) * 0.55;
      ctx.beginPath();
      ctx.ellipse(bx, by, rx, ry, (hash2d(i, 11.4) - 0.5) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Graphite / Pencil: authentic organic paper-tooth grain mask
    const density = kind === 'graphite' ? 0.52 : 0.68;
    ctx.fillStyle = color;
    for (let py = 0; py < S; py += 2) {
      for (let px = 0; px < S; px += 2) {
        const dx = (px - half) / half;
        const dy = (py - half) / half;
        const r = Math.hypot(dx, dy);
        if (r > 0.96) continue;
        const falloff = Math.pow(1 - r, kind === 'graphite' ? 0.75 : 0.55);
        const grain = hash2d(px * 0.73, py * 0.73);
        const fine = hash2d(px * 1.9 + 13, py * 1.9 + 7);
        const v = (grain * 0.65 + fine * 0.35) * falloff;
        if (v > 1 - density) {
          ctx.globalAlpha = Math.min(1, (v - (1 - density)) * 2.6);
          ctx.fillRect(px, py, 2, 2);
        }
      }
    }
  }

  tipCache.set(key, c);
  return c;
}

/**
 * Render a silky-smooth filled variable-width ribbon polygon (zero jaggies, zero dot overlap)
 */
function renderVariableWidthRibbon(
  ctx: CanvasRenderingContext2D,
  rawPts: Point[],
  calcRadius: (p: number, idx: number, total: number) => number,
  chiselAngleRad?: number
) {
  if (rawPts.length === 0) return;

  // Deduplicate near-identical consecutive points so tangents/normals never flip or collapse!
  const pts: Point[] = [rawPts[0]];
  for (let i = 1; i < rawPts.length; i++) {
    const prev = pts[pts.length - 1];
    if (Math.hypot(rawPts[i].x - prev.x, rawPts[i].y - prev.y) >= 0.35) {
      pts.push(rawPts[i]);
    }
  }

  if (pts.length === 1) {
    const r = calcRadius(pts[0].pressure ?? 1, 0, 1);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const leftSide: { x: number; y: number }[] = [];
  const rightSide: { x: number; y: number }[] = [];
  let prevNx = 0;
  let prevNy = -1;

  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];

    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);

    let nx = prevNx;
    let ny = prevNy;
    if (chiselAngleRad !== undefined) {
      nx = Math.cos(chiselAngleRad);
      ny = Math.sin(chiselAngleRad);
    } else if (len > 0.01) {
      nx = -dy / len;
      ny = dx / len;
      // Keep normal orientation continuous on sharp hairpin turns to avoid bowtie self-intersection
      if (i > 0 && nx * prevNx + ny * prevNy < -0.5) {
        const sdx = curr.x - prev.x;
        const sdy = curr.y - prev.y;
        const slen = Math.hypot(sdx, sdy);
        if (slen > 0.01) {
          nx = -sdy / slen;
          ny = sdx / slen;
        }
      }
      prevNx = nx;
      prevNy = ny;
    }

    const r = calcRadius(curr.pressure ?? 1, i, pts.length);
    leftSide.push({ x: curr.x + nx * r, y: curr.y + ny * r });
    rightSide.push({ x: curr.x - nx * r, y: curr.y - ny * r });
  }

  // Single closed path combining ribbon + smooth round end-caps (zero double-composite blobs when opacity < 1!)
  ctx.beginPath();
  ctx.moveTo(leftSide[0].x, leftSide[0].y);
  for (let i = 1; i < leftSide.length; i++) {
    ctx.lineTo(leftSide[i].x, leftSide[i].y);
  }
  if (chiselAngleRad === undefined) {
    const lastIdx = pts.length - 1;
    const rEnd = calcRadius(pts[lastIdx].pressure ?? 1, lastIdx, pts.length);
    const endLeftAng = Math.atan2(leftSide[lastIdx].y - pts[lastIdx].y, leftSide[lastIdx].x - pts[lastIdx].x);
    const endRightAng = Math.atan2(rightSide[lastIdx].y - pts[lastIdx].y, rightSide[lastIdx].x - pts[lastIdx].x);
    ctx.arc(pts[lastIdx].x, pts[lastIdx].y, rEnd, endLeftAng, endRightAng, false);
  }
  for (let i = rightSide.length - 1; i >= 0; i--) {
    ctx.lineTo(rightSide[i].x, rightSide[i].y);
  }
  if (chiselAngleRad === undefined) {
    const rStart = calcRadius(pts[0].pressure ?? 1, 0, pts.length);
    const startRightAng = Math.atan2(rightSide[0].y - pts[0].y, rightSide[0].x - pts[0].x);
    const startLeftAng = Math.atan2(leftSide[0].y - pts[0].y, leftSide[0].x - pts[0].x);
    ctx.arc(pts[0].x, pts[0].y, rStart, startRightAng, startLeftAng, false);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Returns true if this stroke can be rendered in O(1) incremental segments onto a live stroke canvas
 * during pointermove, avoiding O(N^2) full-stroke re-rendering every animation frame.
 */
export interface LiveDabState {
  started: boolean;
  carry: number;
  dabIndex: number;
  lastPtIdx: number;
}

export function createLiveDabState(): LiveDabState {
  return { started: false, carry: 0, dabIndex: 0, lastPtIdx: 0 };
}

interface SteppedDab {
  x: number;
  y: number;
  pressure: number;
  angle: number;
  index: number;
}

/**
 * Deterministic stateful arc-length dab walker.
 * Running this incrementally as points arrive (live drawing) produces the EXACT same
 * sequence of dabs (position, pressure, angle, index) as running it once on pen-up!
 */
function stepDabsIncremental(
  pts: Point[],
  spacing: number,
  state: LiveDabState,
  emit: (dab: SteppedDab) => void
): void {
  if (pts.length === 0) return;
  const step = Math.max(0.75, spacing);

  if (!state.started) {
    emit({
      x: pts[0].x,
      y: pts[0].y,
      pressure: pts[0].pressure ?? 1,
      angle: 0,
      index: 0
    });
    state.started = true;
    state.carry = 0;
    state.dabIndex = 1;
    state.lastPtIdx = 0;
  }

  for (let i = Math.max(1, state.lastPtIdx + 1); i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    state.lastPtIdx = i;
    if (segLen < 0.0001) continue;

    const angle = Math.atan2(dy, dx);
    const pa = a.pressure ?? 1;
    const pb = b.pressure ?? 1;
    let d = step - state.carry;
    while (d <= segLen) {
      const f = d / segLen;
      emit({
        x: a.x + dx * f,
        y: a.y + dy * f,
        pressure: pa + (pb - pa) * f,
        angle,
        index: state.dabIndex++
      });
      d += step;
    }
    state.carry = segLen - (d - step);
  }
}

/**
 * Returns true if this stroke uses O(1) stateful incremental dab stamping (100% pixel-identical live & committed!).
 */
export function canRenderLiveIncremental(stroke: Stroke): boolean {
  if (stroke.tool !== 'brush' && stroke.tool !== 'pencil') return false;
  const p = stroke.preset || 'sai_pen';
  return (
    p === 'csp_line' ||
    p === 'sai_airbrush' ||
    p === 'sai_water' ||
    p === 'sai_brush' ||
    p === 'sai_marker' ||
    p === 'sai_binary' ||
    p === 'sketch_graphite' ||
    p === 'sai_pencil'
  );
}

/**
 * True if this incremental dab brush needs a scratch buffer at alpha=1 composited once at stroke.opacity
 * (non-compounding brushes like Line.sut and Binary Pen when opacity < 1).
 */
export function liveIncrementalUsesScratch(stroke: Stroke): boolean {
  const p = stroke.preset || 'sai_pen';
  return (p === 'csp_line' || p === 'sai_binary') && stroke.opacity < 0.99 && stroke.tool !== 'eraser';
}

function getIncrementalDabSpacing(preset: string, size: number, ecoMult: number): number {
  switch (preset) {
    case 'csp_line':
      return Math.max(1.5, size * 0.18) * ecoMult;
    case 'sai_airbrush':
      return Math.max(2.0, size * 0.22) * ecoMult;
    case 'sai_water':
      return Math.max(1.5, size * 0.16) * ecoMult;
    case 'sai_brush':
      return Math.max(1.2, size * 0.11) * ecoMult;
    case 'sai_marker':
      return Math.max(1.0, size * 0.08) * ecoMult;
    case 'sai_binary':
      return Math.max(1, Math.round(size) * 0.35);
    case 'sketch_graphite':
      return Math.max(1.0, size * 0.14) * ecoMult;
    case 'sai_pencil':
      return Math.max(1.0, size * 0.12) * ecoMult;
    default:
      return Math.max(1.5, size * 0.18) * ecoMult;
  }
}

/**
 * Shared dab-stamping routine used identically by BOTH live incremental drawing AND final committed renderStroke!
 * Guarantees 0.00% visual difference between drawing and releasing the mouse/pen.
 */
function renderIncrementalDabsWithState(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  state: LiveDabState,
  tipColor: string,
  baseOpacity: number,
  isScratchAlphaOne: boolean
): void {
  const preset = stroke.preset || 'sai_pen';
  const minRatio = stroke.minSizeRatio ?? 0.05;
  const ecoMult = globalEcoMode ? 1.55 : 1;
  const spacing = getIncrementalDabSpacing(preset, stroke.size, ecoMult);

  const calcDabRadius = (pressure: number) => {
    if (minRatio >= 0.99) return Math.max(0.4, stroke.size / 2);
    const p = Math.max(0.02, Math.min(1, pressure));
    const width = stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, 1.25));
    return Math.max(0.4, width / 2);
  };

  if (preset === 'csp_line') {
    const tip = getTintedSutTip('line', tipColor);
    if (!tip) return;
    const aspect = tip.height / Math.max(1, tip.width);
    ctx.globalAlpha = isScratchAlphaOne ? 1 : baseOpacity;
    stepDabsIncremental(stroke.points, spacing, state, (pt) => {
      const p = minRatio >= 0.99 ? 1 : Math.max(0.03, Math.min(1, pt.pressure));
      const diam =
        minRatio >= 0.99
          ? Math.max(1.2, stroke.size)
          : Math.max(1.2, stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, 1.38)));
      const w = diam * 0.85;
      const h = Math.max(w * 1.15, Math.min(diam * 2.2, w * aspect * 0.45));
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.angle + Math.PI / 2);
      ctx.drawImage(tip, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
  } else if (preset === 'sai_airbrush') {
    const tip = getProceduralTip('soft', tipColor);
    stepDabsIncremental(stroke.points, spacing, state, (pt) => {
      const p = minRatio >= 0.99 ? 1 : Math.max(0.05, Math.min(1, pt.pressure));
      const r = Math.max(2.5, calcDabRadius(p) * 1.45);
      ctx.globalAlpha = Math.min(1, baseOpacity * 0.11 * (0.35 + 0.65 * p));
      ctx.drawImage(tip, pt.x - r, pt.y - r, r * 2, r * 2);
    });
  } else if (preset === 'sai_water') {
    const tip = getProceduralTip('water', tipColor);
    stepDabsIncremental(stroke.points, spacing, state, (pt) => {
      const p = minRatio >= 0.99 ? 1 : Math.max(0.08, Math.min(1, pt.pressure));
      const r = Math.max(2, calcDabRadius(p) * 1.15);
      ctx.globalAlpha = Math.min(0.85, baseOpacity * 0.22 * (0.4 + 0.6 * p));
      ctx.drawImage(tip, pt.x - r, pt.y - r, r * 2, r * 2);
    });
  } else if (preset === 'sai_brush') {
    const tip = getProceduralTip('bristle', tipColor);
    stepDabsIncremental(stroke.points, spacing, state, (pt) => {
      const p = minRatio >= 0.99 ? 1 : Math.max(0.08, Math.min(1, pt.pressure));
      const r = Math.max(1.8, calcDabRadius(p) * 1.12);
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.angle);
      ctx.globalAlpha = Math.min(1, baseOpacity * (0.28 + 0.55 * p));
      ctx.drawImage(tip, -r, -r, r * 2, r * 2);
      ctx.restore();
    });
  } else if (preset === 'sai_marker') {
    ctx.fillStyle = tipColor;
    ctx.globalAlpha = Math.min(1, baseOpacity * 0.35);
    stepDabsIncremental(stroke.points, spacing, state, (pt) => {
      const p = minRatio >= 0.99 ? 1 : Math.max(0.2, Math.min(1, pt.pressure));
      const r = Math.max(1.5, calcDabRadius(p));
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  } else if (preset === 'sai_binary') {
    const sz = Math.max(1, Math.round(stroke.size));
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = tipColor;
    ctx.globalAlpha = isScratchAlphaOne ? 1 : baseOpacity;
    stepDabsIncremental(stroke.points, spacing, state, (pt) => {
      ctx.fillRect(Math.round(pt.x - sz / 2), Math.round(pt.y - sz / 2), sz, sz);
    });
  } else if (preset === 'sketch_graphite' || preset === 'sai_pencil') {
    const isGraphite = preset === 'sketch_graphite';
    const tip = getProceduralTip(isGraphite ? 'graphite' : 'pencil', tipColor);
    stepDabsIncremental(stroke.points, spacing, state, (pt) => {
      const p = minRatio >= 0.99 ? 1 : Math.max(0.05, Math.min(1, pt.pressure));
      const r = Math.max(1.2, calcDabRadius(p) * (isGraphite ? 1.18 : 1.05));
      const rot = hash2d(pt.index, Math.round(pt.x)) * Math.PI * 2;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(rot);
      ctx.globalAlpha = Math.min(1, baseOpacity * (isGraphite ? 0.22 + 0.72 * p : 0.3 + 0.68 * p));
      ctx.drawImage(tip, -r, -r, r * 2, r * 2);
      ctx.restore();
    });
  }
}

/**
 * O(1) incremental live stroke renderer for dab-stamped brushes.
 * Uses the exact same stepDabsIncremental + renderIncrementalDabsWithState engine as renderStroke(),
 * guaranteeing 100% pixel-identical shape & opacity when releasing the mouse/pen!
 */
export function renderLiveStrokeIncremental(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  state: LiveDabState,
  isScratchAlphaOne: boolean
): void {
  if (stroke.points.length === 0) return;
  ctx.save();
  try {
    if (stroke.clipPolys && stroke.clipPolys.length > 0) {
      const cw = ctx.canvas?.width || 10000;
      const ch = ctx.canvas?.height || 10000;
      traceSelectionPath(ctx, stroke.clipPolys, Boolean(stroke.clipInverted), cw, ch);
      ctx.clip('evenodd');
    }
    const tipColor = stroke.tool === 'eraser' ? '#000000' : stroke.color;
    ctx.globalCompositeOperation = isScratchAlphaOne
      ? 'source-over'
      : stroke.alphaLock
      ? 'source-atop'
      : 'source-over';
    ctx.fillStyle = tipColor;
    ctx.strokeStyle = tipColor;
    renderIncrementalDabsWithState(ctx, stroke, state, tipColor, stroke.opacity, isScratchAlphaOne);
  } finally {
    ctx.restore();
  }
}

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  tintColor?: string,
  opacityMultiplier = 1
) {
  if (stroke.points.length === 0 && stroke.tool !== 'image') return;

  ctx.save();
  try {
  // Clip stroke strictly inside active selection polygon(s) if drawn while a selection was active!
  if (stroke.clipPolys && stroke.clipPolys.length > 0) {
    const cw = ctx.canvas?.width || 10000;
    const ch = ctx.canvas?.height || 10000;
    traceSelectionPath(ctx, stroke.clipPolys, Boolean(stroke.clipInverted), cw, ch);
    ctx.clip('evenodd');
  }
  ctx.globalAlpha = stroke.opacity * opacityMultiplier;

  const activeColor = tintColor || stroke.color;

  if (stroke.tool === 'eraser' || stroke.tool === 'erase_poly') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = stroke.alphaLock ? 'source-atop' : 'source-over';
    ctx.strokeStyle = activeColor;
    ctx.fillStyle = activeColor;
  }

  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pts = stroke.points;

  if (stroke.tool === 'brush' || stroke.tool === 'pencil' || stroke.tool === 'eraser') {
    const minRatio = stroke.minSizeRatio ?? 0.05;
    const preset = stroke.preset || 'sai_pen';
    const ecoMult = globalEcoMode ? 1.55 : 1;
    const tipColor = stroke.tool === 'eraser' ? '#000000' : activeColor;
    const baseOp = stroke.opacity * opacityMultiplier;

    // Unified deterministic path for all 8 incremental dab brushes (100% pixel-identical live & committed!)
    if (
      stroke.tool !== 'eraser' &&
      (preset === 'csp_line' ||
        preset === 'sai_airbrush' ||
        preset === 'sai_water' ||
        preset === 'sai_brush' ||
        preset === 'sai_marker' ||
        preset === 'sai_binary' ||
        preset === 'sketch_graphite' ||
        preset === 'sai_pencil')
    ) {
      const needsScratch = (preset === 'csp_line' || preset === 'sai_binary') && baseOp < 0.99;
      if (needsScratch) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of pts) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        const pad = Math.ceil(stroke.size * 2.2) + 8;
        const bx = Math.floor(minX - pad);
        const by = Math.floor(minY - pad);
        const bw = Math.max(4, Math.ceil(maxX - minX + pad * 2));
        const bh = Math.max(4, Math.ceil(maxY - minY + pad * 2));
        const scratch = bw <= 3072 && bh <= 3072 ? getSketchScratch(bw, bh) : null;
        if (scratch) {
          const sctx = scratch.ctx;
          sctx.clearRect(0, 0, bw, bh);
          sctx.save();
          sctx.translate(-bx, -by);
          renderIncrementalDabsWithState(sctx, stroke, createLiveDabState(), tipColor, 1, true);
          sctx.restore();
          if (preset === 'sai_binary') ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = baseOp;
          ctx.drawImage(scratch.canvas, 0, 0, bw, bh, bx, by, bw, bh);
          return;
        }
      }
      renderIncrementalDabsWithState(ctx, stroke, createLiveDabState(), tipColor, baseOp, false);
      return;
    }

    const smoothed = smoothPoints(pts, stroke.smoothing ?? 35);
    const curvePts = subdivideCurve(smoothed);

    const calcRadius = (pressure: number, idx: number, total: number) => {
      // Uniform single size when pen pressure is disabled (minRatio >= 0.99)
      if (minRatio >= 0.99) {
        return Math.max(0.4, stroke.size / 2);
      }
      const p = Math.max(0.02, Math.min(1, pressure));
      const curveExp = preset === 'sai_inkpen' ? 1.72 : preset === 'sai_pen' ? 1.35 : 1.25;
      let width = stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, curveExp));

      // Smooth organic taper at start and end of Pen / InkPen strokes (only when pressure is enabled)
      if ((preset === 'sai_pen' || preset === 'sai_inkpen') && total > 8) {
        const taperLen = Math.min(8, Math.floor(total * 0.18));
        if (idx < taperLen) {
          const f = idx / taperLen;
          width *= 0.32 + 0.68 * (f * f * (3 - 2 * f));
        } else if (idx > total - 1 - taperLen) {
          const f = (total - 1 - idx) / taperLen;
          width *= 0.25 + 0.75 * (f * f * (3 - 2 * f));
        }
      }
      return Math.max(0.4, width / 2);
    };

    if (preset === 'csp_sketch') {
      // Sketch.sut (鉛筆R): zero-allocation reusable scratch canvas + world-space paper grain
      const tip = getTintedSutTip('sketch', tipColor);
      if (tip) {
        const spacing = Math.max(1.8, stroke.size * 0.22) * ecoMult;
        const dabs = resampleByDistance(curvePts, spacing);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of dabs) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        const pad = Math.ceil(stroke.size * 1.4) + 6;
        const bx = Math.floor(minX - pad);
        const by = Math.floor(minY - pad);
        const bw = Math.max(4, Math.ceil(maxX - minX + pad * 2));
        const bh = Math.max(4, Math.ceil(maxY - minY + pad * 2));

        const usePaper = sketchPaperImg.complete && sketchPaperImg.naturalWidth > 0 && bw <= 3072 && bh <= 3072;
        const scratch = usePaper ? getSketchScratch(bw, bh) : null;
        const targetCtx = scratch ? scratch.ctx : ctx;

        if (scratch) {
          targetCtx.clearRect(0, 0, bw, bh);
          targetCtx.save();
          targetCtx.translate(-bx, -by);
        }

        const aspect = tip.height / Math.max(1, tip.width);
        for (let i = 0; i < dabs.length; i++) {
          const pt = dabs[i];
          const p = minRatio >= 0.99 ? 1 : Math.max(0.05, Math.min(1, pt.pressure ?? 1));
          const diam =
            minRatio >= 0.99
              ? Math.max(1.5, stroke.size)
              : Math.max(1.5, stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, 1.25)));
          const w = diam * 1.15;
          const h = diam * aspect * 0.58;
          const randRot = (hash2d(i, Math.round(pt.x)) - 0.5) * (Math.PI * 0.5);
          targetCtx.save();
          targetCtx.translate(pt.x, pt.y);
          targetCtx.rotate(pt.angle + randRot);
          targetCtx.globalAlpha = Math.min(1, 0.73 * (0.28 + 0.72 * p) * (scratch ? 1 : stroke.opacity * opacityMultiplier));
          targetCtx.drawImage(tip, -w / 2, -h / 2, w, h);
          targetCtx.restore();
        }

        if (scratch) {
          targetCtx.restore();
          if (scratch.pattern) {
            const pw = sketchPaperImg.naturalWidth;
            const ph = sketchPaperImg.naturalHeight;
            const ox = ((bx % pw) + pw) % pw;
            const oy = ((by % ph) + ph) % ph;
            targetCtx.save();
            targetCtx.globalCompositeOperation = 'destination-out';
            targetCtx.globalAlpha = 0.42;
            targetCtx.translate(-ox, -oy);
            targetCtx.fillStyle = scratch.pattern;
            targetCtx.fillRect(ox, oy, bw + pw, bh + ph);
            targetCtx.restore();
          }
          ctx.globalAlpha = stroke.opacity * opacityMultiplier;
          ctx.drawImage(scratch.canvas, 0, 0, bw, bh, bx, by, bw, bh);
        }
      } else {
        renderVariableWidthRibbon(ctx, curvePts, calcRadius);
      }
    } else if (preset === 'sai_airbrush') {
      // Distance-resampled Gaussian Feathered Airbrush / Soft Eraser
      const tip = getProceduralTip('soft', tipColor);
      const spacing = Math.max(2.0, stroke.size * 0.22) * ecoMult;
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = minRatio >= 0.99 ? 1 : Math.max(0.05, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(2.5, calcRadius(p, i, dabs.length) * 1.45);
        ctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * 0.11 * (0.35 + 0.65 * p));
        ctx.drawImage(tip, pt.x - r, pt.y - r, r * 2, r * 2);
      }
    } else if (preset === 'blur_soft' && stroke.tool !== 'eraser') {
      // Real Pixel Blur Brush: softly blurs existing pixels on the layer along the stroke path!
      const srcCanvas = ctx.canvas;
      if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0 && curvePts.length > 0) {
        const spacing = Math.max(3, stroke.size * 0.28) * ecoMult;
        const dabs = resampleByDistance(curvePts, spacing);
        const maxR = Math.max(4, stroke.size * 0.85);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of dabs) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        const pad = Math.ceil(maxR + 14);
        const bx = Math.max(0, Math.floor(minX - pad));
        const by = Math.max(0, Math.floor(minY - pad));
        const ex = Math.min(srcCanvas.width, Math.ceil(maxX + pad));
        const ey = Math.min(srcCanvas.height, Math.ceil(maxY + pad));
        const bw = ex - bx;
        const bh = ey - by;
        if (bw > 2 && bh > 2) {
          const blurPx = Math.max(1.5, Math.min(14, stroke.size * 0.18 * stroke.opacity));
          const blurBuf = getReusableCanvas('A', bw, bh);
          const maskBuf = getReusableCanvas('B', bw, bh);
          if (blurBuf && maskBuf) {
            const { canvas: blurCanvas, ctx: bctx } = blurBuf;
            const { canvas: maskCanvas, ctx: mctx } = maskBuf;
            bctx.filter = `blur(${blurPx.toFixed(1)}px)`;
            bctx.drawImage(srcCanvas, bx, by, bw, bh, 0, 0, bw, bh);
            bctx.filter = 'none';
            const softTip = getProceduralTip('soft', '#000000');
            for (let i = 0; i < dabs.length; i++) {
              const pt = dabs[i];
              const p = minRatio >= 0.99 ? 1 : Math.max(0.15, Math.min(1, pt.pressure ?? 1));
              const r = Math.max(3, calcRadius(p, i, dabs.length) * 1.15);
              mctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * (0.35 + 0.65 * p));
              mctx.drawImage(softTip, pt.x - bx - r, pt.y - by - r, r * 2, r * 2);
            }
            bctx.globalCompositeOperation = 'destination-in';
            bctx.drawImage(maskCanvas, 0, 0);
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-atop';
            ctx.drawImage(blurCanvas, bx, by);
            ctx.restore();
          }
        }
      }
    } else if (preset === 'blur_smudge' && stroke.tool !== 'eraser') {
      // Real Pixel Smudge Brush: picks up existing pixels and drags/blends them along the stroke!
      const srcCanvas = ctx.canvas;
      if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0 && curvePts.length > 0) {
        const spacing = Math.max(2, stroke.size * 0.18) * ecoMult;
        const dabs = resampleByDistance(curvePts, spacing);
        const brushDiam = Math.max(6, Math.min(160, Math.round(stroke.size * 1.25)));
        const half = brushDiam / 2;
        const pickupBuf = getReusableCanvas('A', brushDiam, brushDiam);
        const softTip = getProceduralTip('soft', '#000000');
        if (pickupBuf && dabs.length > 0) {
          const { canvas: pickup, ctx: pctx } = pickupBuf;
          // Initialize pickup from first dab
          pctx.clearRect(0, 0, brushDiam, brushDiam);
          pctx.drawImage(srcCanvas, dabs[0].x - half, dabs[0].y - half, brushDiam, brushDiam, 0, 0, brushDiam, brushDiam);
          pctx.globalCompositeOperation = 'destination-in';
          pctx.drawImage(softTip, 0, 0, brushDiam, brushDiam);
          pctx.globalCompositeOperation = 'source-over';

          const strength = Math.max(0.15, Math.min(0.88, stroke.opacity * opacityMultiplier * 0.78));
          for (let i = 1; i < dabs.length; i++) {
            const pt = dabs[i];
            const p = minRatio >= 0.99 ? 1 : Math.max(0.15, Math.min(1, pt.pressure ?? 1));
            const dabAlpha = Math.min(0.92, strength * (0.4 + 0.6 * p));
            ctx.save();
            ctx.globalAlpha = dabAlpha;
            ctx.drawImage(pickup, pt.x - half, pt.y - half, brushDiam, brushDiam);
            ctx.restore();

            // Refresh pickup buffer from the newly blended canvas area
            pctx.globalCompositeOperation = 'source-over';
            pctx.globalAlpha = 0.35;
            pctx.drawImage(srcCanvas, pt.x - half, pt.y - half, brushDiam, brushDiam, 0, 0, brushDiam, brushDiam);
            pctx.globalAlpha = 1;
            pctx.globalCompositeOperation = 'destination-in';
            pctx.drawImage(softTip, 0, 0, brushDiam, brushDiam);
            pctx.globalCompositeOperation = 'source-over';
          }
        }
      }
    } else if (preset === 'blur_soft' || preset === 'blur_smudge') {
      // Eraser fallback if user selected soft blur/smudge preset as eraser
      const tip = getProceduralTip('soft', tipColor);
      const spacing = Math.max(2.0, stroke.size * 0.22) * ecoMult;
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = Math.max(0.05, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(2.5, calcRadius(p, i, dabs.length) * 1.45);
        ctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * 0.14 * (0.35 + 0.65 * p));
        ctx.drawImage(tip, pt.x - r, pt.y - r, r * 2, r * 2);
      }
    } else if (preset === 'sai_water') {
      // Watercolor Wash: distance-resampled translucent pigment with subtle wet-edge ring
      const tip = getProceduralTip('water', tipColor);
      const spacing = Math.max(1.5, stroke.size * 0.16) * ecoMult;
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = minRatio >= 0.99 ? 1 : Math.max(0.08, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(2, calcRadius(p, i, dabs.length) * 1.15);
        ctx.globalAlpha = Math.min(0.85, stroke.opacity * opacityMultiplier * 0.22 * (0.4 + 0.6 * p));
        ctx.drawImage(tip, pt.x - r, pt.y - r, r * 2, r * 2);
      }
    } else if (preset === 'sai_brush') {
      // Painterly Bristle Brush: rotating multi-strand bristles along stroke direction + pressure buildup
      const tip = getProceduralTip('bristle', tipColor);
      const spacing = Math.max(1.2, stroke.size * 0.11) * ecoMult;
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = minRatio >= 0.99 ? 1 : Math.max(0.08, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(1.8, calcRadius(p, i, dabs.length) * 1.12);
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.angle);
        ctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * (0.28 + 0.55 * p));
        ctx.drawImage(tip, -r, -r, r * 2, r * 2);
        ctx.restore();
      }
    } else if (preset === 'sai_marker') {
      // Alcohol Chisel Marker: smooth distance-resampled 45-degree rounded chisel nib
      const spacing = Math.max(1, stroke.size * 0.08) * ecoMult;
      const dabs = resampleByDistance(curvePts, spacing);
      ctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * 0.35);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = minRatio >= 0.99 ? 1 : Math.max(0.2, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(1.5, calcRadius(p, i, dabs.length));
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.25, r * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (preset === 'sai_binary') {
      // Crisp Binary Pen / Binary Eraser (distance-stepped, zero anti-aliasing, zero alpha compounding)
      const sz = Math.max(1, Math.round(stroke.size));
      const dabs = resampleByDistance(curvePts, Math.max(1, sz * 0.35));
      const baseOp = stroke.opacity * opacityMultiplier;
      if (baseOp >= 0.99 || stroke.tool === 'eraser') {
        ctx.imageSmoothingEnabled = false;
        for (const pt of dabs) {
          ctx.fillRect(Math.round(pt.x - sz / 2), Math.round(pt.y - sz / 2), sz, sz);
        }
      } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of dabs) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        const bx = Math.floor(minX - sz);
        const by = Math.floor(minY - sz);
        const bw = Math.max(1, Math.ceil(maxX - bx + sz + 1));
        const bh = Math.max(1, Math.ceil(maxY - by + sz + 1));
        const scratch = bw <= 3072 && bh <= 3072 ? getSketchScratch(bw, bh) : null;
        if (scratch) {
          const { canvas: sc, ctx: sctx } = scratch;
          sctx.clearRect(0, 0, bw, bh);
          sctx.imageSmoothingEnabled = false;
          sctx.fillStyle = activeColor;
          for (const pt of dabs) {
            sctx.fillRect(Math.round(pt.x - sz / 2) - bx, Math.round(pt.y - sz / 2) - by, sz, sz);
          }
          ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = baseOp;
          ctx.drawImage(sc, 0, 0, bw, bh, bx, by, bw, bh);
        } else {
          ctx.imageSmoothingEnabled = false;
          for (const pt of dabs) {
            ctx.fillRect(Math.round(pt.x - sz / 2), Math.round(pt.y - sz / 2), sz, sz);
          }
        }
      }
    } else if (preset === 'sai_opacity_pen') {
      // Crisp Hard-Edge Value/Opacity Pen (PaintTool SAI style):
      // Fixed clean width, pen pressure controls opacity/value with ZERO internal compounding,
      // ZERO polka-dots, and crisp hard edges! Passing another stroke over it glazes/darkens cleanly!
      const r = Math.max(0.75, stroke.size / 2);
      const baseOp = stroke.opacity * opacityMultiplier;
      const dabs = resampleByDistance(curvePts, Math.max(1.2, r * 0.35) * ecoMult);
      if (dabs.length === 0) {
        // nothing
      } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of dabs) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        const pad = Math.ceil(r) + 4;
        const bx = Math.floor(minX - pad);
        const by = Math.floor(minY - pad);
        const bw = Math.max(4, Math.ceil(maxX - minX + pad * 2));
        const bh = Math.max(4, Math.ceil(maxY - minY + pad * 2));
        const scratch = bw <= 3072 && bh <= 3072 ? getSketchScratch(bw, bh) : null;

        if (scratch) {
          const sctx = scratch.ctx;
          sctx.clearRect(0, 0, bw, bh);
          sctx.save();
          sctx.translate(-bx, -by);

          if (minRatio >= 0.99 || stroke.tool === 'eraser') {
            // Uniform hard-edge opacity across entire stroke (single crisp pass!)
            sctx.fillStyle = tipColor;
            sctx.strokeStyle = tipColor;
            sctx.lineWidth = r * 2;
            sctx.lineCap = 'round';
            sctx.lineJoin = 'round';
            sctx.globalAlpha = 1;
            sctx.beginPath();
            if (dabs.length === 1) {
              sctx.arc(dabs[0].x, dabs[0].y, r, 0, Math.PI * 2);
              sctx.fill();
            } else {
              sctx.moveTo(dabs[0].x, dabs[0].y);
              for (let i = 1; i < dabs.length; i++) sctx.lineTo(dabs[i].x, dabs[i].y);
              sctx.stroke();
            }
            sctx.restore();
            ctx.globalAlpha = baseOp;
            ctx.drawImage(scratch.canvas, 0, 0, bw, bh, bx, by, bw, bh);
          } else {
            // Bucketed max-alpha hard-edge rendering: 16 clean pressure levels from lowest -> highest!
            // Each level clears its footprint before stamping exact bucket alpha -> ZERO internal buildup & crisp hard edge!
            const BUCKETS = 16;
            const buckets: Array<typeof dabs> = Array.from({ length: BUCKETS }, () => []);
            for (let i = 0; i < dabs.length; i++) {
              const pt = dabs[i];
              const p = Math.max(0.03, Math.min(1, pt.pressure ?? 1));
              const targetAlpha = Math.min(1, baseOp * (minRatio + (1 - minRatio) * Math.pow(p, 1.3)));
              const bi = Math.max(0, Math.min(BUCKETS - 1, Math.round(targetAlpha * (BUCKETS - 1))));
              buckets[bi].push(pt);
            }
            sctx.fillStyle = tipColor;
            for (let b = 0; b < BUCKETS; b++) {
              const list = buckets[b];
              if (list.length === 0) continue;
              const bucketAlpha = (b + 1) / BUCKETS;
              sctx.beginPath();
              for (let i = 0; i < list.length; i++) {
                const pt = list[i];
                sctx.moveTo(pt.x + r, pt.y);
                sctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
              }
              sctx.globalCompositeOperation = 'destination-out';
              sctx.globalAlpha = 1;
              sctx.fill();
              sctx.globalCompositeOperation = 'source-over';
              sctx.globalAlpha = bucketAlpha;
              sctx.fill();
            }
            sctx.restore();
            ctx.globalAlpha = 1;
            ctx.drawImage(scratch.canvas, 0, 0, bw, bh, bx, by, bw, bh);
          }
        } else {
          // Fallback for giant >3072px stroke
          ctx.globalAlpha = baseOp;
          ctx.lineWidth = r * 2;
          ctx.beginPath();
          ctx.moveTo(dabs[0].x, dabs[0].y);
          for (let i = 1; i < dabs.length; i++) ctx.lineTo(dabs[i].x, dabs[i].y);
          ctx.stroke();
        }
      }
    } else if (preset === 'sketch_graphite' || preset === 'sai_pencil') {
      // Authentic Textured Graphite / 2B Pencil: paper-grain dabs with pressure-to-opacity & subtle rotation
      const isGraphite = preset === 'sketch_graphite';
      const tip = getProceduralTip(isGraphite ? 'graphite' : 'pencil', tipColor);
      const spacing = Math.max(1, stroke.size * (isGraphite ? 0.14 : 0.12)) * ecoMult;
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = minRatio >= 0.99 ? 1 : Math.max(0.05, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(1.2, calcRadius(p, i, dabs.length) * (isGraphite ? 1.18 : 1.05));
        const rot = hash2d(i, Math.round(pt.x)) * Math.PI * 2;
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(rot);
        ctx.globalAlpha = Math.min(
          1,
          stroke.opacity * opacityMultiplier * (isGraphite ? 0.22 + 0.72 * p : 0.3 + 0.68 * p)
        );
        ctx.drawImage(tip, -r, -r, r * 2, r * 2);
        ctx.restore();
      }
    } else {
      // G-Pen, InkPen, and Eraser: ultra-smooth filled variable-width ribbon
      renderVariableWidthRibbon(ctx, curvePts, calcRadius);
    }
  } else if (stroke.tool === 'line' && pts.length >= 2) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else if (stroke.tool === 'rectangle' && pts.length >= 2) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (stroke.filled) {
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.strokeRect(x, y, w, h);
    }
  } else if (stroke.tool === 'ellipse' && pts.length >= 2) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (stroke.filled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  } else if (stroke.tool === 'image' && stroke.imageDataUrl) {
    const img = getCachedImage(stroke.imageDataUrl);
    if (img.complete && img.naturalWidth > 0) {
      // Optional Onion-Skin tinting for image strokes (Paint Bucket fills, cutouts, etc.)
      let drawSource: CanvasImageSource = img;
      if (tintColor) {
        const tw = img.naturalWidth;
        const th = img.naturalHeight;
        const tintCanvas = document.createElement('canvas');
        tintCanvas.width = tw;
        tintCanvas.height = th;
        const tctx = tintCanvas.getContext('2d');
        if (tctx) {
          tctx.drawImage(img, 0, 0);
          tctx.globalCompositeOperation = 'source-in';
          tctx.fillStyle = tintColor;
          tctx.fillRect(0, 0, tw, th);
          drawSource = tintCanvas;
        }
      } else if (
        (stroke.hsvFilters && stroke.hsvFilters.length > 0) ||
        stroke.hsvFilter ||
        (stroke.levelsFilters && stroke.levelsFilters.length > 0)
      ) {
        const hsvSteps =
          stroke.hsvFilters && stroke.hsvFilters.length > 0
            ? stroke.hsvFilters
            : stroke.hsvFilter
              ? [stroke.hsvFilter]
              : [];
        const lvlSteps = stroke.levelsFilters || [];
        if (hsvSteps.length > 0 || lvlSteps.length > 0) {
          drawSource = getFilteredImage(stroke.imageDataUrl, img, hsvSteps, lvlSteps);
        }
      }
      if (stroke.imageQuad) {
        // Exact quad rendering (supports rotation, flip H/V, skew, and 4-corner perspective!)
        const { tl, tr, br, bl } = stroke.imageQuad;
        const sw = img.naturalWidth;
        const sh = img.naturalHeight;
        // Check if quad is affine (parallelogram: tl + br ≈ tr + bl) -> single exact affine transform (zero seam!)
        const affineErr =
          Math.hypot(tl.x + br.x - (tr.x + bl.x), tl.y + br.y - (tr.y + bl.y));
        if (affineErr < 0.75) {
          ctx.save();
          ctx.transform(
            (tr.x - tl.x) / sw,
            (tr.y - tl.y) / sw,
            (bl.x - tl.x) / sh,
            (bl.y - tl.y) / sh,
            tl.x,
            tl.y
          );
          ctx.drawImage(drawSource, 0, 0, sw, sh);
          ctx.restore();
        } else {
          // Perspective / non-affine quad: 4x4 bilinear patch grid with 0.5px outward seam expansion
          const N = 4;
          const bilerp = (u: number, v: number) => ({
            x:
              (1 - u) * (1 - v) * tl.x +
              u * (1 - v) * tr.x +
              u * v * br.x +
              (1 - u) * v * bl.x,
            y:
              (1 - u) * (1 - v) * tl.y +
              u * (1 - v) * tr.y +
              u * v * br.y +
              (1 - u) * v * bl.y
          });
          const expandPt = (p: { x: number; y: number }, cx: number, cy: number, px = 0.5) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const len = Math.hypot(dx, dy) || 1;
            return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
          };
          const drawTri = (
            u0: number, v0: number, u1: number, v1: number, u2: number, v2: number,
            p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }
          ) => {
            const x0 = u0 * sw, y0 = v0 * sh;
            const x1 = u1 * sw, y1 = v1 * sh;
            const x2 = u2 * sw, y2 = v2 * sh;
            const denom = x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1);
            if (Math.abs(denom) < 1e-4) return;
            const a = (p0.x * (y1 - y2) - y0 * (p1.x - p2.x) + (p1.x * y2 - p2.x * y1)) / denom;
            const b = (p0.y * (y1 - y2) - y0 * (p1.y - p2.y) + (p1.y * y2 - p2.y * y1)) / denom;
            const c = (x0 * (p1.x - p2.x) - p0.x * (x1 - x2) + (x1 * p2.x - x2 * p1.x)) / denom;
            const d = (x0 * (p1.y - p2.y) - p0.y * (x1 - x2) + (x1 * p2.y - x2 * p1.y)) / denom;
            const e = (x0 * (y1 * p2.x - y2 * p1.x) - y0 * (x1 * p2.x - x2 * p1.x) + p0.x * (x1 * y2 - x2 * y1)) / denom;
            const f = (x0 * (y1 * p2.y - y2 * p1.y) - y0 * (x1 * p2.y - x2 * p1.y) + p0.y * (x1 * y2 - x2 * y1)) / denom;

            const mcx = (p0.x + p1.x + p2.x) / 3;
            const mcy = (p0.y + p1.y + p2.y) / 3;
            const ep0 = expandPt(p0, mcx, mcy);
            const ep1 = expandPt(p1, mcx, mcy);
            const ep2 = expandPt(p2, mcx, mcy);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ep0.x, ep0.y);
            ctx.lineTo(ep1.x, ep1.y);
            ctx.lineTo(ep2.x, ep2.y);
            ctx.closePath();
            ctx.clip();
            ctx.transform(a, b, c, d, e, f);
            ctx.drawImage(drawSource, 0, 0, sw, sh);
            ctx.restore();
          };
          for (let gy = 0; gy < N; gy++) {
            for (let gx = 0; gx < N; gx++) {
              const u0 = gx / N, u1 = (gx + 1) / N;
              const v0 = gy / N, v1 = (gy + 1) / N;
              const p00 = bilerp(u0, v0);
              const p10 = bilerp(u1, v0);
              const p11 = bilerp(u1, v1);
              const p01 = bilerp(u0, v1);
              drawTri(u0, v0, u1, v0, u1, v1, p00, p10, p11);
              drawTri(u0, v0, u1, v1, u0, v1, p00, p11, p01);
            }
          }
        }
      } else {
        ctx.drawImage(
          drawSource,
          stroke.imageX ?? 0,
          stroke.imageY ?? 0,
          stroke.imageW ?? img.naturalWidth,
          stroke.imageH ?? img.naturalHeight
        );
      }
    }
  } else if (stroke.tool === 'text' && stroke.text && pts.length >= 1) {
    const fSize = stroke.fontSize || 48;
    const fWeight = stroke.fontBold ? 'bold' : 'normal';
    const fStyle = stroke.fontItalic ? 'italic' : 'normal';
    const fFamily = stroke.fontFamily || 'Segoe UI';
    ctx.font = `${fStyle} ${fWeight} ${fSize}px "${fFamily}", sans-serif`;
    ctx.textBaseline = 'top';
    const lines = stroke.text.split(/\r?\n/);
    const lineHeight = fSize * 1.2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], pts[0].x, pts[0].y + i * lineHeight);
    }
  } else if (stroke.tool === 'gradient' && pts.length >= 2) {
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    const cw = ctx.canvas?.width || 4096;
    const ch = ctx.canvas?.height || 4096;
    const dist = Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y));
    const grad =
      stroke.gradientMode === 'radial'
        ? ctx.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, dist)
        : ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    grad.addColorStop(0, activeColor);
    if (stroke.gradientToTransparent || tintColor) {
      grad.addColorStop(1, hexToRgbaZero(activeColor));
    } else {
      grad.addColorStop(1, stroke.secondaryColor || '#ffffff');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  } else if ((stroke.tool === 'fill' || stroke.tool === 'erase_poly') && pts.length >= 3) {
    const allPolys = stroke.extraPolys && stroke.extraPolys.length > 0 ? [pts, ...stroke.extraPolys] : [pts];
    ctx.beginPath();
    if (stroke.inverted) {
      ctx.rect(-10000, -10000, 20000, 20000);
    }
    for (const poly of allPolys) {
      if (poly.length < 3) continue;
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x, poly[i].y);
      }
      ctx.closePath();
    }
    ctx.fill(stroke.inverted || allPolys.length > 1 ? 'evenodd' : 'nonzero');
  } else if (stroke.tool === 'fill' && pts.length >= 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, stroke.size * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  } finally {
    ctx.restore();
  }
}

export function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  layers: DrawingLayer[],
  frame: number,
  width: number,
  height: number,
  bgColor: string | null = '#ffffff',
  useCamera = true,
  postProcess?: PostProcessSettings | null
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Apply 2D Camera layer transform if present, visible, and enabled!
  const camLayer = useCamera ? getActiveCameraLayer(layers) : null;
  const hasCam = Boolean(camLayer);
  if (hasCam && camLayer) {
    const cam = getInterpolatedCamera(camLayer, frame);
    ctx.save();
    applyCameraTransformToCtx(ctx, cam, width, height);
  }

  // Render drawing layers bottom-to-top with proper clipping-mask group compositing & folder opacity!
  const ordered = [...layers].reverse().filter((l) => l.type !== 'camera' && isLayerEffectivelyVisible(l, layers));
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = width;
  layerCanvas.height = height;
  const lctx = layerCanvas.getContext('2d');
  if (!lctx) return;

  let groupCanvas: HTMLCanvasElement | null = null;
  let gctx: CanvasRenderingContext2D | null = null;

  const drawTransformedLayer = (targetCtx: CanvasRenderingContext2D, layer: DrawingLayer, compositeOp: GlobalCompositeOperation) => {
    const strokes = getEffectiveFrameStrokes(layer, frame);
    if (strokes.length === 0) return false;
    lctx.clearRect(0, 0, width, height);
    for (const st of strokes) {
      renderStroke(lctx, st);
    }
    const kf = getInterpolatedLayerTransform(layer, frame);
    targetCtx.save();
    targetCtx.globalAlpha = getLayerEffectiveOpacity(layer, layers, frame);
    targetCtx.globalCompositeOperation = compositeOp;
    if (layer.effects) {
      const filters: string[] = [];
      if (layer.effects.blur > 0) filters.push(`blur(${layer.effects.blur}px)`);
      if (layer.effects.glow > 0) {
        filters.push(`drop-shadow(0 0 ${layer.effects.glow}px ${layer.effects.glowColor})`);
      }
      if (layer.effects.dropShadow) {
        filters.push('drop-shadow(6px 6px 8px rgba(0,0,0,0.45))');
      }
      if (filters.length > 0) targetCtx.filter = filters.join(' ');
    }
    targetCtx.translate(width / 2 + kf.x, height / 2 + kf.y);
    targetCtx.rotate((kf.rotation * Math.PI) / 180);
    targetCtx.scale(kf.scale, kf.scale);
    targetCtx.drawImage(layerCanvas, -width / 2, -height / 2);
    targetCtx.restore();
    return true;
  };

  for (let i = 0; i < ordered.length; i++) {
    const layer = ordered[i];
    // Collect any consecutive clippingMask layers directly above this base layer
    let j = i + 1;
    while (j < ordered.length && ordered[j].clippingMask) j++;
    const hasClippedChildren = j > i + 1;

    if (!hasClippedChildren) {
      drawTransformedLayer(ctx, layer, layer.blendMode || 'source-over');
    } else {
      if (!groupCanvas) {
        groupCanvas = document.createElement('canvas');
        groupCanvas.width = width;
        groupCanvas.height = height;
        gctx = groupCanvas.getContext('2d');
      }
      if (gctx) {
        gctx.clearRect(0, 0, width, height);
        const drewBase = drawTransformedLayer(gctx, layer, 'source-over');
        if (drewBase) {
          for (let k = i + 1; k < j; k++) {
            drawTransformedLayer(gctx, ordered[k], 'source-atop');
          }
          ctx.save();
          ctx.globalCompositeOperation = layer.blendMode || 'source-over';
          ctx.drawImage(groupCanvas, 0, 0);
          ctx.restore();
        }
      }
      i = j - 1;
    }
  }
  if (hasCam) {
    ctx.restore();
  }
  if (postProcess && hasActivePostProcess(postProcess)) {
    applyPostProcessToCanvas(canvas, postProcess);
  }
}

/**
 * Fast pixel-accurate Scanline Flood Fill (Paint Bucket)
 * Supports active-layer-only OR all-layers reference, tolerance, and edge expansion (anti-halo).
 */
export function performFloodFill(
  layers: DrawingLayer[],
  activeLayerId: string,
  reference: 'all' | 'active',
  frame: number,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillHex: string,
  tolerance = 32,
  expandPx = 1,
  closeGapPx = 0,
  clipPolys?: Point[][] | Point[] | null,
  clipInverted = false
): { dataUrl: string; x: number; y: number; w: number; h: number } | null {
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

  const targetLayers =
    reference === 'active'
      ? layers.filter((l) => l.id === activeLayerId)
      : layers;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = width;
  srcCanvas.height = height;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;

  if (reference === 'all') {
    renderFrameToCanvas(srcCanvas, targetLayers, frame, width, height, '#ffffff', false);
  } else {
    // Active layer only: transparent background + keyframe transform alignment
    sctx.clearRect(0, 0, width, height);
    const active = targetLayers[0];
    if (active) {
      const strokes = getEffectiveFrameStrokes(active, frame);
      const kf = getInterpolatedLayerTransform(active, frame);
      sctx.save();
      sctx.translate(width / 2 + kf.x, height / 2 + kf.y);
      sctx.rotate((kf.rotation * Math.PI) / 180);
      sctx.scale(kf.scale, kf.scale);
      sctx.translate(-width / 2, -height / 2);
      for (const st of strokes) {
        renderStroke(sctx, st);
      }
      sctx.restore();
    }
  }

  const srcData = sctx.getImageData(0, 0, width, height).data;
  const startIdx = (sy * width + sx) * 4;
  const sr = srcData[startIdx];
  const sg = srcData[startIdx + 1];
  const sb = srcData[startIdx + 2];
  const sa = srcData[startIdx + 3];

  const clean = fillHex.replace('#', '');
  const fr = parseInt(clean.substring(0, 2) || '00', 16);
  const fg = parseInt(clean.substring(2, 4) || '00', 16);
  const fb = parseInt(clean.substring(4, 6) || '00', 16);

  // Skip redundant no-op fill if clicked pixel on active layer is already identical opaque fill color
  if (
    reference === 'active' &&
    sa >= 250 &&
    Math.abs(sr - fr) <= 2 &&
    Math.abs(sg - fg) <= 2 &&
    Math.abs(sb - fb) <= 2
  ) {
    return null;
  }

  // Optional selection polygon clipping mask (supports single poly, multi-island polys, holes & inverted!)
  let clipMask: Uint8Array | null = null;
  const normalizedClipPolys: Point[][] = !clipPolys || clipPolys.length === 0
    ? []
    : Array.isArray(clipPolys[0])
      ? (clipPolys as Point[][])
      : [clipPolys as Point[]];
  if (normalizedClipPolys.length > 0 && normalizedClipPolys.some((p) => p.length >= 3)) {
    const mc = document.createElement('canvas');
    mc.width = width;
    mc.height = height;
    const mctx = mc.getContext('2d', { willReadFrequently: true });
    if (mctx) {
      mctx.fillStyle = '#fff';
      traceSelectionPath(mctx, normalizedClipPolys, clipInverted, width, height);
      mctx.fill('evenodd');
      const md = mctx.getImageData(0, 0, width, height).data;
      clipMask = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        if (md[i * 4 + 3] > 127) clipMask[i] = 1;
      }
      if (!clipMask[sy * width + sx]) return null;
    }
  }

  const totalPixels = width * height;
  const rawMatches = (idx: number) => {
    if (clipMask && !clipMask[idx]) return false;
    const p = idx * 4;
    if (reference === 'active' && sa < 20) {
      // Filling transparent region on active layer: stop at any opaque stroke
      return srcData[p + 3] <= tolerance;
    }
    return (
      Math.abs(srcData[p] - sr) <= tolerance &&
      Math.abs(srcData[p + 1] - sg) <= tolerance &&
      Math.abs(srcData[p + 2] - sb) <= tolerance &&
      Math.abs(srcData[p + 3] - sa) <= tolerance
    );
  };

  // Optional Morphological Close Gap (Fechar Lacunas) — O(W*H) separable dilate + erode on barrier mask
  let closedBarrier: Uint8Array | null = null;
  if (closeGapPx > 0) {
    const r = Math.max(1, Math.ceil(closeGapPx / 2));
    const barrier = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      barrier[i] = rawMatches(i) ? 0 : 1;
    }

    // Separable O(W*H) 1D dilation (val=1 spreads by r)
    const dilateH = new Uint8Array(totalPixels);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let count = 0;
      for (let x = 0; x <= Math.min(r, width - 1); x++) count += barrier[row + x];
      for (let x = 0; x < width; x++) {
        dilateH[row + x] = count > 0 ? 1 : 0;
        const rem = x - r;
        const add = x + r + 1;
        if (rem >= 0) count -= barrier[row + rem];
        if (add < width) count += barrier[row + add];
      }
    }
    const dilateV = new Uint8Array(totalPixels);
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let y = 0; y <= Math.min(r, height - 1); y++) count += dilateH[y * width + x];
      for (let y = 0; y < height; y++) {
        dilateV[y * width + x] = count > 0 ? 1 : 0;
        const rem = y - r;
        const add = y + r + 1;
        if (rem >= 0) count -= dilateH[rem * width + x];
        if (add < height) count += dilateH[add * width + x];
      }
    }

    // Separable O(W*H) 1D erosion (val=0 spreads by r, restoring original line thickness while keeping gaps sealed!)
    const erodeH = new Uint8Array(totalPixels);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let zeros = 0;
      for (let x = 0; x <= Math.min(r, width - 1); x++) zeros += dilateV[row + x] === 0 ? 1 : 0;
      for (let x = 0; x < width; x++) {
        erodeH[row + x] = zeros === 0 ? 1 : 0;
        const rem = x - r;
        const add = x + r + 1;
        if (rem >= 0 && dilateV[row + rem] === 0) zeros--;
        if (add < width && dilateV[row + add] === 0) zeros++;
      }
    }
    const erodeV = new Uint8Array(totalPixels);
    for (let x = 0; x < width; x++) {
      let zeros = 0;
      for (let y = 0; y <= Math.min(r, height - 1); y++) zeros += erodeH[y * width + x] === 0 ? 1 : 0;
      for (let y = 0; y < height; y++) {
        erodeV[y * width + x] = zeros === 0 ? 1 : 0;
        const rem = y - r;
        const add = y + r + 1;
        if (rem >= 0 && erodeH[rem * width + x] === 0) zeros--;
        if (add < height && erodeH[add * width + x] === 0) zeros++;
      }
    }

    // Only use closed barrier if the clicked seed pixel wasn't inside a tight corner closed by dilation
    if (erodeV[sy * width + sx] === 0) {
      closedBarrier = erodeV;
    }
  }

  const visited = new Uint8Array(totalPixels);
  const stack: number[] = [sx, sy];

  const matches = (idx: number) => (closedBarrier ? closedBarrier[idx] === 0 : rawMatches(idx));

  let filledCount = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    let lx = x;
    while (lx >= 0 && !visited[y * width + lx] && matches(y * width + lx)) {
      lx--;
    }
    lx++;
    let rx = x;
    while (rx < width && !visited[y * width + rx] && matches(y * width + rx)) {
      rx++;
    }
    rx--;

    if (lx <= rx) {
      if (lx < minX) minX = lx;
      if (rx > maxX) maxX = rx;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    let spanAbove = false;
    let spanBelow = false;
    for (let cx = lx; cx <= rx; cx++) {
      const idx = y * width + cx;
      visited[idx] = 1;
      filledCount++;

      if (y > 0) {
        const upIdx = (y - 1) * width + cx;
        const upMatch = !visited[upIdx] && matches(upIdx);
        if (!spanAbove && upMatch) {
          stack.push(cx, y - 1);
          spanAbove = true;
        } else if (spanAbove && !upMatch) {
          spanAbove = false;
        }
      }
      if (y < height - 1) {
        const dnIdx = (y + 1) * width + cx;
        const dnMatch = !visited[dnIdx] && matches(dnIdx);
        if (!spanBelow && dnMatch) {
          stack.push(cx, y + 1);
          spanBelow = true;
        } else if (spanBelow && !dnMatch) {
          spanBelow = false;
        }
      }
    }
  }

  if (filledCount === 0 || maxX < minX || maxY < minY) return null;

  // Optional edge expansion (1px-4px) to eliminate anti-aliased white halos around lineart
  let mask = visited;
  const exMinX = Math.max(0, minX - expandPx);
  const exMinY = Math.max(0, minY - expandPx);
  const exMaxX = Math.min(width - 1, maxX + expandPx);
  const exMaxY = Math.min(height - 1, maxY + expandPx);

  for (let pass = 0; pass < expandPx; pass++) {
    const nextMask = new Uint8Array(mask);
    const yStart = Math.max(1, exMinY);
    const yEnd = Math.min(height - 2, exMaxY);
    const xStart = Math.max(1, exMinX);
    const xEnd = Math.min(width - 2, exMaxX);
    for (let y = yStart; y <= yEnd; y++) {
      const row = y * width;
      for (let x = xStart; x <= xEnd; x++) {
        const i = row + x;
        if (mask[i]) {
          if (!clipMask || clipMask[i - 1]) nextMask[i - 1] = 1;
          if (!clipMask || clipMask[i + 1]) nextMask[i + 1] = 1;
          if (!clipMask || clipMask[i - width]) nextMask[i - width] = 1;
          if (!clipMask || clipMask[i + width]) nextMask[i + width] = 1;
        }
      }
    }
    mask = nextMask;
  }

  // Export ONLY the tight cropped bounding box (saves ~95% RAM & file size!)
  const bw = exMaxX - exMinX + 1;
  const bh = exMaxY - exMinY + 1;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = bw;
  outCanvas.height = bh;
  const octx = outCanvas.getContext('2d');
  if (!octx) return null;
  const outImg = octx.createImageData(bw, bh);
  const outData = outImg.data;

  for (let y = 0; y < bh; y++) {
    const srcRow = (exMinY + y) * width + exMinX;
    const dstRow = y * bw;
    for (let x = 0; x < bw; x++) {
      if (mask[srcRow + x]) {
        const p = (dstRow + x) * 4;
        outData[p] = fr;
        outData[p + 1] = fg;
        outData[p + 2] = fb;
        outData[p + 3] = 255;
      }
    }
  }

  octx.putImageData(outImg, 0, 0);
  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    x: exMinX,
    y: exMinY,
    w: bw,
    h: bh
  };
}

/**
 * Magic Wand (Varinha Mágica): Flood-fills with Reference, Tolerance, Close Gap & Expand,
 * then traces the outer boundary contour into a clean simplified Point[] selection polygon.
 */
function simplifyContourRDP(pts: Point[], eps: number): Point[] {
  const n = pts.length;
  if (n <= 4) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const epsSq = eps * eps;
  // Iterative stack avoids RangeError: Maximum call stack size exceeded on complex 4K contours!
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start <= 1) continue;
    const first = pts[start];
    const last = pts[end];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const lenSq = dx * dx + dy * dy;

    let maxDistSq = -1;
    let maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const p = pts[i];
      let distSq: number;
      if (lenSq < 0.0001) {
        distSq = (p.x - first.x) ** 2 + (p.y - first.y) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((p.x - first.x) * dx + (p.y - first.y) * dy) / lenSq));
        const px = first.x + t * dx;
        const py = first.y + t * dy;
        distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
      }
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        maxIdx = i;
      }
    }
    if (maxDistSq > epsSq) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i]);
  }
  return out;
}

export function performMagicWandPolygon(
  layers: DrawingLayer[],
  activeLayerId: string,
  reference: 'all' | 'active',
  frame: number,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance = 32,
  expandPx = 1,
  closeGapPx = 4
): { poly: Point[]; inverted: boolean } | null {
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

  // If active layer is blank and reference is 'active', automatically fall back to 'all' visible layers
  const activeObj = layers.find((l) => l.id === activeLayerId);
  const activeHasStrokes = activeObj ? getEffectiveFrameStrokes(activeObj, frame).length > 0 : false;
  const effectiveRef: 'all' | 'active' = reference === 'active' && activeHasStrokes ? 'active' : 'all';

  const targetLayers =
    effectiveRef === 'active' ? layers.filter((l) => l.id === activeLayerId) : layers;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = width;
  srcCanvas.height = height;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;

  if (effectiveRef === 'all') {
    renderFrameToCanvas(srcCanvas, targetLayers, frame, width, height, '#ffffff', false);
  } else {
    sctx.clearRect(0, 0, width, height);
    const active = targetLayers[0];
    if (active) {
      const strokes = getEffectiveFrameStrokes(active, frame);
      const kf = getInterpolatedLayerTransform(active, frame);
      sctx.save();
      sctx.translate(width / 2 + kf.x, height / 2 + kf.y);
      sctx.rotate((kf.rotation * Math.PI) / 180);
      sctx.scale(kf.scale, kf.scale);
      sctx.translate(-width / 2, -height / 2);
      for (const st of strokes) renderStroke(sctx, st);
      sctx.restore();
    }
  }

  const srcData = sctx.getImageData(0, 0, width, height).data;
  const startIdx = (sy * width + sx) * 4;
  const sr = srcData[startIdx];
  const sg = srcData[startIdx + 1];
  const sb = srcData[startIdx + 2];
  const sa = srcData[startIdx + 3];
  const totalPixels = width * height;

  const rawMatches = (idx: number) => {
    const p = idx * 4;
    if (effectiveRef === 'active' && sa < 20) return srcData[p + 3] <= tolerance;
    return (
      Math.abs(srcData[p] - sr) <= tolerance &&
      Math.abs(srcData[p + 1] - sg) <= tolerance &&
      Math.abs(srcData[p + 2] - sb) <= tolerance &&
      Math.abs(srcData[p + 3] - sa) <= tolerance
    );
  };

  let closedBarrier: Uint8Array | null = null;
  if (closeGapPx > 0) {
    const r = Math.max(1, Math.ceil(closeGapPx / 2));
    const barrier = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) barrier[i] = rawMatches(i) ? 0 : 1;

    const dilateH = new Uint8Array(totalPixels);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let count = 0;
      for (let x = 0; x <= Math.min(r, width - 1); x++) count += barrier[row + x];
      for (let x = 0; x < width; x++) {
        dilateH[row + x] = count > 0 ? 1 : 0;
        if (x - r >= 0) count -= barrier[row + x - r];
        if (x + r + 1 < width) count += barrier[row + x + r + 1];
      }
    }
    const dilateV = new Uint8Array(totalPixels);
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let y = 0; y <= Math.min(r, height - 1); y++) count += dilateH[y * width + x];
      for (let y = 0; y < height; y++) {
        dilateV[y * width + x] = count > 0 ? 1 : 0;
        if (y - r >= 0) count -= dilateH[(y - r) * width + x];
        if (y + r + 1 < height) count += dilateH[(y + r + 1) * width + x];
      }
    }
    const erodeH = new Uint8Array(totalPixels);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let zeros = 0;
      for (let x = 0; x <= Math.min(r, width - 1); x++) zeros += dilateV[row + x] === 0 ? 1 : 0;
      for (let x = 0; x < width; x++) {
        erodeH[row + x] = zeros === 0 ? 1 : 0;
        if (x - r >= 0 && dilateV[row + x - r] === 0) zeros--;
        if (x + r + 1 < width && dilateV[row + x + r + 1] === 0) zeros++;
      }
    }
    const erodeV = new Uint8Array(totalPixels);
    for (let x = 0; x < width; x++) {
      let zeros = 0;
      for (let y = 0; y <= Math.min(r, height - 1); y++) zeros += erodeH[y * width + x] === 0 ? 1 : 0;
      for (let y = 0; y < height; y++) {
        erodeV[y * width + x] = zeros === 0 ? 1 : 0;
        if (y - r >= 0 && erodeH[(y - r) * width + x] === 0) zeros--;
        if (y + r + 1 < height && erodeH[(y + r + 1) * width + x] === 0) zeros++;
      }
    }
    if (erodeV[sy * width + sx] === 0) closedBarrier = erodeV;
  }

  const visited = new Uint8Array(totalPixels);
  const stack: number[] = [sx, sy];
  const matches = (idx: number) => (closedBarrier ? closedBarrier[idx] === 0 : rawMatches(idx));
  let minX = width, minY = height, maxX = -1, maxY = -1;

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    let lx = x;
    while (lx >= 0 && !visited[y * width + lx] && matches(y * width + lx)) lx--;
    lx++;
    let rx = x;
    while (rx < width && !visited[y * width + rx] && matches(y * width + rx)) rx++;
    rx--;
    if (lx <= rx) {
      if (lx < minX) minX = lx;
      if (rx > maxX) maxX = rx;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    let spanAbove = false;
    let spanBelow = false;
    for (let cx = lx; cx <= rx; cx++) {
      const idx = y * width + cx;
      visited[idx] = 1;
      if (y > 0) {
        const upIdx = (y - 1) * width + cx;
        const upMatch = !visited[upIdx] && matches(upIdx);
        if (!spanAbove && upMatch) { stack.push(cx, y - 1); spanAbove = true; }
        else if (spanAbove && !upMatch) spanAbove = false;
      }
      if (y < height - 1) {
        const dnIdx = (y + 1) * width + cx;
        const dnMatch = !visited[dnIdx] && matches(dnIdx);
        if (!spanBelow && dnMatch) { stack.push(cx, y + 1); spanBelow = true; }
        else if (spanBelow && !dnMatch) spanBelow = false;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  let mask = visited;
  const exMinX = Math.max(0, minX - expandPx);
  const exMinY = Math.max(0, minY - expandPx);
  const exMaxX = Math.min(width - 1, maxX + expandPx);
  const exMaxY = Math.min(height - 1, maxY + expandPx);
  for (let pass = 0; pass < expandPx; pass++) {
    const nextMask = new Uint8Array(mask);
    for (let y = Math.max(1, exMinY); y <= Math.min(height - 2, exMaxY); y++) {
      const row = y * width;
      for (let x = Math.max(1, exMinX); x <= Math.min(width - 2, exMaxX); x++) {
        const i = row + x;
        if (mask[i]) {
          nextMask[i - 1] = 1; nextMask[i + 1] = 1;
          nextMask[i - width] = 1; nextMask[i + width] = 1;
        }
      }
    }
    mask = nextMask;
  }

  // Check if the user clicked the EXTERIOR background surrounding a drawing:
  // In that case, `mask` touches the canvas corners and the drawing itself is a HOLE inside `mask`!
  // Trace the outer contour of the largest interior (complement `!mask`) component and return `{ poly, inverted: true }`
  // so marching ants hug the exact character outline (and Invert Selection cleanly selects the character!).
  const touchesExterior =
    mask[0] === 1 ||
    mask[width - 1] === 1 ||
    mask[(height - 1) * width] === 1 ||
    mask[height * width - 1] === 1;

  let traceMask = mask;
  let traceMinX = exMinX;
  let traceMinY = exMinY;
  let traceMaxX = exMaxX;
  let traceMaxY = exMaxY;
  let startPx = -1;
  let startPy = -1;
  let isInverted = false;

  if (touchesExterior) {
    // Build complement mask (enclosed drawing pixels = 1) and find largest connected component
    const compVisited = new Uint8Array(totalPixels);
    let bestArea = 0;
    let bestStartX = -1;
    let bestStartY = -1;
    let bestMinX = width, bestMinY = height, bestMaxX = -1, bestMaxY = -1;
    const invMask = new Uint8Array(totalPixels);
    let anyInv = false;
    for (let i = 0; i < totalPixels; i++) {
      if (!mask[i]) {
        invMask[i] = 1;
        anyInv = true;
      }
    }
    if (!anyInv) return null; // Completely blank canvas — nothing to select around!

    const cStack: number[] = [];
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx0 = row + x;
        if (!invMask[idx0] || compVisited[idx0]) continue;
        let area = 0;
        let cMinX = x, cMaxX = x, cMinY = y, cMaxY = y;
        let topLeftX = x, topLeftY = y;
        cStack.push(x, y);
        compVisited[idx0] = 1;
        while (cStack.length > 0) {
          const cy = cStack.pop()!;
          const cx = cStack.pop()!;
          area++;
          if (cx < cMinX) cMinX = cx;
          if (cx > cMaxX) cMaxX = cx;
          if (cy < cMinY) cMinY = cy;
          if (cy > cMaxY) cMaxY = cy;
          if (cy < topLeftY || (cy === topLeftY && cx < topLeftX)) {
            topLeftX = cx;
            topLeftY = cy;
          }
          // 4-neighbors
          if (cx > 0) {
            const ni = cy * width + (cx - 1);
            if (invMask[ni] && !compVisited[ni]) { compVisited[ni] = 1; cStack.push(cx - 1, cy); }
          }
          if (cx < width - 1) {
            const ni = cy * width + (cx + 1);
            if (invMask[ni] && !compVisited[ni]) { compVisited[ni] = 1; cStack.push(cx + 1, cy); }
          }
          if (cy > 0) {
            const ni = (cy - 1) * width + cx;
            if (invMask[ni] && !compVisited[ni]) { compVisited[ni] = 1; cStack.push(cx, cy - 1); }
          }
          if (cy < height - 1) {
            const ni = (cy + 1) * width + cx;
            if (invMask[ni] && !compVisited[ni]) { compVisited[ni] = 1; cStack.push(cx, cy + 1); }
          }
        }
        if (area > bestArea) {
          bestArea = area;
          bestStartX = topLeftX;
          bestStartY = topLeftY;
          bestMinX = cMinX;
          bestMinY = cMinY;
          bestMaxX = cMaxX;
          bestMaxY = cMaxY;
        }
      }
    }
    if (bestArea < 4 || bestStartX === -1) return null;
    traceMask = invMask;
    traceMinX = bestMinX;
    traceMinY = bestMinY;
    traceMaxX = bestMaxX;
    traceMaxY = bestMaxY;
    startPx = bestStartX;
    startPy = bestStartY;
    isInverted = true;
  } else {
    // Interior selection: Moore-Neighbor starting pixel on top-left of mask
    outer: for (let y = exMinY; y <= exMaxY; y++) {
      const row = y * width;
      for (let x = exMinX; x <= exMaxX; x++) {
        if (mask[row + x]) {
          startPx = x;
          startPy = y;
          break outer;
        }
      }
    }
  }
  if (startPx === -1) return null;

  // 8-neighbor clockwise offsets starting from West (left)
  const dirs = [
    [-1, 0], [-1, -1], [0, -1], [1, -1],
    [1, 0], [1, 1], [0, 1], [-1, 1]
  ];
  const contour: Point[] = [];
  let cx = startPx;
  let cy = startPy;
  let backDir = 0; // entered from West (guaranteed empty since startPx is leftmost on top row)
  const maxSteps = Math.min(200_000, (traceMaxX - traceMinX + traceMaxY - traceMinY) * 20 + 256);
  let startRevisits = 0;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: cx, y: cy });
    let found = false;
    for (let i = 1; i <= 8; i++) {
      const d = (backDir + i) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && traceMask[ny * width + nx]) {
        cx = nx;
        cy = ny;
        backDir = (d + 4) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (cx === startPx && cy === startPy && step > 2) {
      startRevisits++;
      if (backDir === 0 || startRevisits >= 2) break;
    }
  }

  if (contour.length < 3) {
    return {
      poly: [
        { x: traceMinX, y: traceMinY },
        { x: traceMaxX, y: traceMinY },
        { x: traceMaxX, y: traceMaxY },
        { x: traceMinX, y: traceMaxY }
      ],
      inverted: isInverted
    };
  }

  const simplified = simplifyContourRDP(contour, 1.8);
  return {
    poly: simplified.length >= 3 ? simplified : contour,
    inverted: isInverted
  };
}
