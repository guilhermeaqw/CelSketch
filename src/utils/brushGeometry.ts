import type { Point } from '../types/harmony';

export function smoothPoints(pts: Point[], strength: number, maxPassesOverride?: number): Point[] {
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
export function subdivideCurve(pts: Point[]): Point[] {
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
export interface ResampledPoint extends Point {
  angle: number;
  t: number; // normalized 0..1 progress along stroke
}

export function resampleByDistance(pts: Point[], spacing: number): ResampledPoint[] {
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
export function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Cached procedural tinted brush tip canvases (Graphite Grain, Bristle Tufts, Soft Gaussian, Watercolor Ring)
 */
const tipCache = new Map<string, HTMLCanvasElement>();

export function getProceduralTip(kind: 'graphite' | 'pencil' | 'bristle' | 'soft' | 'water', color: string): HTMLCanvasElement {
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
export function renderVariableWidthRibbon(
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

