import { Point } from '../types/harmony';

export interface SelectionResult {
  polys: Point[][];
  inverted: boolean;
}

/**
 * Even-odd point-in-polygon test for a single contour.
 */
export function isPointInSinglePoly(pt: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Even-odd hit test across multiple contours (supports islands + holes + inverted selections!).
 */
export function isPointInSelection(pt: Point, polys: Point[][], inverted = false): boolean {
  let inside = false;
  for (let k = 0; k < polys.length; k++) {
    if (isPointInSinglePoly(pt, polys[k])) {
      inside = !inside;
    }
  }
  return inverted ? !inside : inside;
}

/**
 * Traces all contours of a selection into a single Canvas 2D path (use with 'evenodd' fill/clip).
 */
export function traceSelectionPath(
  ctx: CanvasRenderingContext2D,
  polys: Point[][],
  inverted: boolean,
  canvasWidth: number,
  canvasHeight: number,
  offsetX = 0,
  offsetY = 0
): void {
  ctx.beginPath();
  if (inverted) {
    ctx.rect(-offsetX, -offsetY, canvasWidth, canvasHeight);
  }
  for (let k = 0; k < polys.length; k++) {
    const poly = polys[k];
    if (poly.length < 3) continue;
    ctx.moveTo(poly[0].x - offsetX, poly[0].y - offsetY);
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(poly[i].x - offsetX, poly[i].y - offsetY);
    }
    ctx.closePath();
  }
}

/**
 * Computes tight bounding box of a multi-contour selection.
 */
export function getSelectionBounds(
  polys: Point[][],
  inverted: boolean,
  canvasWidth: number,
  canvasHeight: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (polys.length === 0) return null;
  if (inverted) {
    return { minX: 0, minY: 0, maxX: canvasWidth, maxY: canvasHeight };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX) || !isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

function simplifyLoopRDP(pts: Point[], eps: number): Point[] {
  const n = pts.length;
  if (n <= 4) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const epsSq = eps * eps;
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

/**
 * Extracts ALL closed boundary contours (both outer islands AND inner holes!)
 * from a binary mask using directed grid-boundary edge chaining.
 * Runs in O(perimeter) time and never overflows the call stack.
 */
function extractAllMaskContours(mask: Uint8Array, w: number, h: number, invScale: number): Point[][] {
  // Collect directed unit edges on pixel grid corners (0..w, 0..h):
  // Inside pixel (x,y) is to the RIGHT of every directed edge (CW for outer boundary, CCW for holes).
  const stride = w + 1;
  // Map startVertexKey -> array of endVertexKeys (usually 1, at most 2 at saddle corners)
  const edges = new Map<number, number[]>();
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const k0 = y0 * stride + x0;
    const k1 = y1 * stride + x1;
    const arr = edges.get(k0);
    if (arr) arr.push(k1);
    else edges.set(k0, [k1]);
  };

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      // Top edge (left -> right)
      if (y === 0 || !mask[(y - 1) * w + x]) addEdge(x, y, x + 1, y);
      // Right edge (top -> bottom)
      if (x === w - 1 || !mask[row + x + 1]) addEdge(x + 1, y, x + 1, y + 1);
      // Bottom edge (right -> left)
      if (y === h - 1 || !mask[(y + 1) * w + x]) addEdge(x + 1, y + 1, x, y + 1);
      // Left edge (bottom -> top)
      if (x === 0 || !mask[row + x - 1]) addEdge(x, y + 1, x, y);
    }
  }

  const loops: Point[][] = [];
  while (edges.size > 0) {
    const firstEntry = edges.entries().next().value as [number, number[]] | undefined;
    if (!firstEntry) break;
    const startKey = firstEntry[0];
    const startNextList = firstEntry[1];
    let currKey = startKey;
    let nextKey = startNextList.pop()!;
    if (startNextList.length === 0) edges.delete(startKey);

    const rawPts: Point[] = [
      { x: (currKey % stride) * invScale, y: Math.floor(currKey / stride) * invScale }
    ];
    let prevDx = (nextKey % stride) - (currKey % stride);
    let prevDy = Math.floor(nextKey / stride) - Math.floor(currKey / stride);
    currKey = nextKey;

    let guard = 0;
    const maxSteps = w * h * 2 + 16;
    while (currKey !== startKey && guard < maxSteps) {
      guard++;
      const list = edges.get(currKey);
      if (!list || list.length === 0) break;
      // At a saddle vertex (2 outgoing edges), prefer turning right to keep loops simple/non-crossing
      let chosenIdx = list.length - 1;
      if (list.length > 1) {
        const cx = currKey % stride;
        const cy = Math.floor(currKey / stride);
        for (let i = 0; i < list.length; i++) {
          const nx = list[i] % stride;
          const ny = Math.floor(list[i] / stride);
          const dx = nx - cx;
          const dy = ny - cy;
          // Right turn relative to (prevDx, prevDy) in screen coords (y-down) is cross > 0: prevDx*dy - prevDy*dx > 0
          if (prevDx * dy - prevDy * dx > 0) {
            chosenIdx = i;
            break;
          }
        }
      }
      nextKey = list.splice(chosenIdx, 1)[0];
      if (list.length === 0) edges.delete(currKey);

      const cx = currKey % stride;
      const cy = Math.floor(currKey / stride);
      const dx = (nextKey % stride) - cx;
      const dy = Math.floor(nextKey / stride) - cy;
      // Only emit corner vertices where direction changes (huge speedup!)
      if (dx !== prevDx || dy !== prevDy) {
        rawPts.push({ x: cx * invScale, y: cy * invScale });
      }
      prevDx = dx;
      prevDy = dy;
      currKey = nextKey;
    }

    if (rawPts.length >= 3) {
      const simplified = simplifyLoopRDP(rawPts, 1.35 * invScale);
      if (simplified.length >= 3) {
        loops.push(simplified);
      }
    }
  }

  return loops;
}

