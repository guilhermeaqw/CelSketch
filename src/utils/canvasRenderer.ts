import { DrawingLayer, LayerTransformKeyframe, Point, Stroke } from '../types/harmony';
import { LINE_SUT_TIP_URL, SKETCH_SUT_TIP_URL, SKETCH_SUT_PAPER_URL } from './customBrushAssets';

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

// Reusable zero-allocation scratch canvas + cached paper pattern for Sketch.sut
let sketchScratchCanvas: HTMLCanvasElement | null = null;
let sketchScratchCtx: CanvasRenderingContext2D | null = null;
let sketchPaperPattern: CanvasPattern | null = null;

function getSketchScratch(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; pattern: CanvasPattern | null } {
  if (!sketchScratchCanvas) {
    sketchScratchCanvas = document.createElement('canvas');
    sketchScratchCanvas.width = Math.max(256, w);
    sketchScratchCanvas.height = Math.max(256, h);
    sketchScratchCtx = sketchScratchCanvas.getContext('2d')!;
  } else if (sketchScratchCanvas.width < w || sketchScratchCanvas.height < h) {
    sketchScratchCanvas.width = Math.max(sketchScratchCanvas.width, w);
    sketchScratchCanvas.height = Math.max(sketchScratchCanvas.height, h);
    sketchPaperPattern = null; // re-create pattern after resize
  }
  const ctx = sketchScratchCtx!;
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

const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(dataUrl: string): HTMLImageElement {
  let img = imageCache.get(dataUrl);
  if (!img) {
    img = new Image();
    img.onload = () => {
      window.dispatchEvent(new Event('celsketch:image-loaded'));
    };
    img.src = dataUrl;
    imageCache.set(dataUrl, img);
  }
  return img;
}

export function isLayerEffectivelyVisible(layer: DrawingLayer, allLayers: DrawingLayer[]): boolean {
  if (layer.type === 'folder') return false;
  if (!layer.visible) return false;
  // Check parent folder visibility
  if (layer.parentId) {
    const parent = allLayers.find((l) => l.id === layer.parentId);
    if (parent && !parent.visible) return false;
  }
  // If any layer is Soloed, only Soloed layers render!
  const anySolo = allLayers.some((l) => l.type !== 'folder' && l.solo);
  if (anySolo && !layer.solo) return false;
  return true;
}

export function getEffectiveFrameStrokes(layer: DrawingLayer, frame: number): Stroke[] {
  const direct = layer.frames[frame];
  if (direct && direct.length > 0) return direct;

  // Check explicit Cel Exposure blocks (e.g. celDurations[1] = 3 covers frames 1, 2, 3)
  if (layer.celDurations) {
    for (let f = frame - 1; f >= 1; f--) {
      const dur = layer.celDurations[f] || 1;
      if (dur > 1 && frame < f + dur) {
        const celStrokes = layer.frames[f];
        if (celStrokes && celStrokes.length > 0) return celStrokes;
      }
      // Stop if we hit an explicit drawing or blank cel before f
      if (layer.frames[f] !== undefined) break;
    }
  }

  if (!layer.holdFrames) return [];

  // Hold exposure: find the nearest previous frame with strokes
  for (let f = frame - 1; f >= 1; f--) {
    const prev = layer.frames[f];
    if (prev && prev.length > 0) return prev;
  }
  return [];
}

/**
 * Smooth raw pointer points using a weighted moving average (stabilizer)
 */
function smoothPoints(pts: Point[], strength: number): Point[] {
  if (pts.length < 3 || strength <= 0) return pts;
  const alpha = Math.max(0.15, Math.min(0.85, 1 - (strength / 100) * 0.72));
  const out: Point[] = [pts[0]];
  let sx = pts[0].x;
  let sy = pts[0].y;
  let sp = pts[0].pressure ?? 1;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    sx = sx + (p.x - sx) * alpha;
    sy = sy + (p.y - sy) * alpha;
    sp = sp + ((p.pressure ?? 1) - sp) * 0.5;
    out.push({ x: sx, y: sy, pressure: sp });
  }
  return out;
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
  pts: Point[],
  calcRadius: (p: number, idx: number, total: number) => number,
  chiselAngleRad?: number
) {
  if (pts.length === 0) return;
  if (pts.length === 1) {
    const r = calcRadius(pts[0].pressure ?? 1, 0, 1);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const leftSide: { x: number; y: number }[] = [];
  const rightSide: { x: number; y: number }[] = [];

  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);

    let nx = 0;
    let ny = -1;
    if (chiselAngleRad !== undefined) {
      nx = Math.cos(chiselAngleRad);
      ny = Math.sin(chiselAngleRad);
    } else if (len > 0.0001) {
      nx = -dy / len;
      ny = dx / len;
    }

    const r = calcRadius(curr.pressure ?? 1, i, pts.length);
    leftSide.push({ x: curr.x + nx * r, y: curr.y + ny * r });
    rightSide.push({ x: curr.x - nx * r, y: curr.y - ny * r });
  }

  ctx.beginPath();
  ctx.moveTo(leftSide[0].x, leftSide[0].y);
  for (let i = 1; i < leftSide.length; i++) {
    ctx.lineTo(leftSide[i].x, leftSide[i].y);
  }
  for (let i = rightSide.length - 1; i >= 0; i--) {
    ctx.lineTo(rightSide[i].x, rightSide[i].y);
  }
  ctx.closePath();
  ctx.fill();

  // Smooth round caps at start and end
  if (chiselAngleRad === undefined) {
    const rStart = calcRadius(pts[0].pressure ?? 1, 0, pts.length);
    const rEnd = calcRadius(pts[pts.length - 1].pressure ?? 1, pts.length - 1, pts.length);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, rStart, 0, Math.PI * 2);
    ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, rEnd, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  tintColor?: string,
  opacityMultiplier = 1
) {
  if (stroke.points.length === 0) return;

  ctx.save();
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
    const smoothed = smoothPoints(pts, stroke.smoothing ?? 35);
    const curvePts = subdivideCurve(smoothed);

    const calcRadius = (pressure: number, idx: number, total: number) => {
      const p = Math.max(0.02, Math.min(1, pressure));
      const curveExp = preset === 'sai_inkpen' ? 1.72 : preset === 'sai_pen' ? 1.35 : 1.25;
      let width = stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, curveExp));

      // Smooth organic taper at start and end of Pen / InkPen strokes
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

    const ecoMult = globalEcoMode ? 1.55 : 1;

    if (preset === 'csp_line' && stroke.tool !== 'eraser') {
      // Line.sut (ガサ伽サ線画ペン): textured rough organic lineart ribbon along stroke angle
      const tip = getTintedSutTip('line', activeColor);
      if (tip) {
        const spacing = Math.max(1.5, stroke.size * 0.18) * ecoMult;
        const dabs = resampleByDistance(curvePts, spacing);
        const aspect = tip.height / Math.max(1, tip.width);
        ctx.globalAlpha = stroke.opacity * opacityMultiplier;
        for (let i = 0; i < dabs.length; i++) {
          const pt = dabs[i];
          const p = Math.max(0.03, Math.min(1, pt.pressure ?? 1));
          let taper = 1;
          if (dabs.length > 10) {
            if (pt.t < 0.14) {
              const f = pt.t / 0.14;
              taper = 0.25 + 0.75 * (f * f * (3 - 2 * f));
            } else if (pt.t > 0.86) {
              const f = (1 - pt.t) / 0.14;
              taper = 0.2 + 0.8 * (f * f * (3 - 2 * f));
            }
          }
          const diam = Math.max(1.2, stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, 1.38)) * taper);
          const w = diam * 0.85;
          const h = Math.max(w * 1.15, Math.min(diam * 2.2, w * aspect * 0.45));
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.angle + Math.PI / 2);
          ctx.drawImage(tip, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      } else {
        renderVariableWidthRibbon(ctx, curvePts, calcRadius);
      }
    } else if (preset === 'csp_sketch' && stroke.tool !== 'eraser') {
      // Sketch.sut (鉛筆R): zero-allocation reusable scratch canvas + world-space paper grain
      const tip = getTintedSutTip('sketch', activeColor);
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
          const p = Math.max(0.05, Math.min(1, pt.pressure ?? 1));
          const diam = Math.max(1.5, stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, 1.25)));
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
    } else if ((preset === 'sai_airbrush' || preset === 'blur_soft' || preset === 'blur_smudge') && stroke.tool !== 'eraser') {
      // Distance-resampled Gaussian Feathered Airbrush / Soft Blend (zero polka-dots at any speed!)
      const tip = getProceduralTip('soft', activeColor);
      const spacing = Math.max(2.0, stroke.size * 0.22) * ecoMult;
      const dabs = resampleByDistance(curvePts, spacing);
      const radiusMult = preset === 'blur_soft' ? 1.65 : preset === 'blur_smudge' ? 1.35 : 1.45;
      const flowFactor = preset === 'blur_soft' ? 0.08 : preset === 'blur_smudge' ? 0.16 : 0.11;
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = Math.max(0.05, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(2.5, calcRadius(p, i, dabs.length) * radiusMult);
        ctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * flowFactor * (0.35 + 0.65 * p));
        ctx.drawImage(tip, pt.x - r, pt.y - r, r * 2, r * 2);
      }
    } else if (preset === 'sai_water' && stroke.tool !== 'eraser') {
      // Watercolor Wash: distance-resampled translucent pigment with subtle wet-edge ring
      const tip = getProceduralTip('water', activeColor);
      const spacing = Math.max(1.5, stroke.size * 0.16);
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = Math.max(0.08, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(2, calcRadius(p, i, dabs.length) * 1.15);
        ctx.globalAlpha = Math.min(0.85, stroke.opacity * opacityMultiplier * 0.22 * (0.4 + 0.6 * p));
        ctx.drawImage(tip, pt.x - r, pt.y - r, r * 2, r * 2);
      }
    } else if (preset === 'sai_brush' && stroke.tool !== 'eraser') {
      // Painterly Bristle Brush: rotating multi-strand bristles along stroke direction + pressure buildup
      const tip = getProceduralTip('bristle', activeColor);
      const spacing = Math.max(1.2, stroke.size * 0.11);
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = Math.max(0.08, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(1.8, calcRadius(p, i, dabs.length) * 1.12);
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.angle);
        ctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * (0.28 + 0.55 * p));
        ctx.drawImage(tip, -r, -r, r * 2, r * 2);
        ctx.restore();
      }
    } else if (preset === 'sai_marker' && stroke.tool !== 'eraser') {
      // Alcohol Chisel Marker: smooth distance-resampled 45-degree rounded chisel nib
      const spacing = Math.max(1, stroke.size * 0.08);
      const dabs = resampleByDistance(curvePts, spacing);
      ctx.globalAlpha = Math.min(1, stroke.opacity * opacityMultiplier * 0.35);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = Math.max(0.2, Math.min(1, pt.pressure ?? 1));
        const r = Math.max(1.5, calcRadius(p, i, dabs.length));
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.25, r * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (preset === 'sai_binary' && stroke.tool !== 'eraser') {
      // Crisp Pixel Art Binary Pen (distance-stepped, zero anti-aliasing)
      ctx.imageSmoothingEnabled = false;
      const sz = Math.max(1, Math.round(stroke.size));
      const dabs = resampleByDistance(curvePts, Math.max(1, sz * 0.35));
      for (const pt of dabs) {
        ctx.fillRect(Math.round(pt.x - sz / 2), Math.round(pt.y - sz / 2), sz, sz);
      }
    } else if ((preset === 'sketch_graphite' || preset === 'sai_pencil') && stroke.tool !== 'eraser') {
      // Authentic Textured Graphite / 2B Pencil: paper-grain dabs with pressure-to-opacity & subtle rotation
      const isGraphite = preset === 'sketch_graphite';
      const tip = getProceduralTip(isGraphite ? 'graphite' : 'pencil', activeColor);
      const spacing = Math.max(1, stroke.size * (isGraphite ? 0.14 : 0.12));
      const dabs = resampleByDistance(curvePts, spacing);
      for (let i = 0; i < dabs.length; i++) {
        const pt = dabs[i];
        const p = Math.max(0.05, Math.min(1, pt.pressure ?? 1));
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
      if (stroke.hsvFilter) {
        const satPct = Math.max(0, 100 + stroke.hsvFilter.s);
        const briPct = Math.max(0, 100 + stroke.hsvFilter.v);
        ctx.filter = `hue-rotate(${stroke.hsvFilter.h}deg) saturate(${satPct}%) brightness(${briPct}%)`;
      }
      ctx.drawImage(
        img,
        stroke.imageX ?? 0,
        stroke.imageY ?? 0,
        stroke.imageW ?? img.naturalWidth,
        stroke.imageH ?? img.naturalHeight
      );
    }
  } else if ((stroke.tool === 'fill' || stroke.tool === 'erase_poly') && pts.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === 'fill' && pts.length >= 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, stroke.size * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  layers: DrawingLayer[],
  frame: number,
  width: number,
  height: number,
  bgColor = '#ffffff'
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Render layers bottom-to-top
  const ordered = [...layers].reverse();
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = width;
  layerCanvas.height = height;
  const lctx = layerCanvas.getContext('2d');
  if (!lctx) return;

  for (const layer of ordered) {
    if (!isLayerEffectivelyVisible(layer, layers)) continue;
    const strokes = getEffectiveFrameStrokes(layer, frame);
    if (strokes.length === 0) continue;

    lctx.clearRect(0, 0, width, height);
    for (const st of strokes) {
      renderStroke(lctx, st);
    }

    const kf = getInterpolatedLayerTransform(layer, frame);
    ctx.save();
    ctx.globalAlpha = kf.opacity;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    if (layer.effects) {
      const filters: string[] = [];
      if (layer.effects.blur > 0) filters.push(`blur(${layer.effects.blur}px)`);
      if (layer.effects.glow > 0) {
        filters.push(`drop-shadow(0 0 ${layer.effects.glow}px ${layer.effects.glowColor})`);
      }
      if (layer.effects.dropShadow) {
        filters.push('drop-shadow(6px 6px 8px rgba(0,0,0,0.45))');
      }
      if (filters.length > 0) ctx.filter = filters.join(' ');
    }
    ctx.translate(width / 2 + kf.x, height / 2 + kf.y);
    ctx.rotate((kf.rotation * Math.PI) / 180);
    ctx.scale(kf.scale, kf.scale);
    ctx.drawImage(layerCanvas, -width / 2, -height / 2);
    ctx.restore();
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
  closeGapPx = 0
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
    renderFrameToCanvas(srcCanvas, targetLayers, frame, width, height, '#ffffff');
  } else {
    // Active layer only: transparent background so alpha distinguishes empty vs drawn
    sctx.clearRect(0, 0, width, height);
    const active = targetLayers[0];
    if (active) {
      const strokes = getEffectiveFrameStrokes(active, frame);
      for (const st of strokes) {
        renderStroke(sctx, st);
      }
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

  const totalPixels = width * height;
  const rawMatches = (idx: number) => {
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
          nextMask[i - 1] = 1;
          nextMask[i + 1] = 1;
          nextMask[i - width] = 1;
          nextMask[i + width] = 1;
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
