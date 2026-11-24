import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { ArtLayerId, Point, Stroke } from '../types/harmony';
import {
  renderStroke,
  getEffectiveFrameStrokes,
  isLayerEffectivelyVisible,
  getInterpolatedLayerTransform,
  performFloodFill,
  renderFrameToCanvas,
  detectIsWeakHardware,
  setGlobalEcoMode
} from '../utils/canvasRenderer';

const ART_LAYERS: { id: ArtLayerId; label: string }[] = [
  { id: 'OL', label: 'Overlay Art' },
  { id: 'LA', label: 'Line Art' },
  { id: 'CA', label: 'Colour Art' },
  { id: 'UL', label: 'Underlay Art' }
];

function isPointInPolygon(pt: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export const CanvasStage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const brushRingRef = useRef<HTMLDivElement>(null);
  const eyedropperSwatchRef = useRef<HTMLDivElement>(null);
  const penHudTimerRef = useRef<number>(0);
  const layerBufferRef = useRef<HTMLCanvasElement | null>(null);
  const layerBitmapCacheRef = useRef<
    Map<string, { strokesRef: Stroke[]; width: number; height: number; imgTick: number; canvas: HTMLCanvasElement }>
  >(new Map());

  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [rHeld, setRHeld] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateOrigin, setRotateOrigin] = useState<{ angle: number; baseRot: number }>({ angle: 0, baseRot: 0 });
  const [eyedropperPreviewHex, setEyedropperPreviewHex] = useState<string | null>(null);
  const [imageTick, setImageTick] = useState(0);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);
  const [dHeld, setDHeld] = useState(false);
  const [pickedLayerToast, setPickedLayerToast] = useState<{ name: string; x: number; y: number } | null>(null);
  const pickedToastTimerRef = useRef<number | null>(null);
  const [stabilizerCursor, setStabilizerCursor] = useState<Point | null>(null);
  const [penStatus, setPenStatus] = useState<{ type: string; pressure: number }>({
    type: 'mouse',
    pressure: 1
  });

  // Lasso & Polygonal Lasso state
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [lassoClosed, setLassoClosed] = useState(false);
  const [lassoCursor, setLassoCursor] = useState<Point | null>(null);
  const [selectShapeStart, setSelectShapeStart] = useState<Point | null>(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);

  // Perspective Vanishing Points (VP1, VP2, VP3)
  const [vanishingPoints, setVanishingPoints] = useState<Point[]>([
    { x: 960, y: 540 },
    { x: 180, y: 540 },
    { x: 960, y: 100 }
  ]);
  const [draggingVpIndex, setDraggingVpIndex] = useState<number | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [dragLastPt, setDragLastPt] = useState<Point | null>(null);

  // Canvas Crop / Resize Tool (C key)
  type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';
  const [cropRect, setCropRect] = useState({ left: 0, top: 0, right: 1920, bottom: 1080 });
  const [activeCropHandle, setActiveCropHandle] = useState<CropHandle | null>(null);
  const [cropDragStart, setCropDragStart] = useState<{ pt: Point; rect: { left: number; top: number; right: number; bottom: number } } | null>(null);
  const [hoverCropHandle, setHoverCropHandle] = useState<CropHandle | null>(null);

  // Free Transform / Perspective Tool (Ctrl+T)
  type Quad = { tl: Point; tr: Point; br: Point; bl: Point };
  type TransformHandle = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l' | 'rot' | 'move';
  const [transformActive, setTransformActive] = useState(false);
  const [transformSubMode, setTransformSubMode] = useState<'scale' | 'perspective'>('scale');
  const [transformOrigStrokes, setTransformOrigStrokes] = useState<Stroke[]>([]);
  const [transformOrigBounds, setTransformOrigBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const [transformQuad, setTransformQuad] = useState<Quad | null>(null);
  const [activeTransformHandle, setActiveTransformHandle] = useState<TransformHandle | null>(null);
  const [hoverTransformHandle, setHoverTransformHandle] = useState<TransformHandle | null>(null);
  const [transformDragStart, setTransformDragStart] = useState<{ pt: Point; quad: Quad } | null>(null);
  const [transformMenuPos, setTransformMenuPos] = useState<{ x: number; y: number } | null>(null);

  const {
    canvasWidth,
    canvasHeight,
    layers,
    activeLayerId,
    activeTool,
    activeBrushPreset,
    activeArtLayer,
    activeColor,
    brushSize,
    brushMinSize,
    usePressure,
    brushOpacity,
    brushSmoothing,
    shapeFilled,
    bucketReference,
    bucketTolerance,
    bucketExpand,
    bucketBehind,
    swatches,
    activeSwatchId,
    currentFrame,
    zoom,
    panX,
    panY,
    rotation,
    flipX,
    grayscaleMode,
    hsvPreview,
    cropMode,
    showGrid,
    perspectiveMode,
    symmetryMode,
    showCameraFrame,
    lightTable,
    onionSkin,
    onionPrev,
    onionNext,
    setZoom,
    setPan,
    setRotation,
    setActiveColor,
    pushRecentColor,
    setArtLayer,
    setCropMode,
    resizeCanvas,
    addStroke,
    moveStrokes,
    replaceStrokes,
    deleteStrokes,
    setActiveLayer,
    setClipboardStrokes,
    timelapseRecording,
    performanceMode,
    pushTimelapseFrame
  } = useHarmonyStore();

  const isEcoMode =
    performanceMode === 'eco' || (performanceMode === 'auto' && detectIsWeakHardware());

  useEffect(() => {
    setGlobalEcoMode(isEcoMode);
  }, [isEcoMode]);

  const sceneStepCounterRef = useRef<Record<string, number>>({});

  // Capture a lightweight timelapse snapshot whenever a stroke is committed while recording
  const captureTimelapseStep = useCallback(() => {
    if (!timelapseRecording) return;
    window.setTimeout(() => {
      const s = useHarmonyStore.getState();
      const src = document.createElement('canvas');
      renderFrameToCanvas(src, s.layers, s.currentFrame, s.canvasWidth, s.canvasHeight, '#ffffff');
      const snap = document.createElement('canvas');
      const scale = Math.min(1, 960 / s.canvasWidth);
      snap.width = Math.round(s.canvasWidth * scale);
      snap.height = Math.round(s.canvasHeight * scale);
      const sctx = snap.getContext('2d');
      if (sctx) {
        sctx.drawImage(src, 0, 0, snap.width, snap.height);
        const dataUrl = snap.toDataURL('image/jpeg', 0.82);
        pushTimelapseFrame(dataUrl);
        if (s.timelapseRootDir && window.harmonyAPI?.writeFrameToDir) {
          const safeScene = (s.projectName || 'Cena').replace(/[<>:"/\\|?*]+/g, '_').trim() || 'Cena';
          const nextNum = (sceneStepCounterRef.current[safeScene] || 0) + 1;
          sceneStepCounterRef.current[safeScene] = nextNum;
          const fileName = `${safeScene}/step_${String(nextNum).padStart(4, '0')}.jpg`;
          window.harmonyAPI.writeFrameToDir(s.timelapseRootDir, fileName, dataUrl).catch(() => {});
        }
      }
    }, 20);
  }, [timelapseRecording, pushTimelapseFrame]);

  // Repaint immediately whenever a flood-fill or imported image finishes decoding
  useEffect(() => {
    const onImgLoaded = () => setImageTick((t) => t + 1);
    window.addEventListener('celsketch:image-loaded', onImgLoaded);
    return () => window.removeEventListener('celsketch:image-loaded', onImgLoaded);
  }, []);

  // Initialize crop rectangle whenever Crop Mode (C) opens
  useEffect(() => {
    if (cropMode) {
      setCropRect({ left: 0, top: 0, right: canvasWidth, bottom: canvasHeight });
      setActiveCropHandle(null);
      setCropDragStart(null);
    }
  }, [cropMode, canvasWidth, canvasHeight]);

  // Enter / Escape shortcuts while in Crop Mode
  useEffect(() => {
    if (!cropMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const w = Math.max(64, Math.round(cropRect.right - cropRect.left));
        const h = Math.max(64, Math.round(cropRect.bottom - cropRect.top));
        resizeCanvas(Math.round(cropRect.left), Math.round(cropRect.top), w, h);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCropMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [cropMode, cropRect, resizeCanvas, setCropMode]);

  const hitTestCropHandle = useCallback(
    (pt: Point): CropHandle | null => {
      const tol = 14 / zoom;
      const midX = (cropRect.left + cropRect.right) / 2;
      const midY = (cropRect.top + cropRect.bottom) / 2;
      const handles: { id: CropHandle; x: number; y: number }[] = [
        { id: 'nw', x: cropRect.left, y: cropRect.top },
        { id: 'n', x: midX, y: cropRect.top },
        { id: 'ne', x: cropRect.right, y: cropRect.top },
        { id: 'e', x: cropRect.right, y: midY },
        { id: 'se', x: cropRect.right, y: cropRect.bottom },
        { id: 's', x: midX, y: cropRect.bottom },
        { id: 'sw', x: cropRect.left, y: cropRect.bottom },
        { id: 'w', x: cropRect.left, y: midY }
      ];
      for (const h of handles) {
        if (Math.abs(pt.x - h.x) <= tol && Math.abs(pt.y - h.y) <= tol) {
          return h.id;
        }
      }
      if (
        pt.x >= cropRect.left &&
        pt.x <= cropRect.right &&
        pt.y >= cropRect.top &&
        pt.y <= cropRect.bottom
      ) {
        return 'move';
      }
      return null;
    },
    [cropRect, zoom]
  );

  const activeSwatch = swatches.find((s) => s.id === activeSwatchId) || swatches[0];

  const closeLassoAndSelect = useCallback(
    (poly: Point[]) => {
      if (poly.length < 3) {
        setLassoPoints([]);
        setLassoClosed(false);
        setSelectedStrokeIds([]);
        return;
      }
      const activeLayer = layers.find((l) => l.id === activeLayerId);
      const strokes = activeLayer?.frames[currentFrame] || [];
      const hits = strokes
        .filter((st) => st.points.some((p) => isPointInPolygon(p, poly)))
        .map((st) => st.id);
      setLassoPoints(poly);
      setLassoClosed(true);
      setLassoCursor(null);
      setSelectedStrokeIds(hits);
    },
    [layers, activeLayerId, currentFrame]
  );

  const commitPolyFill = useCallback(
    (poly: Point[]) => {
      if (poly.length < 3) {
        setLassoPoints([]);
        setLassoClosed(false);
        setLassoCursor(null);
        setSelectedStrokeIds([]);
        return;
      }
      const newStroke: Stroke = {
        id: `st-polyfill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'fill',
        artLayer: activeArtLayer,
        swatchId: activeSwatch.id,
        color: activeColor,
        size: 1,
        opacity: brushOpacity,
        smoothing: 0,
        points: poly.map((p) => ({ x: p.x, y: p.y })),
        filled: true
      };
      addStroke(newStroke);
      pushRecentColor(activeColor);
      captureTimelapseStep();
      setLassoPoints([]);
      setLassoClosed(false);
      setLassoCursor(null);
      setSelectedStrokeIds([]);
    },
    [activeArtLayer, activeSwatch.id, activeColor, brushOpacity, addStroke, pushRecentColor, captureTimelapseStep]
  );

  const fillSelection = useCallback(() => {
    if (!lassoClosed || lassoPoints.length < 3) return;
    const newStroke: Stroke = {
      id: `st-fill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: 'fill',
      artLayer: activeArtLayer,
      swatchId: activeSwatch.id,
      color: activeColor,
      size: 1,
      opacity: brushOpacity,
      smoothing: 0,
      points: lassoPoints.map((p) => ({ x: p.x, y: p.y })),
      filled: true
    };
    addStroke(newStroke);
  }, [lassoClosed, lassoPoints, activeArtLayer, activeSwatch.id, activeColor, brushOpacity, addStroke]);

  const deleteSelection = useCallback(() => {
    if (!lassoClosed || lassoPoints.length < 3) return;
    // Exact polygon erase mask: ONLY erases pixels strictly inside the selection on the active layer!
    const eraseMask: Stroke = {
      id: `st-erase-poly-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: 'erase_poly',
      artLayer: activeArtLayer,
      swatchId: activeSwatch.id,
      color: '#000000',
      size: 1,
      opacity: 1,
      smoothing: 0,
      points: lassoPoints.map((p) => ({ x: p.x, y: p.y })),
      filled: true
    };
    addStroke(eraseMask);
    setSelectedStrokeIds([]);
  }, [lassoClosed, lassoPoints, activeArtLayer, activeSwatch.id, addStroke]);

  const mapStrokesToQuad = useCallback(
    (origStrokes: Stroke[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, quad: Quad): Stroke[] => {
      const bw = Math.max(1, bounds.maxX - bounds.minX);
      const bh = Math.max(1, bounds.maxY - bounds.minY);
      const mapPt = (px: number, py: number) => {
        const u = (px - bounds.minX) / bw;
        const v = (py - bounds.minY) / bh;
        return {
          x:
            (1 - u) * (1 - v) * quad.tl.x +
            u * (1 - v) * quad.tr.x +
            u * v * quad.br.x +
            (1 - u) * v * quad.bl.x,
          y:
            (1 - u) * (1 - v) * quad.tl.y +
            u * (1 - v) * quad.tr.y +
            u * v * quad.br.y +
            (1 - u) * v * quad.bl.y
        };
      };

      return origStrokes.map((st) => {
        if (st.tool === 'image') {
          const ix = st.imageX ?? 0;
          const iy = st.imageY ?? 0;
          const iw = st.imageW ?? canvasWidth;
          const ih = st.imageH ?? canvasHeight;
          const p1 = mapPt(ix, iy);
          const p2 = mapPt(ix + iw, iy + ih);
          return {
            ...st,
            imageX: Math.min(p1.x, p2.x),
            imageY: Math.min(p1.y, p2.y),
            imageW: Math.max(4, Math.abs(p2.x - p1.x)),
            imageH: Math.max(4, Math.abs(p2.y - p1.y))
          };
        }
        return {
          ...st,
          points: st.points.map((pt) => {
            const m = mapPt(pt.x, pt.y);
            return { ...pt, x: m.x, y: m.y };
          })
        };
      });
    },
    [canvasWidth, canvasHeight]
  );

  const openTransform = useCallback(() => {
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    const frameStrokes = activeLayer?.frames[currentFrame] || [];
    const targetStrokes =
      selectedStrokeIds.length > 0
        ? frameStrokes.filter((s) => selectedStrokeIds.includes(s.id))
        : frameStrokes;
    if (targetStrokes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const st of targetStrokes) {
      if (st.tool === 'image') {
        const ix = st.imageX ?? 0;
        const iy = st.imageY ?? 0;
        const iw = st.imageW ?? canvasWidth;
        const ih = st.imageH ?? canvasHeight;
        if (ix < minX) minX = ix;
        if (iy < minY) minY = iy;
        if (ix + iw > maxX) maxX = ix + iw;
        if (iy + ih > maxY) maxY = iy + ih;
      } else {
        for (const p of st.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
    }
    if (!isFinite(minX)) return;
    if (maxX - minX < 10) { minX -= 5; maxX += 5; }
    if (maxY - minY < 10) { minY -= 5; maxY += 5; }

    setTransformOrigStrokes(JSON.parse(JSON.stringify(targetStrokes)));
    setTransformOrigBounds({ minX, minY, maxX, maxY });
    setTransformQuad({
      tl: { x: minX, y: minY },
      tr: { x: maxX, y: minY },
      br: { x: maxX, y: maxY },
      bl: { x: minX, y: maxY }
    });
    setTransformSubMode('scale');
    setTransformActive(true);
  }, [layers, activeLayerId, currentFrame, selectedStrokeIds, canvasWidth, canvasHeight]);

  const commitTransform = useCallback(() => {
    if (!transformActive || !transformOrigBounds || !transformQuad) return;
    const mapped = mapStrokesToQuad(transformOrigStrokes, transformOrigBounds, transformQuad);
    replaceStrokes(mapped);
    setTransformActive(false);
    setTransformQuad(null);
    setTransformOrigBounds(null);
    setTransformOrigStrokes([]);
  }, [transformActive, transformOrigBounds, transformQuad, transformOrigStrokes, mapStrokesToQuad, replaceStrokes]);

  const cancelTransform = useCallback(() => {
    setTransformActive(false);
    setTransformQuad(null);
    setTransformOrigBounds(null);
    setTransformOrigStrokes([]);
  }, []);

  const rotateQuadBy = useCallback((deg: number) => {
    setTransformQuad((q) => {
      if (!q) return q;
      const cx = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
      const cy = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const r = (p: Point): Point => ({
        x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
        y: cy + (p.x - cx) * sin + (p.y - cy) * cos
      });
      return { tl: r(q.tl), tr: r(q.tr), br: r(q.br), bl: r(q.bl) };
    });
  }, []);

  const hitTestTransformHandle = useCallback(
    (pt: Point, q: Quad): TransformHandle | null => {
      const tol = 14 / zoom;
      const { tl, tr, br, bl } = q;
      const tMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
      const rMid = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
      const bMid = { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 };
      const lMid = { x: (bl.x + tl.x) / 2, y: (bl.y + tl.y) / 2 };

      if (Math.hypot(pt.x - tl.x, pt.y - tl.y) <= tol) return 'tl';
      if (Math.hypot(pt.x - tr.x, pt.y - tr.y) <= tol) return 'tr';
      if (Math.hypot(pt.x - br.x, pt.y - br.y) <= tol) return 'br';
      if (Math.hypot(pt.x - bl.x, pt.y - bl.y) <= tol) return 'bl';
      if (Math.hypot(pt.x - tMid.x, pt.y - tMid.y) <= tol) return 't';
      if (Math.hypot(pt.x - rMid.x, pt.y - rMid.y) <= tol) return 'r';
      if (Math.hypot(pt.x - bMid.x, pt.y - bMid.y) <= tol) return 'b';
      if (Math.hypot(pt.x - lMid.x, pt.y - lMid.y) <= tol) return 'l';
      if (isPointInPolygon(pt, [tl, tr, br, bl])) return 'move';
      // Anywhere outside the box -> Rotate! (classic pro Free Transform feel)
      return 'rot';
    },
    [zoom]
  );

  // Ctrl+T to open Transform, Enter to commit, Escape to cancel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (transformActive) commitTransform();
        else openTransform();
      } else if (transformActive && e.key === 'Enter') {
        e.preventDefault();
        commitTransform();
      } else if (transformActive && e.key === 'Escape') {
        e.preventDefault();
        cancelTransform();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [transformActive, openTransform, commitTransform, cancelTransform]);

  // Selection keyboard controls: Ctrl+A (Select All), Alt+Backspace (Fill), Delete/Backspace, Enter, Esc/Ctrl+D
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x') && lassoClosed && lassoPoints.length >= 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const isCut = e.key.toLowerCase() === 'x';
        // Crop ONLY the exact pixels inside the selection polygon from the active layer!
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (!activeLayer) return;
        const strokes = getEffectiveFrameStrokes(activeLayer, currentFrame);
        if (strokes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of lassoPoints) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const bx = Math.max(0, Math.floor(minX));
        const by = Math.max(0, Math.floor(minY));
        const bw = Math.max(2, Math.min(canvasWidth - bx, Math.ceil(maxX - bx)));
        const bh = Math.max(2, Math.min(canvasHeight - by, Math.ceil(maxY - by)));

        const full = document.createElement('canvas');
        full.width = canvasWidth;
        full.height = canvasHeight;
        const fctx = full.getContext('2d');
        if (!fctx) return;
        for (const st of strokes) {
          renderStroke(fctx, st);
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = bw;
        cropCanvas.height = bh;
        const cctx = cropCanvas.getContext('2d');
        if (!cctx) return;
        cctx.beginPath();
        cctx.moveTo(lassoPoints[0].x - bx, lassoPoints[0].y - by);
        for (let i = 1; i < lassoPoints.length; i++) {
          cctx.lineTo(lassoPoints[i].x - bx, lassoPoints[i].y - by);
        }
        cctx.closePath();
        cctx.clip();
        cctx.drawImage(full, bx, by, bw, bh, 0, 0, bw, bh);

        const croppedStroke: Stroke = {
          id: `st-clip-${Date.now()}`,
          tool: 'image',
          artLayer: activeArtLayer,
          swatchId: activeSwatch.id,
          color: '#ffffff',
          size: 1,
          opacity: 1,
          smoothing: 0,
          points: [{ x: bx, y: by }],
          imageDataUrl: cropCanvas.toDataURL('image/png'),
          imageX: bx,
          imageY: by,
          imageW: bw,
          imageH: bh
        };
        setClipboardStrokes([croppedStroke]);
        if (isCut) {
          deleteSelection();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const fullRect: Point[] = [
          { x: 0, y: 0 },
          { x: canvasWidth, y: 0 },
          { x: canvasWidth, y: canvasHeight },
          { x: 0, y: canvasHeight }
        ];
        closeLassoAndSelect(fullRect);
        return;
      }

      if (e.altKey && e.key === 'Backspace' && lassoClosed && lassoPoints.length >= 3) {
        e.preventDefault();
        fillSelection();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && lassoClosed && lassoPoints.length >= 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        deleteSelection();
      } else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd')) {
        if (lassoPoints.length > 0) {
          e.preventDefault();
          setLassoPoints([]);
          setLassoClosed(false);
          setLassoCursor(null);
          setSelectedStrokeIds([]);
        }
      } else if (e.key === 'Enter' && lassoPoints.length >= 3 && !lassoClosed) {
        e.preventDefault();
        if (activeTool === 'polylassofill') {
          commitPolyFill(lassoPoints);
        } else {
          closeLassoAndSelect(lassoPoints);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [
    canvasWidth,
    canvasHeight,
    lassoPoints,
    lassoClosed,
    closeLassoAndSelect,
    fillSelection,
    deleteSelection,
    layers,
    activeLayerId,
    currentFrame,
    activeArtLayer,
    activeSwatch.id,
    setClipboardStrokes
  ]);

  // Hold Space to pan, Hold R to rotate canvas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && !e.shiftKey) {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setRHeld(true);
      } else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setDHeld(true);
      } else if (e.key === 'Alt') {
        setAltHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        setIsPanning(false);
      } else if (e.key.toLowerCase() === 'r') {
        setRHeld(false);
        setIsRotating(false);
      } else if (e.key.toLowerCase() === 'd') {
        setDHeld(false);
      } else if (e.key === 'Alt') {
        setAltHeld(false);
        setEyedropperPreviewHex((hex) => {
          if (hex) {
            setActiveColor(hex);
            pushRecentColor(hex);
          }
          return null;
        });
      }
    };
    const onBlur = () => {
      setSpaceHeld(false);
      setIsPanning(false);
      setRHeld(false);
      setIsRotating(false);
      setDHeld(false);
      setAltHeld(false);
      setEyedropperPreviewHex(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): Point => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2 + panX;
      const centerY = rect.top + rect.height / 2 + panY;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      // Inverse rotation
      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;

      const x = (rx / zoom) * (flipX ? -1 : 1) + canvasWidth / 2;
      const y = ry / zoom + canvasHeight / 2;
      return { x, y };
    },
    [panX, panY, rotation, zoom, flipX, canvasWidth, canvasHeight]
  );

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = isEcoMode ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const rect = container.getBoundingClientRect();
    const targetW = Math.floor(rect.width * dpr);
    const targetH = Math.floor(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }

    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Outer dark workspace backdrop
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Transform into camera stage space
    ctx.translate(rect.width / 2 + panX, rect.height / 2 + panY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipX ? -zoom : zoom, zoom);
    ctx.translate(-canvasWidth / 2, -canvasHeight / 2);

    // Stage Paper / Camera Background (fast zero-shadowBlur drop-shadow — 10x faster on CPU/iGPU!)
    const shadowOffset = Math.max(2, 6 / zoom);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fillRect(shadowOffset, shadowOffset, canvasWidth, canvasHeight);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 12-Field Animation Grid
    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(58, 134, 255, 0.18)';
      ctx.lineWidth = 1 / zoom;
      const cols = 12;
      const rows = 12;
      const stepX = canvasWidth / cols;
      const stepY = canvasHeight / rows;
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * stepX, 0);
        ctx.lineTo(i * stepX, canvasHeight);
        ctx.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        ctx.beginPath();
        ctx.moveTo(0, j * stepY);
        ctx.lineTo(canvasWidth, j * stepY);
        ctx.stroke();
      }
      // Center crosshair
      ctx.strokeStyle = 'rgba(58, 134, 255, 0.45)';
      ctx.beginPath();
      ctx.moveTo(canvasWidth / 2, 0);
      ctx.lineTo(canvasWidth / 2, canvasHeight);
      ctx.moveTo(0, canvasHeight / 2);
      ctx.lineTo(canvasWidth, canvasHeight / 2);
      ctx.stroke();
      ctx.restore();
    }

    // Persistent offscreen layer compositor (3x faster, zero GC stutter!)
    if (!layerBufferRef.current) {
      layerBufferRef.current = document.createElement('canvas');
    }
    const layerBuffer = layerBufferRef.current;
    if (layerBuffer.width !== canvasWidth || layerBuffer.height !== canvasHeight) {
      layerBuffer.width = canvasWidth;
      layerBuffer.height = canvasHeight;
    }
    const lctx = layerBuffer.getContext('2d');

    // Helper: get or rasterize a cached static bitmap for (layer, frame, tint) — O(1) blit on subsequent frames!
    const getCachedLayerBitmap = (
      cacheKey: string,
      strokes: Stroke[],
      tint?: string
    ): HTMLCanvasElement => {
      const cache = layerBitmapCacheRef.current;
      const existing = cache.get(cacheKey);
      if (
        existing &&
        existing.strokesRef === strokes &&
        existing.width === canvasWidth &&
        existing.height === canvasHeight &&
        existing.imgTick === imageTick
      ) {
        // Refresh LRU position
        cache.delete(cacheKey);
        cache.set(cacheKey, existing);
        return existing.canvas;
      }

      let bmpCanvas = existing?.canvas;
      const maxCacheEntries = isEcoMode ? 12 : 28;
      if (!bmpCanvas) {
        if (cache.size >= maxCacheEntries) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey) {
            const evicted = cache.get(oldestKey);
            cache.delete(oldestKey);
            bmpCanvas = evicted?.canvas;
          }
        }
        if (!bmpCanvas) bmpCanvas = document.createElement('canvas');
      }
      if (bmpCanvas.width !== canvasWidth || bmpCanvas.height !== canvasHeight) {
        bmpCanvas.width = canvasWidth;
        bmpCanvas.height = canvasHeight;
      }
      const bctx = bmpCanvas.getContext('2d')!;
      bctx.clearRect(0, 0, canvasWidth, canvasHeight);
      for (const st of strokes) {
        renderStroke(bctx, st, tint, 1);
      }
      cache.set(cacheKey, {
        strokesRef: strokes,
        width: canvasWidth,
        height: canvasHeight,
        imgTick: imageTick,
        canvas: bmpCanvas
      });
      return bmpCanvas;
    };

    // Render all visible layers bottom-to-top, clipped strictly to the canvas bounds!
    if (lctx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvasWidth, canvasHeight);
      ctx.clip();

      const ordered = [...layers].reverse();
      for (const layer of ordered) {
        if (!isLayerEffectivelyVisible(layer, layers)) continue;
        const isCurrent = layer.id === activeLayerId;

        if (onionSkin && !layer.holdFrames) {
          // Previous frames (reddish tint — cached!)
          for (let offset = onionPrev; offset >= 1; offset--) {
            const f = currentFrame - offset;
            if (f < 1) continue;
            const prevStrokes = layer.frames[f];
            if (!prevStrokes || prevStrokes.length === 0) continue;
            const bmp = getCachedLayerBitmap(`${layer.id}:${f}:prev`, prevStrokes, '#e04848');
            ctx.save();
            ctx.globalAlpha = 0.45 / offset;
            ctx.drawImage(bmp, 0, 0);
            ctx.restore();
          }
          // Next frames (greenish tint — cached!)
          for (let offset = 1; offset <= onionNext; offset++) {
            const f = currentFrame + offset;
            const nextStrokes = layer.frames[f];
            if (!nextStrokes || nextStrokes.length === 0) continue;
            const bmp = getCachedLayerBitmap(`${layer.id}:${f}:next`, nextStrokes, '#32b85c');
            ctx.save();
            ctx.globalAlpha = 0.45 / offset;
            ctx.drawImage(bmp, 0, 0);
            ctx.restore();
          }
        }

        const strokes = getEffectiveFrameStrokes(layer, currentFrame);

        if (strokes.length === 0 && !(isCurrent && draftStroke)) continue;

        let sourceCanvas: HTMLCanvasElement;
        if (isCurrent && transformActive) {
          lctx.clearRect(0, 0, canvasWidth, canvasHeight);
          const transformingIds = new Set(transformOrigStrokes.map((s) => s.id));
          for (const st of strokes) {
            if (transformingIds.has(st.id)) continue;
            renderStroke(lctx, st);
          }
          if (transformOrigBounds && transformQuad) {
            const previewStrokes = mapStrokesToQuad(transformOrigStrokes, transformOrigBounds, transformQuad);
            for (const st of previewStrokes) {
              renderStroke(lctx, st);
            }
          }
          sourceCanvas = layerBuffer;
        } else if (isCurrent && draftStroke) {
          lctx.clearRect(0, 0, canvasWidth, canvasHeight);
          if (strokes.length > 0) {
            const baseBmp = getCachedLayerBitmap(`${layer.id}:${currentFrame}:base`, strokes);
            lctx.drawImage(baseBmp, 0, 0);
          }
          const effectiveDraft =
            layer.alphaLock && draftStroke.tool !== 'eraser' && draftStroke.tool !== 'erase_poly'
              ? { ...draftStroke, alphaLock: true }
              : draftStroke;
          renderStroke(lctx, effectiveDraft);
          sourceCanvas = layerBuffer;
        } else {
          sourceCanvas = getCachedLayerBitmap(`${layer.id}:${currentFrame}:base`, strokes);
        }

        const kf = getInterpolatedLayerTransform(layer, currentFrame);
        ctx.save();
        const lightTableDim = lightTable && !isCurrent ? 0.3 : 1;
        ctx.globalAlpha = kf.opacity * lightTableDim;
        ctx.globalCompositeOperation = layer.clippingMask
          ? 'source-atop'
          : layer.blendMode || 'source-over';

        const filters: string[] = [];
        if (layer.effects) {
          if (layer.effects.blur > 0) filters.push(`blur(${layer.effects.blur}px)`);
          if (layer.effects.glow > 0) {
            filters.push(`drop-shadow(0 0 ${layer.effects.glow}px ${layer.effects.glowColor})`);
          }
          if (layer.effects.dropShadow) {
            filters.push('drop-shadow(6px 6px 8px rgba(0,0,0,0.45))');
          }
        }
        if (isCurrent && hsvPreview) {
          const satPct = Math.max(0, 100 + hsvPreview.s);
          const briPct = Math.max(0, 100 + hsvPreview.v);
          filters.push(`hue-rotate(${hsvPreview.h}deg) saturate(${satPct}%) brightness(${briPct}%)`);
        }
        if (filters.length > 0) {
          ctx.filter = filters.join(' ');
        }

        ctx.translate(canvasWidth / 2 + kf.x, canvasHeight / 2 + kf.y);
        ctx.rotate((kf.rotation * Math.PI) / 180);
        ctx.scale(kf.scale, kf.scale);
        ctx.drawImage(sourceCanvas, -canvasWidth / 2, -canvasHeight / 2);
        ctx.restore();
      }
      ctx.restore();
    }

    // Live Symmetry Ruler Axis (Vertical Mirror)
    if (symmetryMode === 'vertical') {
      ctx.save();
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.75)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([8 / zoom, 5 / zoom]);
      ctx.beginPath();
      ctx.moveTo(canvasWidth / 2, 0);
      ctx.lineTo(canvasWidth / 2, canvasHeight);
      ctx.stroke();
      ctx.restore();
    }

    // Perspective Ruler Guides (1P / 2P / 3P / Fisheye 5-Point) with Draggable Vanishing Points
    if (perspectiveMode > 0) {
      ctx.save();
      if (perspectiveMode === 4) {
        // Fisheye (5-Point Curvilinear Perspective Sphere) centered on VP1
        const cx = vanishingPoints[0].x;
        const cy = vanishingPoints[0].y;
        const radius = Math.min(canvasWidth, canvasHeight) * 0.46;

        // Outer sphere circle + horizon & vertical meridian
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.55)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Curved horizontal & vertical fisheye grid arcs
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.30)';
        ctx.lineWidth = 1 / zoom;
        for (const frac of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
          // Horizontal bowed arcs
          ctx.beginPath();
          ctx.moveTo(cx - radius, cy);
          ctx.quadraticCurveTo(cx, cy + radius * frac * 1.4, cx + radius, cy);
          ctx.stroke();
          // Vertical bowed arcs
          ctx.beginPath();
          ctx.moveTo(cx, cy - radius);
          ctx.quadraticCurveTo(cx + radius * frac * 1.4, cy, cx, cy + radius);
          ctx.stroke();
        }

        // Draggable Fisheye Center Handle
        ctx.fillStyle = '#00d2ff';
        ctx.beginPath();
        ctx.arc(cx, cy, 7 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
      } else {
        const activeVps =
          perspectiveMode === 1
            ? [vanishingPoints[0]]
            : perspectiveMode === 2
            ? [vanishingPoints[0], vanishingPoints[1]]
            : [vanishingPoints[0], vanishingPoints[1], vanishingPoints[2]];

        // Horizon line (through VP1)
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.55)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.moveTo(-canvasWidth, vanishingPoints[0].y);
        ctx.lineTo(canvasWidth * 2, vanishingPoints[0].y);
        ctx.stroke();

        const vpColors = ['rgba(0, 210, 255, 0.35)', 'rgba(255, 100, 200, 0.35)', 'rgba(255, 200, 50, 0.35)'];
        activeVps.forEach((vp, idx) => {
          ctx.strokeStyle = vpColors[idx];
          ctx.lineWidth = 1 / zoom;
          const rays = 24;
          for (let r = 0; r < rays; r++) {
            const ang = (r / rays) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(vp.x, vp.y);
            ctx.lineTo(vp.x + Math.cos(ang) * canvasWidth * 2.5, vp.y + Math.sin(ang) * canvasWidth * 2.5);
            ctx.stroke();
          }
          // Vanishing point handle
          ctx.fillStyle = idx === 0 ? '#00d2ff' : idx === 1 ? '#ff64c8' : '#ffc832';
          ctx.beginPath();
          ctx.arc(vp.x, vp.y, 7 / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    // Lasso Selection Overlay (Photoshop-style marching ants)
    if (lassoPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      if (lassoClosed) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(58, 134, 255, 0.10)';
        ctx.fill();
      } else if (lassoCursor) {
        ctx.lineTo(lassoCursor.x, lassoCursor.y);
        if (activeTool === 'polylassofill' && lassoPoints.length >= 2) {
          ctx.save();
          ctx.closePath();
          ctx.globalAlpha = Math.min(0.45, brushOpacity * 0.45);
          ctx.fillStyle = activeColor;
          ctx.fill();
          ctx.restore();
        }
      }

      // White base + black dashed outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.stroke();

      // Vertex dots for polygonal lasso
      if (!lassoClosed && (activeTool === 'polylasso' || activeTool === 'polylassofill' || lassoPoints.length < 30)) {
        ctx.fillStyle = '#3a86ff';
        for (const p of lassoPoints) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.5 / zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Photoshop-style Stabilizer pulled-string guide line
    if (isDrawing && draftStroke && stabilizerCursor && brushSmoothing > 0 && draftStroke.points.length > 0) {
      const tip = draftStroke.points[draftStroke.points.length - 1];
      ctx.save();
      ctx.strokeStyle = 'rgba(58, 134, 255, 0.85)';
      ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(stabilizerCursor.x, stabilizerCursor.y);
      ctx.stroke();

      ctx.fillStyle = '#3a86ff';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Free Transform Bounding Quad (Ctrl+T)
    if (transformActive && transformQuad) {
      const { tl, tr, br, bl } = transformQuad;
      const cx = (tl.x + tr.x + br.x + bl.x) / 4;
      const cy = (tl.y + tr.y + br.y + bl.y) / 4;

      ctx.save();
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.stroke();

      // Center Pivot Crosshair (⊕)
      const pr = 6 / zoom;
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.moveTo(cx - pr * 1.6, cy);
      ctx.lineTo(cx + pr * 1.6, cy);
      ctx.moveTo(cx, cy - pr * 1.6);
      ctx.lineTo(cx, cy + pr * 1.6);
      ctx.stroke();

      // 8 Crisp Handles (4 Corners + 4 Edge Midpoints)
      const hs = 8 / zoom;
      const edgeMids = [
        { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 },
        { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 },
        { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 },
        { x: (bl.x + tl.x) / 2, y: (bl.y + tl.y) / 2 }
      ];
      for (const hPt of [tl, tr, br, bl, ...edgeMids]) {
        ctx.fillStyle = transformSubMode === 'perspective' ? '#f59e0b' : '#ffffff';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.5 / zoom;
        ctx.fillRect(hPt.x - hs / 2, hPt.y - hs / 2, hs, hs);
        ctx.strokeRect(hPt.x - hs / 2, hPt.y - hs / 2, hs, hs);
      }
      ctx.restore();
    }

    // Canvas Crop / Resize Overlay (C key — Clip Studio style)
    if (cropMode) {
      ctx.save();
      const cw = cropRect.right - cropRect.left;
      const ch = cropRect.bottom - cropRect.top;

      // Darken everything outside the crop rectangle using evenodd fill
      ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
      ctx.beginPath();
      ctx.rect(-10000, -10000, 20000, 20000);
      ctx.rect(cropRect.left, cropRect.top, cw, ch);
      ctx.fill('evenodd');

      // Subtle translucent dark-gray fill for newly expanded areas outside original canvas
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeRect(cropRect.left, cropRect.top, cw, ch);

      // Center crosshair '+'
      const cx = cropRect.left + cw / 2;
      const cy = cropRect.top + ch / 2;
      const cross = 6 / zoom;
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(cx - cross, cy);
      ctx.lineTo(cx + cross, cy);
      ctx.moveTo(cx, cy - cross);
      ctx.lineTo(cx, cy + cross);
      ctx.stroke();

      // 8 White Square Handles
      const hs = 8 / zoom;
      const handleCoords = [
        [cropRect.left, cropRect.top],
        [cx, cropRect.top],
        [cropRect.right, cropRect.top],
        [cropRect.right, cy],
        [cropRect.right, cropRect.bottom],
        [cx, cropRect.bottom],
        [cropRect.left, cropRect.bottom],
        [cropRect.left, cy]
      ];
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 1 / zoom;
      for (const [hx, hy] of handleCoords) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      ctx.restore();
    }

    // Camera Safe Frame Border
    if (showCameraFrame) {
      ctx.save();
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(0, 0, canvasWidth, canvasHeight);

      // Action Safe (90%)
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.35)';
      ctx.setLineDash([8 / zoom, 6 / zoom]);
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(canvasWidth * 0.05, canvasHeight * 0.05, canvasWidth * 0.9, canvasHeight * 0.9);
      ctx.restore();
    }

    ctx.restore();
  }, [
    canvasWidth,
    canvasHeight,
    layers,
    activeLayerId,
    currentFrame,
    zoom,
    panX,
    panY,
    rotation,
    flipX,
    showGrid,
    showCameraFrame,
    lightTable,
    onionSkin,
    onionPrev,
    onionNext,
    draftStroke,
    stabilizerCursor,
    brushSmoothing,
    isDrawing,
    lassoPoints,
    lassoClosed,
    lassoCursor,
    activeTool,
    cropMode,
    cropRect,
    transformActive,
    transformQuad,
    transformSubMode,
    transformOrigStrokes,
    transformOrigBounds,
    mapStrokesToQuad,
    imageTick,
    perspectiveMode,
    symmetryMode,
    vanishingPoints,
    hsvPreview,
    isEcoMode
  ]);

  const getPointFromEvent = useCallback(
    (ev: { clientX: number; clientY: number; pressure?: number; pointerType?: string }): Point => {
      const base = screenToCanvas(ev.clientX, ev.clientY);
      const isPen = ev.pointerType === 'pen';
      let pressure = 1;
      if (usePressure && isPen) {
        // Universal tablet pressure (Wacom, Huion, XP-Pen, Gaomon, Surface, etc.)
        pressure = Math.max(0.02, Math.min(1, ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5));
      } else if (usePressure && ev.pressure !== undefined && ev.pressure > 0 && ev.pressure !== 0.5 && ev.pressure !== 1) {
        // Fallback for tablet drivers that report pointerType='mouse' or 'touch' with real pressure
        pressure = Math.max(0.02, Math.min(1, ev.pressure));
      }
      return { x: base.x, y: base.y, pressure };
    },
    [screenToCanvas, usePressure]
  );

  const readColorAtClient = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = Math.floor((clientX - rect.left) * dpr);
    const py = Math.floor((clientY - rect.top) * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx || px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
    const data = ctx.getImageData(px, py, 1, 1).data;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}`;
  }, []);

  const sampleColorAtClient = useCallback(
    (clientX: number, clientY: number) => {
      const hex = readColorAtClient(clientX, clientY);
      if (hex) {
        setActiveColor(hex);
        pushRecentColor(hex);
      }
    },
    [readColorAtClient, setActiveColor, pushRecentColor]
  );

  const pickLayerAtCanvasPoint = useCallback(
    (pt: Point, clientX: number, clientY: number) => {
      const probe = document.createElement('canvas');
      probe.width = 7;
      probe.height = 7;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      if (!pctx) return;

      const hasSolo = layers.some((l) => l.solo && l.type !== 'folder');
      for (const layer of layers) {
        if (!isLayerEffectivelyVisible(layer, layers)) continue;
        if (hasSolo && !layer.solo) continue;
        const strokes = getEffectiveFrameStrokes(layer, currentFrame);
        if (strokes.length === 0) continue;

        const kf = getInterpolatedLayerTransform(layer, currentFrame);
        pctx.clearRect(0, 0, 7, 7);
        pctx.save();
        pctx.translate(3 - pt.x, 3 - pt.y);
        pctx.translate(canvasWidth / 2 + kf.x, canvasHeight / 2 + kf.y);
        pctx.rotate((kf.rotation * Math.PI) / 180);
        pctx.scale(kf.scale, kf.scale);
        pctx.translate(-canvasWidth / 2, -canvasHeight / 2);
        for (const st of strokes) {
          renderStroke(pctx, st);
        }
        pctx.restore();

        const data = pctx.getImageData(0, 0, 7, 7).data;
        let hit = false;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 15) {
            hit = true;
            break;
          }
        }
        if (hit) {
          setActiveLayer(layer.id);
          const rect = containerRef.current?.getBoundingClientRect();
          const relX = rect ? clientX - rect.left : clientX;
          const relY = rect ? clientY - rect.top : clientY;
          setPickedLayerToast({ name: layer.name, x: relX, y: relY });
          if (pickedToastTimerRef.current) window.clearTimeout(pickedToastTimerRef.current);
          pickedToastTimerRef.current = window.setTimeout(() => setPickedLayerToast(null), 1100);
          return;
        }
      }
    },
    [layers, currentFrame, canvasWidth, canvasHeight, setActiveLayer]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);

    // Hold D + Click -> pick the topmost layer containing pixels under the cursor!
    if (dHeld && e.button === 0) {
      const pt = getPointFromEvent(e);
      pickLayerAtCanvasPoint(pt, e.clientX, e.clientY);
      return;
    }

    // Hold Alt (when not using Lasso) or Eyedropper tool -> pick color from canvas!
    if ((e.altKey && activeTool !== 'lasso' && activeTool !== 'zoom') || activeTool === 'eyedropper') {
      sampleColorAtClient(e.clientX, e.clientY);
      return;
    }

    if (rHeld) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = rect.left + rect.width / 2 + panX;
        const cy = rect.top + rect.height / 2 + panY;
        const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
        setRotateOrigin({ angle: startAngle, baseRot: rotation });
        setIsRotating(true);
      }
      return;
    }

    if (e.button === 1 || activeTool === 'hand' || spaceHeld) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
      return;
    }

    if (activeTool === 'zoom') {
      setZoom(e.altKey ? zoom * 0.8 : zoom * 1.25);
      return;
    }

    const pt = getPointFromEvent(e);
    setPenStatus({ type: e.pointerType || 'mouse', pressure: pt.pressure ?? 1 });

    // Draggable Perspective Vanishing Points
    if (perspectiveMode > 0) {
      const vpCount = perspectiveMode === 4 ? 1 : perspectiveMode;
      const tol = 16 / zoom;
      for (let i = 0; i < vpCount; i++) {
        if (Math.hypot(pt.x - vanishingPoints[i].x, pt.y - vanishingPoints[i].y) <= tol) {
          setDraggingVpIndex(i);
          return;
        }
      }
    }

    // Free Transform Mode (Ctrl+T) pointer down
    if (transformActive && transformQuad) {
      setTransformMenuPos(null);
      const hit = hitTestTransformHandle(pt, transformQuad);
      if (hit) {
        setActiveTransformHandle(hit);
        setTransformDragStart({ pt, quad: JSON.parse(JSON.stringify(transformQuad)) });
      }
      return;
    }

    // Canvas Crop Mode pointer down
    if (cropMode) {
      const handle = hitTestCropHandle(pt);
      if (handle) {
        setActiveCropHandle(handle);
        setCropDragStart({ pt, rect: { ...cropRect } });
      }
      return;
    }

    // Selection tools: Lasso, Polygonal Lasso, Lasso Fill, Polygonal Lasso Fill, Rect Select, Ellipse Select
    if (
      activeTool === 'lasso' ||
      activeTool === 'polylasso' ||
      activeTool === 'lassofill' ||
      activeTool === 'polylassofill' ||
      activeTool === 'rectselect' ||
      activeTool === 'ellipseselect'
    ) {
      // If we already have a closed selection and user clicks inside it -> drag to move strokes!
      if (lassoClosed && lassoPoints.length >= 3 && isPointInPolygon(pt, lassoPoints)) {
        setIsDraggingSelection(true);
        setDragLastPt(pt);
        return;
      }

      if (activeTool === 'rectselect' || activeTool === 'ellipseselect') {
        setLassoClosed(false);
        setSelectedStrokeIds([]);
        setSelectShapeStart(pt);
        setLassoPoints([pt]);
        setIsDrawing(true);
        return;
      }

      // Polygonal mode: dedicated polylasso, polylassofill, OR normal lasso with Alt held!
      const isPolyMode = activeTool === 'polylasso' || activeTool === 'polylassofill' || e.altKey;
      if (isPolyMode) {
        if (lassoClosed) {
          setLassoClosed(false);
          setSelectedStrokeIds([]);
          setLassoPoints([pt]);
          setLassoCursor(pt);
          return;
        }
        // Close if clicking near first point (within 14 screen px)
        if (lassoPoints.length >= 3) {
          const first = lassoPoints[0];
          const dist = Math.hypot(pt.x - first.x, pt.y - first.y) * zoom;
          if (dist < 14) {
            if (activeTool === 'polylassofill') {
              commitPolyFill(lassoPoints);
            } else {
              closeLassoAndSelect(lassoPoints);
            }
            return;
          }
        }
        setLassoPoints((prev) => [...prev, pt]);
        setLassoCursor(pt);
        return;
      }

      // Freehand Lasso start
      setLassoClosed(false);
      setSelectedStrokeIds([]);
      setLassoPoints([pt]);
      setIsDrawing(true);
      return;
    }

    // Support stylus eraser end (buttons === 32) automatically
    const isStylusEraser = e.pointerType === 'pen' && e.buttons === 32;
    const effectiveTool = isStylusEraser ? 'eraser' : activeTool;

    // Real Scanline Flood-Fill Paint Bucket (G)
    if (effectiveTool === 'paint') {
      pushRecentColor(activeColor);
      const fillUrl = performFloodFill(
        layers,
        activeLayerId,
        bucketReference,
        currentFrame,
        canvasWidth,
        canvasHeight,
        pt.x,
        pt.y,
        activeColor,
        bucketTolerance,
        bucketExpand
      );
      if (fillUrl) {
        addStroke(
          {
            id: `st-bucket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tool: 'image',
            artLayer: activeArtLayer,
            swatchId: activeSwatch.id,
            color: activeColor,
            size: 1,
            opacity: brushOpacity,
            smoothing: 0,
            points: [{ x: 0, y: 0 }],
            imageDataUrl: fillUrl,
            imageX: 0,
            imageY: 0,
            imageW: canvasWidth,
            imageH: canvasHeight
          },
          bucketBehind
        );
      }
      return;
    }

    if (
      effectiveTool === 'brush' ||
      effectiveTool === 'pencil' ||
      effectiveTool === 'eraser' ||
      effectiveTool === 'line' ||
      effectiveTool === 'rectangle' ||
      effectiveTool === 'ellipse'
    ) {
      const newStroke: Stroke = {
        id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: effectiveTool,
        preset: activeBrushPreset,
        artLayer: activeArtLayer,
        swatchId: activeSwatch.id,
        color: activeColor,
        size: brushSize,
        minSizeRatio: brushMinSize / 100,
        opacity: brushOpacity,
        smoothing: brushSmoothing,
        points: [pt],
        filled: shapeFilled
      };
      setDraftStroke(newStroke);
      setIsDrawing(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Move brush ring & eyedropper preview directly on GPU compositor (ZERO React re-renders on hover!)
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      const mx = e.clientX - containerRect.left;
      const my = e.clientY - containerRect.top;
      if (brushRingRef.current) {
        brushRingRef.current.style.transform = `translate3d(${mx - brushRingDiameter / 2}px, ${my - brushRingDiameter / 2}px, 0)`;
        brushRingRef.current.style.opacity = '1';
      }
      if (eyedropperSwatchRef.current) {
        eyedropperSwatchRef.current.style.transform = `translate3d(${mx + 18}px, ${my - 26}px, 0)`;
      }
    }

    // Live Eyedropper color preview while holding Alt or using Dropper tool
    if ((altHeld && activeTool !== 'lasso' && activeTool !== 'zoom') || activeTool === 'eyedropper') {
      const hex = readColorAtClient(e.clientX, e.clientY);
      if (hex) setEyedropperPreviewHex(hex);
      if (e.buttons === 1) {
        sampleColorAtClient(e.clientX, e.clientY);
      }
      return;
    }

    if (isRotating && containerRect) {
      const cx = containerRect.left + containerRect.width / 2 + panX;
      const cy = containerRect.top + containerRect.height / 2 + panY;
      const currAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      setRotation(rotateOrigin.baseRot + (currAngle - rotateOrigin.angle));
      return;
    }

    if (isPanning) {
      setPan(e.clientX - panStart.x, e.clientY - panStart.y);
      return;
    }

    const pt = screenToCanvas(e.clientX, e.clientY);

    // Dragging a Perspective Vanishing Point
    if (draggingVpIndex !== null) {
      setVanishingPoints((prev) =>
        prev.map((vp, idx) => (idx === draggingVpIndex ? { x: pt.x, y: pt.y } : vp))
      );
      return;
    }

    // Free Transform Mode (Ctrl+T) pointer move
    if (transformActive && transformQuad) {
      if (!activeTransformHandle || !transformDragStart) {
        setHoverTransformHandle(hitTestTransformHandle(pt, transformQuad));
        return;
      }
      const dx = pt.x - transformDragStart.pt.x;
      const dy = pt.y - transformDragStart.pt.y;
      const q = JSON.parse(JSON.stringify(transformDragStart.quad)) as Quad;

      if (activeTransformHandle === 'move') {
        q.tl.x += dx; q.tl.y += dy;
        q.tr.x += dx; q.tr.y += dy;
        q.br.x += dx; q.br.y += dy;
        q.bl.x += dx; q.bl.y += dy;
      } else if (activeTransformHandle === 'rot') {
        const cx = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
        const cy = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;
        const a0 = Math.atan2(transformDragStart.pt.y - cy, transformDragStart.pt.x - cx);
        const a1 = Math.atan2(pt.y - cy, pt.x - cx);
        let delta = a1 - a0;
        if (e.shiftKey) {
          // Snap rotation to 15-degree increments when holding Shift
          const snap = (15 * Math.PI) / 180;
          delta = Math.round(delta / snap) * snap;
        }
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);
        const rotPt = (p: Point): Point => ({
          x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
          y: cy + (p.x - cx) * sin + (p.y - cy) * cos
        });
        q.tl = rotPt(q.tl);
        q.tr = rotPt(q.tr);
        q.br = rotPt(q.br);
        q.bl = rotPt(q.bl);
      } else if (
        (transformSubMode === 'perspective' || e.ctrlKey) &&
        (activeTransformHandle === 'tl' || activeTransformHandle === 'tr' || activeTransformHandle === 'br' || activeTransformHandle === 'bl')
      ) {
        // Free 4-corner distort/perspective (Perspective mode OR holding Ctrl on any corner!)
        q[activeTransformHandle].x += dx;
        q[activeTransformHandle].y += dy;
      } else if (activeTransformHandle === 'tl' || activeTransformHandle === 'tr' || activeTransformHandle === 'br' || activeTransformHandle === 'bl') {
        // Corner scale: proportional by default (Shift = free stretch, Alt = scale from center)
        const oppositeMap: Record<'tl' | 'tr' | 'br' | 'bl', 'br' | 'bl' | 'tl' | 'tr'> = {
          tl: 'br',
          tr: 'bl',
          br: 'tl',
          bl: 'tr'
        };
        const cx = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
        const cy = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;
        const anchor = e.altKey ? { x: cx, y: cy } : q[oppositeMap[activeTransformHandle]];
        const origCorner = q[activeTransformHandle];
        const origDx = origCorner.x - anchor.x;
        const origDy = origCorner.y - anchor.y;
        const newDx = origCorner.x + dx - anchor.x;
        const newDy = origCorner.y + dy - anchor.y;
        let sx = Math.abs(origDx) > 1 ? newDx / origDx : 1;
        let sy = Math.abs(origDy) > 1 ? newDy / origDy : 1;
        if (!e.shiftKey) {
          // Proportional scale by default
          const uniform = (sx + sy) / 2;
          sx = uniform;
          sy = uniform;
        }
        const scalePt = (p: Point): Point => ({
          x: anchor.x + (p.x - anchor.x) * sx,
          y: anchor.y + (p.y - anchor.y) * sy
        });
        q.tl = scalePt(q.tl);
        q.tr = scalePt(q.tr);
        q.br = scalePt(q.br);
        q.bl = scalePt(q.bl);
      } else {
        // Edge stretch (top, bottom, left, right)
        if (activeTransformHandle === 't') {
          q.tl.y += dy; q.tr.y += dy;
        } else if (activeTransformHandle === 'b') {
          q.bl.y += dy; q.br.y += dy;
        } else if (activeTransformHandle === 'l') {
          q.tl.x += dx; q.bl.x += dx;
        } else if (activeTransformHandle === 'r') {
          q.tr.x += dx; q.br.x += dx;
        }
      }
      setTransformQuad(q);
      return;
    }

    // Canvas Crop Mode pointer move
    if (cropMode) {
      if (activeCropHandle && cropDragStart) {
        const dx = pt.x - cropDragStart.pt.x;
        const dy = pt.y - cropDragStart.pt.y;
        const r = { ...cropDragStart.rect };
        const minSize = 64;

        if (activeCropHandle === 'move') {
          r.left += dx;
          r.right += dx;
          r.top += dy;
          r.bottom += dy;
        } else {
          if (activeCropHandle.includes('w')) r.left = Math.min(r.right - minSize, r.left + dx);
          if (activeCropHandle.includes('e')) r.right = Math.max(r.left + minSize, r.right + dx);
          if (activeCropHandle.includes('n')) r.top = Math.min(r.bottom - minSize, r.top + dy);
          if (activeCropHandle.includes('s')) r.bottom = Math.max(r.top + minSize, r.bottom + dy);
        }
        setCropRect(r);
      } else {
        setHoverCropHandle(hitTestCropHandle(pt));
      }
      return;
    }

    // Dragging selected lasso strokes
    if (isDraggingSelection && dragLastPt) {
      const dx = pt.x - dragLastPt.x;
      const dy = pt.y - dragLastPt.y;
      if (selectedStrokeIds.length > 0) {
        moveStrokes(selectedStrokeIds, dx, dy);
      }
      setLassoPoints((prev) => prev.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })));
      setDragLastPt(pt);
      return;
    }

    // Polygonal lasso rubber-band cursor preview
    if ((activeTool === 'polylasso' || activeTool === 'polylassofill' || (activeTool === 'lasso' && e.altKey)) && lassoPoints.length > 0 && !lassoClosed) {
      setLassoCursor(pt);
      return;
    }

    // Rectangle / Ellipse selection drag
    if ((activeTool === 'rectselect' || activeTool === 'ellipseselect') && isDrawing && selectShapeStart) {
      const x1 = selectShapeStart.x;
      const y1 = selectShapeStart.y;
      const x2 = pt.x;
      const y2 = pt.y;
      if (activeTool === 'rectselect') {
        setLassoPoints([
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 }
        ]);
      } else {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const ellipsePts: Point[] = [];
        for (let i = 0; i < 36; i++) {
          const ang = (i / 36) * Math.PI * 2;
          ellipsePts.push({ x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry });
        }
        setLassoPoints(ellipsePts);
      }
      return;
    }

    // Freehand lasso / Lasso Fill drawing
    if ((activeTool === 'lasso' || activeTool === 'lassofill') && isDrawing && !lassoClosed) {
      setLassoPoints((prev) => [...prev, pt]);
      return;
    }

    if (!isDrawing || !draftStroke) return;

    // Use coalesced events for high-polling-rate drawing tablets (200Hz+)
    const nativeEv = e.nativeEvent as PointerEvent;
    const coalesced = typeof nativeEv.getCoalescedEvents === 'function'
      ? nativeEv.getCoalescedEvents()
      : [];
    const eventsToProcess = coalesced.length > 0 ? coalesced : [nativeEv];

    const newPoints = eventsToProcess.map((ev) => getPointFromEvent(ev));
    const lastPt = newPoints[newPoints.length - 1];
    const now = performance.now();
    if (now - penHudTimerRef.current > 120) {
      penHudTimerRef.current = now;
      setPenStatus({ type: e.pointerType || 'mouse', pressure: lastPt.pressure ?? 1 });
    }
    if (brushSmoothing > 0) {
      setStabilizerCursor(lastPt);
    }

    setDraftStroke((prev) => {
      if (!prev) return prev;
      if (prev.tool === 'line' || prev.tool === 'rectangle' || prev.tool === 'ellipse') {
        return {
          ...prev,
          points: [prev.points[0], lastPt]
        };
      } else if (prev.tool !== 'fill') {
        // Hold Shift while drawing -> lock perfectly straight Horizontal or Vertical line!
        if (e.shiftKey && prev.points.length > 0) {
          const origin = prev.points[0];
          const adx = Math.abs(lastPt.x - origin.x);
          const ady = Math.abs(lastPt.y - origin.y);
          const lockedPt: Point =
            adx >= ady
              ? { x: lastPt.x, y: origin.y, pressure: lastPt.pressure }
              : { x: origin.x, y: lastPt.y, pressure: lastPt.pressure };
          return {
            ...prev,
            points: [origin, lockedPt]
          };
        }
        if (brushSmoothing <= 0) {
          const prevLast = prev.points[prev.points.length - 1];
          const filtered = newPoints.filter((np) => {
            if (!prevLast) return true;
            return Math.hypot(np.x - prevLast.x, np.y - prevLast.y) >= 0.6;
          });
          if (filtered.length === 0) return prev;
          return {
            ...prev,
            points: [...prev.points, ...filtered]
          };
        }
        // Photoshop-style Pulled-String / Lazy-Mouse real-time stabilization
        const stringRadius = (brushSmoothing / 100) * (28 / zoom);
        const followFactor = Math.max(0.08, 1 - (brushSmoothing / 100) * 0.88);
        const updated = [...prev.points];
        let currTip = updated[updated.length - 1];

        for (const target of newPoints) {
          const dx = target.x - currTip.x;
          const dy = target.y - currTip.y;
          const dist = Math.hypot(dx, dy);
          if (dist > stringRadius) {
            const nextPt: Point = {
              x: currTip.x + dx * followFactor,
              y: currTip.y + dy * followFactor,
              pressure: (currTip.pressure ?? 1) + ((target.pressure ?? 1) - (currTip.pressure ?? 1)) * 0.45
            };
            updated.push(nextPt);
            currTip = nextPt;
          }
        }
        return {
          ...prev,
          points: updated
        };
      }
      return prev;
    });
  };

  const handlePointerUp = () => {
    if (draggingVpIndex !== null) {
      setDraggingVpIndex(null);
      return;
    }
    if (isRotating) {
      setIsRotating(false);
      return;
    }
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (transformActive) {
      setActiveTransformHandle(null);
      setTransformDragStart(null);
      return;
    }
    if (cropMode) {
      setActiveCropHandle(null);
      setCropDragStart(null);
      return;
    }
    if (isDraggingSelection) {
      setIsDraggingSelection(false);
      setDragLastPt(null);
      return;
    }
    if (activeTool === 'lassofill' && isDrawing) {
      setIsDrawing(false);
      if (lassoPoints.length >= 3) {
        pushRecentColor(activeColor);
        addStroke({
          id: `st-lfill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tool: 'fill',
          artLayer: activeArtLayer,
          swatchId: activeSwatch.id,
          color: activeColor,
          size: 1,
          opacity: brushOpacity,
          smoothing: 0,
          points: lassoPoints.map((p) => ({ x: p.x, y: p.y })),
          filled: true
        });
        captureTimelapseStep();
      }
      setLassoPoints([]);
      setLassoClosed(false);
      return;
    }
    if (
      (activeTool === 'lasso' || activeTool === 'rectselect' || activeTool === 'ellipseselect') &&
      isDrawing &&
      !lassoClosed
    ) {
      setIsDrawing(false);
      setSelectShapeStart(null);
      closeLassoAndSelect(lassoPoints);
      return;
    }
    if (isDrawing && draftStroke) {
      if (draftStroke.tool !== 'eraser') {
        pushRecentColor(draftStroke.color);
      }
      addStroke(draftStroke);
      // If Symmetry Ruler is ON, automatically add mirrored stroke across vertical center!
      if (symmetryMode === 'vertical' && draftStroke.points.length > 0) {
        const mirrored: Stroke = {
          ...draftStroke,
          id: `${draftStroke.id}-sym`,
          points: draftStroke.points.map((p) => ({
            ...p,
            x: canvasWidth - p.x
          }))
        };
        addStroke(mirrored);
      }
      captureTimelapseStep();
      setDraftStroke(null);
      setStabilizerCursor(null);
      setIsDrawing(false);
    }
  };

  const handleDoubleClick = () => {
    if (activeTool === 'polylassofill' && lassoPoints.length >= 3 && !lassoClosed) {
      commitPolyFill(lassoPoints);
    } else if ((activeTool === 'polylasso' || activeTool === 'lasso') && lassoPoints.length >= 3 && !lassoClosed) {
      closeLassoAndSelect(lassoPoints);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(zoom * factor);
  };

  const getCropCursor = (h: CropHandle | null) => {
    if (h === 'nw' || h === 'se') return 'nwse-resize';
    if (h === 'ne' || h === 'sw') return 'nesw-resize';
    if (h === 'n' || h === 's') return 'ns-resize';
    if (h === 'e' || h === 'w') return 'ew-resize';
    if (h === 'move') return 'move';
    return 'default';
  };

  const isEyedropperActive =
    activeTool === 'eyedropper' || (altHeld && activeTool !== 'lasso' && activeTool !== 'zoom');

  const showBrushRing =
    !cropMode &&
    !transformActive &&
    !isEyedropperActive &&
    !dHeld &&
    !spaceHeld &&
    !rHeld &&
    !isPanning &&
    !isRotating &&
    (activeTool === 'brush' || activeTool === 'pencil' || activeTool === 'eraser');

  const brushRingDiameter = Math.max(4, brushSize * zoom);

  const eyedropperCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 22 1-1h3l9-9' stroke='%23000000' stroke-width='3.5'/%3E%3Cpath d='m2 22 1-1h3l9-9'/%3E%3Cpath d='M3 21v-3l9-9' stroke='%23000000' stroke-width='3.5'/%3E%3Cpath d='M3 21v-3l9-9'/%3E%3Cpath d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z' fill='%233a86ff' stroke='%23000000' stroke-width='1.5'/%3E%3C/svg%3E") 2 22, crosshair`;

  const getTransformCursor = (h: TransformHandle | null) => {
    if (h === 'tl' || h === 'br') return 'nwse-resize';
    if (h === 'tr' || h === 'bl') return 'nesw-resize';
    if (h === 't' || h === 'b') return 'ns-resize';
    if (h === 'l' || h === 'r') return 'ew-resize';
    if (h === 'move') return 'move';
    if (h === 'rot') return 'grab';
    return 'default';
  };

  const cursorStyle = cropMode
    ? getCropCursor(activeCropHandle || hoverCropHandle)
    : transformActive
    ? getTransformCursor(activeTransformHandle || hoverTransformHandle)
    : dHeld
    ? 'pointer'
    : isEyedropperActive
    ? eyedropperCursor
    : rHeld
    ? isRotating
      ? 'grabbing'
      : 'grab'
    : activeTool === 'hand' || spaceHeld
    ? isPanning
      ? 'grabbing'
      : 'grab'
    : activeTool === 'zoom'
    ? 'zoom-in'
    : showBrushRing
    ? 'none'
    : 'crosshair';

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#1b1b1b'
      }}
    >
      {/* High-Fidelity Rec.709 Luminance Grayscale SVG Filter (Ctrl+Y) */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <filter id="nexo-rec709-grayscale">
          <feColorMatrix
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0
                    0.2126 0.7152 0.0722 0 0
                    0.2126 0.7152 0.0722 0 0
                    0      0      0      1 0"
          />
        </filter>
      </svg>

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          handlePointerUp();
          if (brushRingRef.current) brushRingRef.current.style.opacity = '0';
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          if (transformActive) {
            e.preventDefault();
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              setTransformMenuPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
          }
        }}
        onWheel={handleWheel}
        style={{
          display: 'block',
          cursor: cursorStyle,
          touchAction: 'none',
          filter: grayscaleMode ? 'url(#nexo-rec709-grayscale)' : 'none'
        }}
      />

      {/* Live Eyedropper Color Swatch Preview next to cursor (GPU-composited) */}
      {isEyedropperActive && eyedropperPreviewHex && (
        <div
          ref={eyedropperSwatchRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            background: 'rgba(25, 25, 25, 0.92)',
            border: '1px solid #555',
            borderRadius: 4,
            padding: '3px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            pointerEvents: 'none',
            willChange: 'transform',
            zIndex: 70,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              background: eyedropperPreviewHex,
              border: '1.5px solid #fff'
            }}
          />
          <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#eee' }}>
            {eyedropperPreviewHex.toUpperCase()}
          </span>
        </div>
      )}

      {/* True Circular Brush Outline Cursor (GPU-composited, ZERO React re-renders!) */}
      {showBrushRing && (
        <div
          ref={brushRingRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            opacity: 0,
            width: brushRingDiameter,
            height: brushRingDiameter,
            borderRadius: '50%',
            border: '1px solid rgba(0, 0, 0, 0.85)',
            boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.75)',
            pointerEvents: 'none',
            willChange: 'transform',
            zIndex: 60
          }}
        />
      )}

      {/* Floating Free Transform / Perspective Action Bar (Ctrl+T) */}
      {transformActive && transformQuad && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(34, 34, 34, 0.96)',
            border: '1px solid #4a4a4a',
            borderRadius: 5,
            padding: '5px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
            zIndex: 55
          }}
        >
          <span style={{ fontSize: 11, color: '#bbb', fontWeight: 600, marginRight: 4 }}>Transform:</span>
          <button
            className={`icon-btn ${transformSubMode === 'scale' ? 'active' : ''}`}
            onClick={() => setTransformSubMode('scale')}
          >
            Escala / Girar
          </button>
          <button
            className={`icon-btn ${transformSubMode === 'perspective' ? 'active' : ''}`}
            onClick={() => setTransformSubMode('perspective')}
          >
            Perspectiva
          </button>
          <div className="tb-sep" />
          <button
            className="icon-btn"
            onClick={() =>
              setTransformQuad((q) => (q ? { tl: q.tr, tr: q.tl, br: q.bl, bl: q.br } : q))
            }
          >
            Flip H
          </button>
          <button
            className="icon-btn"
            onClick={() =>
              setTransformQuad((q) => (q ? { tl: q.bl, tr: q.br, br: q.tr, bl: q.tl } : q))
            }
          >
            Flip V
          </button>
          <button
            className="icon-btn"
            onClick={() => rotateQuadBy(90)}
            title="Girar 90° Horário"
          >
            90° ↻
          </button>
          <div className="tb-sep" />
          <button className="icon-btn active" onClick={commitTransform} style={{ fontWeight: 600 }}>
            Aplicar (Enter)
          </button>
          <button className="icon-btn" onClick={cancelTransform}>
            Cancelar (Esc)
          </button>
        </div>
      )}

      {/* Right-click Context Menu inside Free Transform */}
      {transformActive && transformMenuPos && (
        <div
          className="dropdown-menu"
          style={{ left: transformMenuPos.x, top: transformMenuPos.y, zIndex: 90 }}
        >
          <button className="dropdown-item" onClick={() => { setTransformSubMode('scale'); setTransformMenuPos(null); }}>
            <span>Escala / Girar</span>
          </button>
          <button className="dropdown-item" onClick={() => { setTransformSubMode('perspective'); setTransformMenuPos(null); }}>
            <span>Distorcer / Perspectiva (ou segure Ctrl)</span>
          </button>
          <div className="dropdown-sep" />
          <button className="dropdown-item" onClick={() => { rotateQuadBy(90); setTransformMenuPos(null); }}>
            <span>Girar 90° Horário</span>
          </button>
          <button className="dropdown-item" onClick={() => { rotateQuadBy(-90); setTransformMenuPos(null); }}>
            <span>Girar 90° Anti-horário</span>
          </button>
          <button className="dropdown-item" onClick={() => { rotateQuadBy(180); setTransformMenuPos(null); }}>
            <span>Girar 180°</span>
          </button>
          <div className="dropdown-sep" />
          <button
            className="dropdown-item"
            onClick={() => {
              setTransformQuad((q) => (q ? { tl: q.tr, tr: q.tl, br: q.bl, bl: q.br } : q));
              setTransformMenuPos(null);
            }}
          >
            <span>Virar Horizontalmente</span>
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              setTransformQuad((q) => (q ? { tl: q.bl, tr: q.br, br: q.tr, bl: q.tl } : q));
              setTransformMenuPos(null);
            }}
          >
            <span>Virar Verticalmente</span>
          </button>
        </div>
      )}

      {/* Floating Selection Action Bar (Ctrl+A or Lasso) */}
      {lassoClosed && lassoPoints.length >= 3 && !cropMode && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(34, 34, 34, 0.95)',
            border: '1px solid #4a4a4a',
            borderRadius: 5,
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
            zIndex: 40
          }}
        >
          <span style={{ fontSize: 11, color: '#999', marginRight: 4 }}>Seleção ativa:</span>
          <button
            className="icon-btn active"
            onClick={fillSelection}
            title="Preencher seleção com a cor atual (Alt+Backspace)"
          >
            Preencher
          </button>
          <button
            className="icon-btn"
            onClick={deleteSelection}
            style={{ background: '#5c2626', borderColor: '#8c3b3b', color: '#ffdada' }}
            title="Apagar conteúdo da seleção na layer ativa (Delete)"
          >
            Apagar (Del)
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setLassoPoints([]);
              setLassoClosed(false);
              setSelectedStrokeIds([]);
            }}
            title="Desfazer seleção (Ctrl+D)"
          >
            Desselecionar
          </button>
        </div>
      )}

      {/* Floating Clip-Studio-Style Canvas Resize Dialog (C key) */}
      {cropMode && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            width: 265,
            background: '#2b2b2b',
            border: '1px solid #4a4a4a',
            borderRadius: 5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.65)',
            zIndex: 50,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: 28,
              background: '#202020',
              borderBottom: '1px solid #3a3a3a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#e5e5e5'
            }}
          >
            <span>Alterar tamanho da tela</span>
            <span style={{ fontSize: 10, color: '#888' }}>C</span>
          </div>
          <div style={{ padding: 10, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span>Largura:</span>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  value={Math.round(cropRect.right - cropRect.left)}
                  onChange={(e) => {
                    const w = Math.max(64, Number(e.target.value) || 64);
                    setCropRect((r) => ({ ...r, right: r.left + w }));
                  }}
                  className="harmony-input"
                  style={{ width: 72 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span>Altura:</span>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  value={Math.round(cropRect.bottom - cropRect.top)}
                  onChange={(e) => {
                    const h = Math.max(64, Number(e.target.value) || 64);
                    setCropRect((r) => ({ ...r, bottom: r.top + h }));
                  }}
                  className="harmony-input"
                  style={{ width: 72 }}
                />
              </label>
              <div style={{ fontSize: 10, color: '#888' }}>Unidade: px • Arraste as alças</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 72 }}>
              <button
                className="icon-btn active"
                onClick={() => {
                  const w = Math.max(64, Math.round(cropRect.right - cropRect.left));
                  const h = Math.max(64, Math.round(cropRect.bottom - cropRect.top));
                  resizeCanvas(Math.round(cropRect.left), Math.round(cropRect.top), w, h);
                }}
                style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
              >
                OK
              </button>
              <button
                className="icon-btn"
                onClick={() => setCropMode(false)}
                style={{ width: '100%', justifyContent: 'center', background: '#383838' }}
              >
                Cancelar
              </button>
              <button
                className="icon-btn"
                onClick={() => setCropRect({ left: 0, top: 0, right: canvasWidth, bottom: canvasHeight })}
                style={{ width: '100%', justifyContent: 'center', background: '#383838' }}
              >
                Redefinir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Picked Layer Toast (Hold D + Click) */}
      {pickedLayerToast && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(12, pickedLayerToast.x + 14),
            top: Math.max(12, pickedLayerToast.y - 26),
            background: 'rgba(24, 34, 52, 0.94)',
            border: '1px solid #3a86ff',
            borderRadius: 5,
            padding: '3px 9px',
            fontSize: 11,
            fontWeight: 600,
            color: '#e0f2fe',
            pointerEvents: 'none',
            zIndex: 60,
            boxShadow: '0 4px 12px rgba(0,0,0,0.45)'
          }}
        >
          Layer: {pickedLayerToast.name}
        </div>
      )}

      {/* Bottom-left Zoom / Frame / Pen Pressure HUD */}
      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 8,
          background: 'rgba(30, 30, 30, 0.85)',
          border: '1px solid #3c3c3c',
          borderRadius: 3,
          padding: '2px 8px',
          fontSize: 11,
          color: '#bbb',
          display: 'flex',
          gap: 10
        }}
      >
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>Frame: {currentFrame}</span>
        {dHeld && <span style={{ color: '#38bdf8', fontWeight: 700 }}>PEGAR LAYER (D + Clique)</span>}
        {flipX && <span style={{ color: '#f59e0b', fontWeight: 700 }}>FLIPPED (F1)</span>}
        {grayscaleMode && <span style={{ color: '#e5e5e5', fontWeight: 700 }}>GRAYSCALE (Ctrl+Y)</span>}
        <span style={{ color: penStatus.type === 'pen' ? '#4ade80' : '#888' }}>
          {penStatus.type === 'pen'
            ? `Pen: ${Math.round(penStatus.pressure * 100)}%`
            : 'Mouse'}
        </span>
      </div>
    </div>
  );
};
