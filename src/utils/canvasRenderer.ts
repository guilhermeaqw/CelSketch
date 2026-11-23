import { DrawingLayer, Point, Stroke } from '../types/harmony';

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

export function getEffectiveFrameStrokes(layer: DrawingLayer, frame: number): Stroke[] {
  const direct = layer.frames[frame];
  if (direct && direct.length > 0) return direct;
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
    ctx.globalCompositeOperation = 'source-over';
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
      const curveExp = preset === 'sai_inkpen' ? 1.65 : 1.28;
      let width = stroke.size * (minRatio + (1 - minRatio) * Math.pow(p, curveExp));

      // Subtle natural taper at very start/end of SAI Pen & InkPen strokes
      if ((preset === 'sai_pen' || preset === 'sai_inkpen') && total > 6) {
        if (idx < 3) width *= 0.65 + (idx / 3) * 0.35;
        if (idx > total - 4) width *= 0.65 + ((total - 1 - idx) / 3) * 0.35;
      }
      return Math.max(0.4, width / 2);
    };

    if ((preset === 'sai_airbrush' || preset === 'blur_soft' || preset === 'blur_smudge') && stroke.tool !== 'eraser') {
      // Soft airbrush / blur / smudge using feathered radial gradients
      const alphaFactor = preset === 'blur_soft' ? 0.1 : preset === 'blur_smudge' ? 0.18 : 0.14;
      const radiusMult = preset === 'blur_soft' ? 1.7 : 1.45;
      for (let i = 0; i < curvePts.length; i += 2) {
        const pt = curvePts[i];
        const r = Math.max(4, calcRadius(pt.pressure ?? 1, i, curvePts.length) * radiusMult);
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
        grad.addColorStop(0, activeColor);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalAlpha = stroke.opacity * opacityMultiplier * alphaFactor;
        if (preset === 'blur_soft' || preset === 'blur_smudge') {
          ctx.filter = `blur(${preset === 'blur_soft' ? 4 : 2}px)`;
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (preset === 'sai_water' && stroke.tool !== 'eraser') {
      // SAI Water (Watercolor): soft translucent wash with gentle wet edge
      ctx.save();
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = Math.max(4, stroke.size * 0.35);
      renderVariableWidthRibbon(ctx, curvePts, calcRadius);
      ctx.restore();
    } else if (preset === 'sai_brush' && stroke.tool !== 'eraser') {
      // SAI Brush (Painterly round): smooth core + soft blendable halo
      ctx.save();
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = Math.max(2, stroke.size * 0.15);
      renderVariableWidthRibbon(ctx, curvePts, calcRadius);
      ctx.restore();
    } else if (preset === 'sai_marker' && stroke.tool !== 'eraser') {
      // SAI Marker: flat 45-degree chisel nib
      renderVariableWidthRibbon(ctx, curvePts, calcRadius, Math.PI / 4);
    } else if (preset === 'sai_binary' && stroke.tool !== 'eraser') {
      // SAI Binary: crisp hard-edge square pixel pen
      ctx.imageSmoothingEnabled = false;
      const sz = Math.max(1, Math.round(stroke.size));
      for (const pt of curvePts) {
        ctx.fillRect(Math.round(pt.x - sz / 2), Math.round(pt.y - sz / 2), sz, sz);
      }
    } else if (preset === 'sai_pencil' && stroke.tool !== 'eraser') {
      // SAI Pencil: organic graphite core + soft tooth
      renderVariableWidthRibbon(ctx, curvePts, (p, i, t) => calcRadius(p, i, t) * 0.85);
      ctx.save();
      ctx.globalAlpha = stroke.opacity * opacityMultiplier * 0.28;
      renderVariableWidthRibbon(ctx, curvePts, (p, i, t) => calcRadius(p, i, t) * 1.18);
      ctx.restore();
    } else {
      // SAI Pen, InkPen, and Eraser: ultra-smooth filled variable-width ribbon
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
    if (!layer.visible) continue;
    const strokes = getEffectiveFrameStrokes(layer, frame);
    if (strokes.length === 0) continue;

    lctx.clearRect(0, 0, width, height);
    for (const st of strokes) {
      renderStroke(lctx, st);
    }

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    ctx.drawImage(layerCanvas, 0, 0);
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
  expandPx = 1
): string | null {
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

  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];

  const matches = (idx: number) => {
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

  let filledCount = 0;
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

  if (filledCount === 0) return null;

  // Optional edge expansion (1px-4px) to eliminate anti-aliased white halos around lineart
  let mask = visited;
  for (let pass = 0; pass < expandPx; pass++) {
    const nextMask = new Uint8Array(mask);
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
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

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const octx = outCanvas.getContext('2d');
  if (!octx) return null;
  const outImg = octx.createImageData(width, height);
  const outData = outImg.data;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const p = i * 4;
      outData[p] = fr;
      outData[p + 1] = fg;
      outData[p + 2] = fb;
      outData[p + 3] = 255;
    }
  }

  octx.putImageData(outImg, 0, 0);
  return outCanvas.toDataURL('image/png');
}
