import type { DrawingLayer, Point } from '../types/harmony';
import { traceSelectionPath } from './selectionUtils';
import { getEffectiveFrameStrokes, getInterpolatedLayerTransform } from './layerResolver';
import { renderFrameToCanvas, renderStroke } from './canvasRenderer';

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

