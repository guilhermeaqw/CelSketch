import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { ArtLayerId, Point, Stroke } from '../types/harmony';
import { renderStroke, getEffectiveFrameStrokes, performFloodFill } from '../utils/canvasRenderer';

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

  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [rHeld, setRHeld] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateOrigin, setRotateOrigin] = useState<{ angle: number; baseRot: number }>({ angle: 0, baseRot: 0 });
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);
  const [stabilizerCursor, setStabilizerCursor] = useState<Point | null>(null);
  const [penStatus, setPenStatus] = useState<{ type: string; pressure: number }>({
    type: 'mouse',
    pressure: 1
  });

  // Lasso & Polygonal Lasso state
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [lassoClosed, setLassoClosed] = useState(false);
  const [lassoCursor, setLassoCursor] = useState<Point | null>(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
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
  type TransformHandle = 'tl' | 'tr' | 'br' | 'bl' | 'rot' | 'move';
  const [transformActive, setTransformActive] = useState(false);
  const [transformSubMode, setTransformSubMode] = useState<'scale' | 'perspective'>('scale');
  const [transformOrigStrokes, setTransformOrigStrokes] = useState<Stroke[]>([]);
  const [transformOrigBounds, setTransformOrigBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const [transformQuad, setTransformQuad] = useState<Quad | null>(null);
  const [activeTransformHandle, setActiveTransformHandle] = useState<TransformHandle | null>(null);
  const [transformDragStart, setTransformDragStart] = useState<{ pt: Point; quad: Quad } | null>(null);

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
    swatches,
    activeSwatchId,
    currentFrame,
    zoom,
    panX,
    panY,
    rotation,
    flipX,
    grayscaleMode,
    cropMode,
    showGrid,
    showCameraFrame,
    lightTable,
    onionSkin,
    onionPrev,
    onionNext,
    setZoom,
    setPan,
    setRotation,
    setArtLayer,
    setCropMode,
    resizeCanvas,
    addStroke,
    moveStrokes,
    replaceStrokes,
    deleteStrokes
  } = useHarmonyStore();

  // Initialize crop rectangle whenever Crop Mode (C) opens
  useEffect(() => {
    if (transformActive) {
      setActiveTransformHandle(null);
      setTransformDragStart(null);
      return;
    }
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
    if (selectedStrokeIds.length > 0) {
      deleteStrokes(selectedStrokeIds);
    }
    setSelectedStrokeIds([]);
  }, [lassoClosed, lassoPoints, selectedStrokeIds, deleteStrokes]);

  const mapStrokesToQuad = useCallback(
    (origStrokes: Stroke[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, quad: Quad): Stroke[] => {
      const bw = Math.max(1, bounds.maxX - bounds.minX);
      const bh = Math.max(1, bounds.maxY - bounds.minY);
      return origStrokes.map((st) => ({
        ...st,
        points: st.points.map((pt) => {
          const u = (pt.x - bounds.minX) / bw;
          const v = (pt.y - bounds.minY) / bh;
          const x =
            (1 - u) * (1 - v) * quad.tl.x +
            u * (1 - v) * quad.tr.x +
            u * v * quad.br.x +
            (1 - u) * v * quad.bl.x;
          const y =
            (1 - u) * (1 - v) * quad.tl.y +
            u * (1 - v) * quad.tr.y +
            u * v * quad.br.y +
            (1 - u) * v * quad.bl.y;
          return { ...pt, x, y };
        })
      }));
    },
    []
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
      for (const p of st.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
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
  }, [layers, activeLayerId, currentFrame, selectedStrokeIds]);

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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [transformActive, openTransform, commitTransform, cancelTransform]);

  // Selection keyboard controls: Ctrl+A (Select All), Alt+Backspace (Fill), Delete/Backspace, Enter, Esc/Ctrl+D
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
        closeLassoAndSelect(lassoPoints);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canvasWidth,
    canvasHeight,
    lassoPoints,
    lassoClosed,
    closeLassoAndSelect,
    fillSelection,
    deleteSelection
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
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        setIsPanning(false);
      } else if (e.key.toLowerCase() === 'r') {
        setRHeld(false);
        setIsRotating(false);
      }
    };
    const onBlur = () => {
      setSpaceHeld(false);
      setIsPanning(false);
      setRHeld(false);
      setIsRotating(false);
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

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Outer Harmony dark workspace backdrop
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Transform into camera stage space
    ctx.translate(rect.width / 2 + panX, rect.height / 2 + panY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipX ? -zoom : zoom, zoom);
    ctx.translate(-canvasWidth / 2, -canvasHeight / 2);

    // Stage Paper / Camera Background
    ctx.fillStyle = '#f8f8f8';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 24 / zoom;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.shadowBlur = 0;

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

    // Offscreen layer compositor so eraser only erases within its layer
    const layerBuffer = document.createElement('canvas');
    layerBuffer.width = canvasWidth;
    layerBuffer.height = canvasHeight;
    const lctx = layerBuffer.getContext('2d');

    // Render all visible layers bottom-to-top, drawing Onion Skin right beneath the active layer
    // (so Background / lower layers NEVER cover up the Onion Skin!)
    if (lctx) {
      const ordered = [...layers].reverse();
      for (const layer of ordered) {
        const isCurrent = layer.id === activeLayerId;

        if (onionSkin && layer.visible && !layer.holdFrames) {
          // Previous frames (reddish tint)
          for (let offset = onionPrev; offset >= 1; offset--) {
            const f = currentFrame - offset;
            if (f < 1) continue;
            const prevStrokes = layer.frames[f];
            if (!prevStrokes || prevStrokes.length === 0) continue;
            lctx.clearRect(0, 0, canvasWidth, canvasHeight);
            for (const st of prevStrokes) {
              renderStroke(lctx, st, '#e04848', 1);
            }
            ctx.save();
            ctx.globalAlpha = 0.45 / offset;
            ctx.drawImage(layerBuffer, 0, 0);
            ctx.restore();
          }
          // Next frames (greenish tint)
          for (let offset = 1; offset <= onionNext; offset++) {
            const f = currentFrame + offset;
            const nextStrokes = layer.frames[f];
            if (!nextStrokes || nextStrokes.length === 0) continue;
            lctx.clearRect(0, 0, canvasWidth, canvasHeight);
            for (const st of nextStrokes) {
              renderStroke(lctx, st, '#32b85c', 1);
            }
            ctx.save();
            ctx.globalAlpha = 0.45 / offset;
            ctx.drawImage(layerBuffer, 0, 0);
            ctx.restore();
          }
        }

        if (!layer.visible) continue;
        const strokes = getEffectiveFrameStrokes(layer, currentFrame);

        if (strokes.length === 0 && !(isCurrent && draftStroke)) continue;

        lctx.clearRect(0, 0, canvasWidth, canvasHeight);
        const transformingIds =
          isCurrent && transformActive ? new Set(transformOrigStrokes.map((s) => s.id)) : null;

        for (const st of strokes) {
          if (transformingIds && transformingIds.has(st.id)) continue;
          renderStroke(lctx, st);
        }
        if (isCurrent && transformActive && transformOrigBounds && transformQuad) {
          const previewStrokes = mapStrokesToQuad(transformOrigStrokes, transformOrigBounds, transformQuad);
          for (const st of previewStrokes) {
            renderStroke(lctx, st);
          }
        }
        if (isCurrent && draftStroke) {
          renderStroke(lctx, draftStroke);
        }

        ctx.save();
        const lightTableDim = lightTable && !isCurrent ? 0.3 : 1;
        ctx.globalAlpha = layer.opacity * lightTableDim;
        ctx.drawImage(layerBuffer, 0, 0);
        ctx.restore();
      }
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
      if (!lassoClosed && (activeTool === 'polylasso' || lassoPoints.length < 30)) {
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

    // Free Transform / Perspective Bounding Quad (Ctrl+T)
    if (transformActive && transformQuad) {
      const { tl, tr, br, bl } = transformQuad;
      const topMidX = (tl.x + tr.x) / 2;
      const topMidY = (tl.y + tr.y) / 2;
      const rotHandleX = topMidX;
      const rotHandleY = topMidY - 28 / zoom;

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

      // Rotation stem & circle handle
      ctx.beginPath();
      ctx.moveTo(topMidX, topMidY);
      ctx.lineTo(rotHandleX, rotHandleY);
      ctx.stroke();

      ctx.fillStyle = '#3a86ff';
      ctx.beginPath();
      ctx.arc(rotHandleX, rotHandleY, 5.5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();

      // 4 Corner Handles
      const hs = 9 / zoom;
      for (const corner of [tl, tr, br, bl]) {
        ctx.fillStyle = transformSubMode === 'perspective' ? '#f59e0b' : '#ffffff';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.5 / zoom;
        ctx.fillRect(corner.x - hs / 2, corner.y - hs / 2, hs, hs);
        ctx.strokeRect(corner.x - hs / 2, corner.y - hs / 2, hs, hs);
      }
      ctx.restore();
    }

    // Canvas Crop / Resize Overlay (C key — Clip Studio style)
    if (transformActive) {
      setActiveTransformHandle(null);
      setTransformDragStart(null);
      return;
    }
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
    mapStrokesToQuad
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

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);

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

    // Free Transform Mode (Ctrl+T) pointer down
    if (transformActive && transformQuad) {
      const tol = 16 / zoom;
      const { tl, tr, br, bl } = transformQuad;
      const rotX = (tl.x + tr.x) / 2;
      const rotY = (tl.y + tr.y) / 2 - 28 / zoom;

      let hit: TransformHandle | null = null;
      if (Math.hypot(pt.x - rotX, pt.y - rotY) <= tol) hit = 'rot';
      else if (Math.hypot(pt.x - tl.x, pt.y - tl.y) <= tol) hit = 'tl';
      else if (Math.hypot(pt.x - tr.x, pt.y - tr.y) <= tol) hit = 'tr';
      else if (Math.hypot(pt.x - br.x, pt.y - br.y) <= tol) hit = 'br';
      else if (Math.hypot(pt.x - bl.x, pt.y - bl.y) <= tol) hit = 'bl';
      else if (isPointInPolygon(pt, [tl, tr, br, bl])) hit = 'move';

      if (hit) {
        setActiveTransformHandle(hit);
        setTransformDragStart({ pt, quad: JSON.parse(JSON.stringify(transformQuad)) });
      }
      return;
    }

    // Canvas Crop Mode pointer down
    if (transformActive) {
      setActiveTransformHandle(null);
      setTransformDragStart(null);
      return;
    }
    if (cropMode) {
      const handle = hitTestCropHandle(pt);
      if (handle) {
        setActiveCropHandle(handle);
        setCropDragStart({ pt, rect: { ...cropRect } });
      }
      return;
    }

    // Lasso & Polygonal Lasso handling (Photoshop style)
    if (activeTool === 'lasso' || activeTool === 'polylasso') {
      // If we already have a closed selection and user clicks inside it -> drag to move strokes!
      if (lassoClosed && lassoPoints.length >= 3 && isPointInPolygon(pt, lassoPoints)) {
        setIsDraggingSelection(true);
        setDragLastPt(pt);
        return;
      }

      // Polygonal mode: either dedicated polylasso OR normal lasso with Alt held!
      const isPolyMode = activeTool === 'polylasso' || e.altKey;
      if (isPolyMode) {
        if (lassoClosed) {
          setLassoClosed(false);
          setSelectedStrokeIds([]);
          setLassoPoints([pt]);
          setLassoCursor(pt);
          return;
        }
        // Close if clicking near first point (within 12 screen px)
        if (lassoPoints.length >= 3) {
          const first = lassoPoints[0];
          const dist = Math.hypot(pt.x - first.x, pt.y - first.y) * zoom;
          if (dist < 14) {
            closeLassoAndSelect(lassoPoints);
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
      const fillUrl = performFloodFill(
        layers,
        currentFrame,
        canvasWidth,
        canvasHeight,
        pt.x,
        pt.y,
        activeColor,
        42
      );
      if (fillUrl) {
        addStroke({
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
        });
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
        size: effectiveTool === 'eraser' ? brushSize * 2 : brushSize,
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
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setMousePos({ x: e.clientX - containerRect.left, y: e.clientY - containerRect.top });
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

    // Free Transform Mode (Ctrl+T) pointer move
    if (transformActive && activeTransformHandle && transformDragStart) {
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
        const delta = a1 - a0;
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
      } else if (transformSubMode === 'perspective') {
        // Free 4-corner perspective warp!
        q[activeTransformHandle].x += dx;
        q[activeTransformHandle].y += dy;
      } else {
        // Rectangular scale
        if (activeTransformHandle === 'tl') {
          q.tl.x += dx; q.tl.y += dy;
          q.tr.y += dy; q.bl.x += dx;
        } else if (activeTransformHandle === 'tr') {
          q.tr.x += dx; q.tr.y += dy;
          q.tl.y += dy; q.br.x += dx;
        } else if (activeTransformHandle === 'br') {
          q.br.x += dx; q.br.y += dy;
          q.bl.y += dy; q.tr.x += dx;
        } else if (activeTransformHandle === 'bl') {
          q.bl.x += dx; q.bl.y += dy;
          q.br.y += dy; q.tl.x += dx;
        }
      }
      setTransformQuad(q);
      return;
    }

    // Canvas Crop Mode pointer move
    if (transformActive) {
      setActiveTransformHandle(null);
      setTransformDragStart(null);
      return;
    }
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
    if ((activeTool === 'polylasso' || (activeTool === 'lasso' && e.altKey)) && lassoPoints.length > 0 && !lassoClosed) {
      setLassoCursor(pt);
      return;
    }

    // Freehand lasso drawing
    if (activeTool === 'lasso' && isDrawing && !lassoClosed) {
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
    setPenStatus({ type: e.pointerType || 'mouse', pressure: lastPt.pressure ?? 1 });
    setStabilizerCursor(lastPt);

    setDraftStroke((prev) => {
      if (!prev) return prev;
      if (prev.tool === 'line' || prev.tool === 'rectangle' || prev.tool === 'ellipse') {
        return {
          ...prev,
          points: [prev.points[0], lastPt]
        };
      } else if (prev.tool !== 'fill') {
        if (brushSmoothing <= 0) {
          return {
            ...prev,
            points: [...prev.points, ...newPoints]
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
    if (activeTool === 'lasso' && isDrawing && !lassoClosed) {
      setIsDrawing(false);
      closeLassoAndSelect(lassoPoints);
      return;
    }
    if (isDrawing && draftStroke) {
      addStroke(draftStroke);
      setDraftStroke(null);
      setStabilizerCursor(null);
      setIsDrawing(false);
    }
  };

  const handleDoubleClick = () => {
    if ((activeTool === 'polylasso' || activeTool === 'lasso') && lassoPoints.length >= 3 && !lassoClosed) {
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

  const showBrushRing =
    !cropMode &&
    !transformActive &&
    !spaceHeld &&
    !rHeld &&
    !isPanning &&
    !isRotating &&
    (activeTool === 'brush' || activeTool === 'pencil' || activeTool === 'eraser');

  const brushRingDiameter = Math.max(
    4,
    (activeTool === 'eraser' ? brushSize * 2 : brushSize) * zoom
  );

  const cursorStyle = cropMode
    ? getCropCursor(activeCropHandle || hoverCropHandle)
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
          setMousePos(null);
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{
          display: 'block',
          cursor: cursorStyle,
          touchAction: 'none',
          filter: grayscaleMode ? 'url(#nexo-rec709-grayscale)' : 'none'
        }}
      />

      {/* True Circular Brush Outline Cursor (No '+' crosshair) */}
      {showBrushRing && mousePos && (
        <div
          style={{
            position: 'absolute',
            left: mousePos.x - brushRingDiameter / 2,
            top: mousePos.y - brushRingDiameter / 2,
            width: brushRingDiameter,
            height: brushRingDiameter,
            borderRadius: '50%',
            border: '1px solid rgba(0, 0, 0, 0.85)',
            boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.75)',
            pointerEvents: 'none',
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
          <div className="tb-sep" />
          <button className="icon-btn active" onClick={commitTransform} style={{ fontWeight: 600 }}>
            Aplicar (Enter)
          </button>
          <button className="icon-btn" onClick={cancelTransform}>
            Cancelar (Esc)
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