/**
 * Combines an existing selection with a new polygon using Boolean Replace, Add (Shift), or Subtract (Alt).
 * Supports multiple separate islands, holes, and inverted selections!
 */
export function combineSelections(
  existingPolys: Point[][],
  existingInverted: boolean,
  newPoly: Point[],
  newInverted: boolean,
  mode: 'replace' | 'add' | 'subtract',
  canvasWidth: number,
  canvasHeight: number
): SelectionResult {
  if (newPoly.length < 3) {
    return { polys: existingPolys, inverted: existingInverted };
  }
  if (mode === 'replace' || existingPolys.length === 0) {
    if (mode === 'subtract' && existingPolys.length === 0) {
      return { polys: [], inverted: false };
    }
    return { polys: [newPoly], inverted: newInverted };
  }

  // Downscale slightly only on huge >2200px canvases to keep boolean ops < 5ms
  const maxDim = Math.max(canvasWidth, canvasHeight);
  const scale = maxDim > 2200 ? 1600 / maxDim : 1;
  const invScale = 1 / scale;
  const mw = Math.max(2, Math.round(canvasWidth * scale));
  const mh = Math.max(2, Math.round(canvasHeight * scale));

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mw;
  maskCanvas.height = mh;
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!mctx) return { polys: [newPoly], inverted: newInverted };

  mctx.clearRect(0, 0, mw, mh);
  mctx.save();
  mctx.scale(scale, scale);

  // 1. Paint existing selection
  mctx.fillStyle = '#ffffff';
  mctx.globalCompositeOperation = 'source-over';
  traceSelectionPath(mctx, existingPolys, existingInverted, canvasWidth, canvasHeight);
  mctx.fill('evenodd');

  // 2. Apply boolean Add (Shift) or Subtract (Alt)
  mctx.globalCompositeOperation = mode === 'add' ? 'source-over' : 'destination-out';
  traceSelectionPath(mctx, [newPoly], newInverted, canvasWidth, canvasHeight);
  mctx.fill('evenodd');
  mctx.restore();

  const imgData = mctx.getImageData(0, 0, mw, mh).data;
  const mask = new Uint8Array(mw * mh);
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (imgData[i * 4 + 3] >= 128) {
      mask[i] = 1;
      count++;
    }
  }

  if (count < 4) {
    return { polys: [], inverted: false };
  }

  const loops = extractAllMaskContours(mask, mw, mh, invScale);
  return { polys: loops, inverted: false };
}
