import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { ArtLayerId, Point, Stroke } from '../types/harmony';
import {
  renderStroke,
  getEffectiveFrameStrokes,
  isLayerEffectivelyVisible,
  getLayerEffectiveOpacity,
  getInterpolatedLayerTransform,
  performFloodFill,
  performMagicWandPolygon,
  renderFrameToCanvas,
  detectIsWeakHardware,
  setGlobalEcoMode
} from '../utils/canvasRenderer';
import { applyHslToCanvas, isNoopHsv } from '../utils/hsvUtils';
import { applyLevelsToCanvas, isNoopLevels } from '../utils/levelsUtils';
import { applyBlurToCanvas, isNoopBlur } from '../utils/blurUtils';
import { applyPostProcessToCanvas, hasActivePostProcess } from '../utils/postProcessUtils';
import {
  combineSelections,
  getSelectionBounds,
  isPointInSelection,
  traceSelectionPath
} from '../utils/selectionUtils';
import {
  applyCameraTransformToCtx,
  cameraViewToArtwork,
  getActiveCameraLayer,
  getCameraFrameCorners,
  getInterpolatedCamera,
  sampleCameraMotionPath
} from '../utils/cameraUtils';

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const t = (target.type || 'text').toLowerCase();
    return t !== 'range' && t !== 'checkbox' && t !== 'radio' && t !== 'button' && t !== 'color';
  }
  return false;
}

function isDarkHexColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2) || '00', 16);
  const g = parseInt(clean.substring(2, 4) || '00', 16);
  const b = parseInt(clean.substring(4, 6) || '00', 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 110;
}

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
  const liquifyModifiedRef = useRef<boolean>(false);
  const transformSavedLassoRef = useRef<Point[][] | null>(null);
  const transformSavedLassoInvertedRef = useRef<boolean>(false);
  const selectionOpModeRef = useRef<'replace' | 'add' | 'subtract'>('replace');
  const clipGroupCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const postProcessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eyedropperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eyedropperKeyRef = useRef<string>('');
  const eyedropperLayersRef = useRef<typeof layers | null>(null);
  const [viewportTick, setViewportTick] = useState(0);

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
  // Zero-re-render refs for live pen strokes (coalesced to 1 requestAnimationFrame per display refresh!)
  const draftStrokeRef = useRef<Stroke | null>(null);
  const stabilizerCursorRef = useRef<Point | null>(null);
  const drawStageRef = useRef<(() => void) | null>(null);
  const liveRafRef = useRef<number | null>(null);
  const scheduleLivePaint = useCallback(() => {
    if (liveRafRef.current !== null) return;
    liveRafRef.current = window.requestAnimationFrame(() => {
      liveRafRef.current = null;
      drawStageRef.current?.();
    });
  }, []);
  useEffect(() => {
    return () => {
      if (liveRafRef.current !== null) window.cancelAnimationFrame(liveRafRef.current);
      if (pickedToastTimerRef.current !== null) window.clearTimeout(pickedToastTimerRef.current);
      layerBitmapCacheRef.current.clear();
      layerBufferRef.current = null;
      hsvPreviewCanvasRef.current = null;
      clipGroupCanvasRef.current = null;
      postProcessCanvasRef.current = null;
      eyedropperCanvasRef.current = null;
    };
  }, []);

  const shiftLineAxisRef = useRef<'h' | 'v' | null>(null);
  const shiftLineOriginRef = useRef<Point | null>(null);
  const [textDraft, setTextDraft] = useState<{ canvasX: number; canvasY: number; screenX: number; screenY: number; value: string } | null>(null);
  const [liquifyPreview, setLiquifyPreview] = useState<Stroke[] | null>(null);
  const liquifyLastPtRef = useRef<Point | null>(null);
  const [dHeld, setDHeld] = useState(false);
  const [pickedLayerToast, setPickedLayerToast] = useState<{ name: string; x: number; y: number } | null>(null);
  const pickedToastTimerRef = useRef<number | null>(null);
  const [penStatus, setPenStatus] = useState<{ type: string; pressure: number }>({
    type: 'mouse',
    pressure: 1
  });

  // Lasso & Polygonal Lasso state (supports multi-contour Shift=Add & Alt=Subtract!)
  const [selectionPolys, setSelectionPolys] = useState<Point[][]>([]);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [lassoClosed, setLassoClosed] = useState(false);
  const [lassoInverted, setLassoInverted] = useState(false);
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
  const [transformCutEraseMask, setTransformCutEraseMask] = useState<Stroke | null>(null);
  const [transformOrigBounds, setTransformOrigBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const [transformQuad, setTransformQuad] = useState<Quad | null>(null);
  const [transformQuadHistory, setTransformQuadHistory] = useState<Quad[]>([]);
  const [transformQuadRedo, setTransformQuadRedo] = useState<Quad[]>([]);
  const [activeTransformHandle, setActiveTransformHandle] = useState<TransformHandle | null>(null);
  const [hoverTransformHandle, setHoverTransformHandle] = useState<TransformHandle | null>(null);
  const [transformDragStart, setTransformDragStart] = useState<{ pt: Point; quad: Quad } | null>(null);
  const [transformMenuPos, setTransformMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Interactive 2D Camera direct-manipulation drag state (Pan / Corner Zoom / Top Rotate)
  const cameraDragRef = useRef<{
    layerId: string;
    mode: 'move' | 'zoom' | 'rotate';
    startPt: Point;
    origX: number;
    origY: number;
    origZoom: number;
    origRot: number;
    startDist: number;
    startAngle: number;
  } | null>(null);

  // Granular shallow selector: ignores unrelated store changes (AutoSave clock, recentColors, timelineZoom, undoStack, etc.)
  const {
    canvasWidth,
    canvasHeight,
    layers,
    activeLayerId,
    activeTool,
    activeBrushPreset,
    activeArtLayer,
    activeColor,
    secondaryColor,
    gradientMode,
    gradientToTransparent,
    brushSize,
    brushMinSize,
    usePressure,
    brushOpacity,
    brushSmoothing,
    eraserSize,
    eraserMinSize,
    eraserOpacity,
    eraserPreset,
    textFontFamily,
    textFontSize,
    textBold,
    textItalic,
    shapeFilled,
    bucketReference,
    bucketTolerance,
    bucketExpand,
    bucketCloseGap,
    bucketBehind,
    liquifyMode,
    liquifySize,
    liquifyStrength,
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
    levelsPreview,
    blurPreview,
    postProcess,
    cropMode,
    showGrid,
    perspectiveMode,
    symmetryMode,
    showCameraFrame,
    cameraViewMode,
    cameraGuides,
    totalFrames,
    lightTable,
    onionSkin,
    onionPrev,
    onionNext,
    activeSceneId,
    timelapseRecording,
    performanceMode,
    invertSelectionTrigger
  } = useHarmonyStore(
    useShallow((s) => ({
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      activeTool: s.activeTool,
      activeBrushPreset: s.activeBrushPreset,
      activeArtLayer: s.activeArtLayer,
      activeColor: s.activeColor,
      secondaryColor: s.secondaryColor,
      gradientMode: s.gradientMode,
      gradientToTransparent: s.gradientToTransparent,
      brushSize: s.brushSize,
      brushMinSize: s.brushMinSize,
      usePressure: s.usePressure,
      brushOpacity: s.brushOpacity,
      brushSmoothing: s.brushSmoothing,
      eraserSize: s.eraserSize,
      eraserMinSize: s.eraserMinSize,
      eraserOpacity: s.eraserOpacity,
      eraserPreset: s.eraserPreset,
      textFontFamily: s.textFontFamily,
      textFontSize: s.textFontSize,
      textBold: s.textBold,
      textItalic: s.textItalic,
      shapeFilled: s.shapeFilled,
      bucketReference: s.bucketReference,
      bucketTolerance: s.bucketTolerance,
      bucketExpand: s.bucketExpand,
      bucketCloseGap: s.bucketCloseGap,
      bucketBehind: s.bucketBehind,
      liquifyMode: s.liquifyMode,
      liquifySize: s.liquifySize,
      liquifyStrength: s.liquifyStrength,
      swatches: s.swatches,
      activeSwatchId: s.activeSwatchId,
      currentFrame: s.currentFrame,
      zoom: s.zoom,
      panX: s.panX,
      panY: s.panY,
      rotation: s.rotation,
      flipX: s.flipX,
      grayscaleMode: s.grayscaleMode,
      hsvPreview: s.hsvPreview,
      levelsPreview: s.levelsPreview,
      blurPreview: s.blurPreview,
      postProcess: s.postProcess,
      cropMode: s.cropMode,
      showGrid: s.showGrid,
      perspectiveMode: s.perspectiveMode,
      symmetryMode: s.symmetryMode,
      showCameraFrame: s.showCameraFrame,
      cameraViewMode: s.cameraViewMode,
      cameraGuides: s.cameraGuides,
      totalFrames: s.totalFrames,
      lightTable: s.lightTable,
      onionSkin: s.onionSkin,
      onionPrev: s.onionPrev,
      onionNext: s.onionNext,
      activeSceneId: s.activeSceneId,
      timelapseRecording: s.timelapseRecording,
      performanceMode: s.performanceMode,
      invertSelectionTrigger: s.invertSelectionTrigger
    }))
  );

  // Actions are stable function references — read once via getState()
  const {
    setZoom,
    setPan,
    setRotation,
    setActiveColor,
    pushRecentColor,
    setArtLayer,
    setCropMode,
    resizeCanvas,
    addStroke,
    addStrokesBatch,
    pushUndoSnapshot,
    moveStrokes,
    replaceStrokes,
    deleteStrokes,
    setActiveLayer,
    setClipboardStrokes,
    setActiveSelectionPoly,
    pushTimelapseFrame,
    setCameraKeyframe,
    setCameraViewMode
  } = useHarmonyStore.getState();

  // Clear per-layer bitmap cache when switching scenes to avoid retaining old scene bitmaps in GPU/RAM
  useEffect(() => {
    layerBitmapCacheRef.current.clear();
  }, [activeSceneId]);

  // Repaint stage cleanly whenever window or DockablePanel splitters resize the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setViewportTick((t) => t + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset in-progress drawing states cleanly if the user switches tool mid-drag
  useEffect(() => {
    if (isDrawing) {
      setIsDrawing(false);
      draftStrokeRef.current = null;
      stabilizerCursorRef.current = null;
      setLiquifyPreview(null);
      liquifyLastPtRef.current = null;
      liquifyModifiedRef.current = false;
      setSelectShapeStart(null);
    }
    if (activeTool !== 'text' && textDraft) {
      setTextDraft(null);
    }
  }, [activeTool]);

  useEffect(() => {
    if (textDraft) setTextDraft(null);
  }, [activeLayerId, currentFrame]);

  const isEcoMode =
    performanceMode === 'eco' || (performanceMode === 'auto' && detectIsWeakHardware());

  useEffect(() => {
    setGlobalEcoMode(isEcoMode);
  }, [isEcoMode]);

  // Sync active closed selection polygons + inverted flag to store so Ctrl+U (HsvModal) & UI buttons stay in sync!
  useEffect(() => {
    const hasClosed = lassoClosed && selectionPolys.length > 0;
    setActiveSelectionPoly(hasClosed ? selectionPolys[0] : null, hasClosed ? lassoInverted : false, hasClosed ? selectionPolys : null);
  }, [lassoClosed, selectionPolys, lassoInverted, setActiveSelectionPoly]);

  // Respond to Invert Selection button / Ctrl+Shift+I shortcut
  useEffect(() => {
    if (invertSelectionTrigger === 0) return;
    if (lassoClosed && selectionPolys.length > 0) {
      setLassoInverted((v) => !v);
    }
  }, [invertSelectionTrigger]);

  const sceneStepCounterRef = useRef<Record<string, number>>({});
  const sceneStepInitPromiseRef = useRef<Record<string, Promise<number>>>({});
  const hsvPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hsvPreviewKeyRef = useRef<string>('');
  const hsvPreviewStrokesRef = useRef<Stroke[] | null>(null);

  // Capture a lightweight timelapse snapshot whenever a stroke is committed while recording
  const captureTimelapseStep = useCallback(() => {
    if (!timelapseRecording) return;
    window.setTimeout(async () => {
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
          const key = `${s.timelapseRootDir}::${safeScene}`;
          if (sceneStepCounterRef.current[key] === undefined) {
            if (!sceneStepInitPromiseRef.current[key]) {
              sceneStepInitPromiseRef.current[key] = window.harmonyAPI.getNextStepNumber
                ? window.harmonyAPI.getNextStepNumber(s.timelapseRootDir, safeScene).catch(() => 1)
                : Promise.resolve(1);
            }
            const startNum = await sceneStepInitPromiseRef.current[key];
            if (sceneStepCounterRef.current[key] === undefined) {
              sceneStepCounterRef.current[key] = Math.max(0, startNum - 1);
            }
          }
          const nextNum = (sceneStepCounterRef.current[key] || 0) + 1;
          sceneStepCounterRef.current[key] = nextNum;
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
    (poly: Point[], inverted = false, opMode: 'replace' | 'add' | 'subtract' = 'replace') => {
      if (poly.length < 3) {
        if (opMode === 'replace') {
          setSelectionPolys([]);
          setLassoPoints([]);
          setLassoClosed(false);
          setLassoInverted(false);
          setSelectedStrokeIds([]);
        } else {
          // Aborted tiny drag while adding/subtracting -> keep existing selection intact!
          setLassoPoints([]);
          setLassoCursor(null);
        }
        return;
      }

      const combined = combineSelections(
        lassoClosed ? selectionPolys : [],
        lassoInverted,
        poly,
        inverted,
        opMode,
        canvasWidth,
        canvasHeight
      );

      if (combined.polys.length === 0) {
        setSelectionPolys([]);
        setLassoPoints([]);
        setLassoClosed(false);
        setLassoInverted(false);
        setLassoCursor(null);
        setSelectedStrokeIds([]);
        return;
      }

      const activeLayer = layers.find((l) => l.id === activeLayerId);
      const strokes = activeLayer ? getEffectiveFrameStrokes(activeLayer, currentFrame) : [];
      const bounds = getSelectionBounds(combined.polys, combined.inverted, canvasWidth, canvasHeight);
      const pMinX = bounds ? bounds.minX : 0;
      const pMinY = bounds ? bounds.minY : 0;
      const pMaxX = bounds ? bounds.maxX : canvasWidth;
      const pMaxY = bounds ? bounds.maxY : canvasHeight;

      const hits = strokes
        .filter((st) => {
          if (st.tool === 'image') {
            const ix = st.imageX ?? 0;
            const iy = st.imageY ?? 0;
            const iw = st.imageW ?? canvasWidth;
            const ih = st.imageH ?? canvasHeight;
            const samples: Point[] = st.imageQuad
              ? [
                  st.imageQuad.tl,
                  st.imageQuad.tr,
                  st.imageQuad.br,
                  st.imageQuad.bl,
                  {
                    x: (st.imageQuad.tl.x + st.imageQuad.tr.x + st.imageQuad.br.x + st.imageQuad.bl.x) / 4,
                    y: (st.imageQuad.tl.y + st.imageQuad.tr.y + st.imageQuad.br.y + st.imageQuad.bl.y) / 4
                  }
                ]
              : [
                  { x: ix, y: iy },
                  { x: ix + iw, y: iy },
                  { x: ix + iw, y: iy + ih },
                  { x: ix, y: iy + ih },
                  { x: ix + iw / 2, y: iy + ih / 2 }
                ];
            if (samples.some((p) => isPointInSelection(p, combined.polys, combined.inverted))) return true;
            return !combined.inverted && pMaxX >= ix && pMinX <= ix + iw && pMaxY >= iy && pMinY <= iy + ih;
          }
          if (st.tool === 'text' && st.points.length >= 1) {
            const tx = st.points[0].x;
            const ty = st.points[0].y;
            const fs = st.fontSize || 48;
            const lines = (st.text || '').split(/\r?\n/);
            const maxChars = Math.max(1, ...lines.map((l) => l.length));
            const tw = maxChars * fs * 0.6;
            const th = lines.length * fs * 1.2;
            return isPointInSelection({ x: tx + tw / 2, y: ty + th / 2 }, combined.polys, combined.inverted);
          }
          if ((st.tool === 'rectangle' || st.tool === 'ellipse' || st.tool === 'line') && st.points.length >= 2) {
            const a = st.points[0];
            const b = st.points[st.points.length - 1];
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            return (
              isPointInSelection(a, combined.polys, combined.inverted) ||
              isPointInSelection(b, combined.polys, combined.inverted) ||
              isPointInSelection(mid, combined.polys, combined.inverted)
            );
          }
          return st.points.some((p) => isPointInSelection(p, combined.polys, combined.inverted));
        })
        .map((st) => st.id);

      setSelectionPolys(combined.polys);
      setLassoPoints([]);
      setLassoClosed(true);
      setLassoInverted(combined.inverted);
      setLassoCursor(null);
      setSelectedStrokeIds(hits);
    },
    [lassoClosed, selectionPolys, lassoInverted, layers, activeLayerId, currentFrame, canvasWidth, canvasHeight]
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
    if (!lassoClosed || selectionPolys.length === 0) return;
    const newStroke: Stroke = {
      id: `st-fill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: 'fill',
      artLayer: activeArtLayer,
      swatchId: activeSwatch.id,
      color: activeColor,
      size: 1,
      opacity: brushOpacity,
      smoothing: 0,
      points: selectionPolys[0].map((p) => ({ x: p.x, y: p.y })),
      extraPolys: selectionPolys.length > 1 ? selectionPolys.slice(1).map((poly) => poly.map((p) => ({ x: p.x, y: p.y }))) : undefined,
      filled: true,
      inverted: lassoInverted
    };
    addStroke(newStroke);
  }, [lassoClosed, selectionPolys, lassoInverted, activeArtLayer, activeSwatch.id, activeColor, brushOpacity, addStroke]);

  const deleteSelection = useCallback(() => {
    if (!lassoClosed || selectionPolys.length === 0) return;
    // Exact polygon erase mask: erases pixels inside selection (supports multi-contour, holes & inverted!)
    const eraseMask: Stroke = {
      id: `st-erase-poly-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: 'erase_poly',
      artLayer: activeArtLayer,
      swatchId: activeSwatch.id,
      color: '#000000',
      size: 1,
      opacity: 1,
      smoothing: 0,
      points: selectionPolys[0].map((p) => ({ x: p.x, y: p.y })),
      extraPolys: selectionPolys.length > 1 ? selectionPolys.slice(1).map((poly) => poly.map((p) => ({ x: p.x, y: p.y }))) : undefined,
      filled: true,
      inverted: lassoInverted
    };
    addStroke(eraseMask);
    setSelectedStrokeIds([]);
  }, [lassoClosed, selectionPolys, lassoInverted, activeArtLayer, activeSwatch.id, addStroke]);

  const mapStrokesToQuad = useCallback(
    (origStrokes: Stroke[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, quad: Quad): Stroke[] => {
      const bw = Math.max(1, bounds.maxX - bounds.minX);
      const bh = Math.max(1, bounds.maxY - bounds.minY);
      const curW = (Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y) + Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y)) / 2;
      const curH = (Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y) + Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y)) / 2;
      const avgScale = Math.max(0.05, Math.min(20, (curW / bw + curH / bh) / 2));

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
          const srcQuad = st.imageQuad || {
            tl: { x: st.imageX ?? 0, y: st.imageY ?? 0 },
            tr: { x: (st.imageX ?? 0) + (st.imageW ?? canvasWidth), y: st.imageY ?? 0 },
            br: { x: (st.imageX ?? 0) + (st.imageW ?? canvasWidth), y: (st.imageY ?? 0) + (st.imageH ?? canvasHeight) },
            bl: { x: st.imageX ?? 0, y: (st.imageY ?? 0) + (st.imageH ?? canvasHeight) }
          };
          const newQuad = {
            tl: mapPt(srcQuad.tl.x, srcQuad.tl.y),
            tr: mapPt(srcQuad.tr.x, srcQuad.tr.y),
            br: mapPt(srcQuad.br.x, srcQuad.br.y),
            bl: mapPt(srcQuad.bl.x, srcQuad.bl.y)
          };
          const xs = [newQuad.tl.x, newQuad.tr.x, newQuad.br.x, newQuad.bl.x];
          const ys = [newQuad.tl.y, newQuad.tr.y, newQuad.br.y, newQuad.bl.y];
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          return {
            ...st,
            imageX: minX,
            imageY: minY,
            imageW: Math.max(2, Math.max(...xs) - minX),
            imageH: Math.max(2, Math.max(...ys) - minY),
            imageQuad: newQuad
          };
        }
        if (st.tool === 'text') {
          return {
            ...st,
            fontSize: Math.max(8, Math.min(400, Math.round((st.fontSize || 48) * avgScale))),
            points: st.points.map((pt) => {
              const m = mapPt(pt.x, pt.y);
              return { ...pt, x: m.x, y: m.y };
            })
          };
        }
        return {
          ...st,
          size: Math.max(0.5, Math.min(400, st.size * avgScale)),
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
    if (!activeLayer || activeLayer.locked || activeLayer.type === 'folder') return;
    const frameStrokes = getEffectiveFrameStrokes(activeLayer, currentFrame);
    if (frameStrokes.length === 0) return;

    // Never allow Crop Mode and Free Transform to overlap
    if (cropMode) setCropMode(false);

    // If a Lasso / Rect / Ellipse / Magic Wand selection is active -> cut exact pixels inside (supports multi-contour, holes & inverted!)
    if (lassoClosed && selectionPolys.length > 0) {
      const bounds = getSelectionBounds(selectionPolys, lassoInverted, canvasWidth, canvasHeight);
      if (!bounds) return;
      const { minX, minY, maxX, maxY } = bounds;
      if (maxX <= 0 || maxY <= 0 || minX >= canvasWidth || minY >= canvasHeight) return;
      const bx = Math.max(0, Math.floor(minX));
      const by = Math.max(0, Math.floor(minY));
      const ex = Math.min(canvasWidth, Math.ceil(maxX));
      const ey = Math.min(canvasHeight, Math.ceil(maxY));
      const bw = ex - bx;
      const bh = ey - by;
      if (bw < 2 || bh < 2) return;

      const full = document.createElement('canvas');
      full.width = canvasWidth;
      full.height = canvasHeight;
      const fctx = full.getContext('2d');
      if (!fctx) return;
      for (const st of frameStrokes) renderStroke(fctx, st);

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = bw;
      cropCanvas.height = bh;
      const cctx = cropCanvas.getContext('2d');
      if (!cctx) return;
      traceSelectionPath(cctx, selectionPolys, lassoInverted, canvasWidth, canvasHeight, bx, by);
      cctx.clip('evenodd');
      cctx.drawImage(full, bx, by, bw, bh, 0, 0, bw, bh);

      const floatingStroke: Stroke = {
        id: `st-tf-sel-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
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
        imageH: bh,
        imageQuad: {
          tl: { x: bx, y: by },
          tr: { x: bx + bw, y: by },
          br: { x: bx + bw, y: by + bh },
          bl: { x: bx, y: by + bh }
        }
      };
      const eraseMask: Stroke = {
        id: `st-tf-cut-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        tool: 'erase_poly',
        artLayer: activeArtLayer,
        swatchId: activeSwatch.id,
        color: '#000000',
        size: 1,
        opacity: 1,
        smoothing: 0,
        points: selectionPolys[0].map((p) => ({ x: p.x, y: p.y })),
        extraPolys: selectionPolys.length > 1 ? selectionPolys.slice(1).map((poly) => poly.map((p) => ({ x: p.x, y: p.y }))) : undefined,
        filled: true,
        inverted: lassoInverted || undefined
      };

      // Save selection polygons + inverted flag so Esc restores them cleanly!
      transformSavedLassoRef.current = selectionPolys.map((poly) => poly.map((p) => ({ ...p })));
      transformSavedLassoInvertedRef.current = lassoInverted;
      setSelectionPolys([]);
      setLassoPoints([]);
      setLassoClosed(false);
      setLassoInverted(false);
      setLassoCursor(null);
      setSelectedStrokeIds([]);
      setTransformCutEraseMask(eraseMask);
      setTransformOrigStrokes([floatingStroke]);
      setTransformOrigBounds({ minX: bx, minY: by, maxX: bx + bw, maxY: by + bh });
      setTransformQuad({
        tl: { x: bx, y: by },
        tr: { x: bx + bw, y: by },
        br: { x: bx + bw, y: by + bh },
        bl: { x: bx, y: by + bh }
      });
      setTransformQuadHistory([]);
      setTransformQuadRedo([]);
      setTransformSubMode('scale');
      setTransformMenuPos(null);
      setTransformActive(true);
      return;
    }

    // No selection active -> transform all strokes on the current frame!
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const st of frameStrokes) {
      if (st.tool === 'image') {
        if (st.imageQuad) {
          for (const p of [st.imageQuad.tl, st.imageQuad.tr, st.imageQuad.br, st.imageQuad.bl]) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
        } else {
          const ix = st.imageX ?? 0;
          const iy = st.imageY ?? 0;
          const iw = st.imageW ?? canvasWidth;
          const ih = st.imageH ?? canvasHeight;
          if (ix < minX) minX = ix;
          if (iy < minY) minY = iy;
          if (ix + iw > maxX) maxX = ix + iw;
          if (iy + ih > maxY) maxY = iy + ih;
        }
      } else if (st.tool === 'text' && st.points.length >= 1) {
        const tx = st.points[0].x;
        const ty = st.points[0].y;
        const fs = st.fontSize || 48;
        const lines = (st.text || '').split(/\r?\n/);
        const maxChars = Math.max(1, ...lines.map((l) => l.length));
        const tw = Math.max(fs, maxChars * fs * 0.62);
        const th = Math.max(fs, lines.length * fs * 1.2);
        if (tx < minX) minX = tx;
        if (ty < minY) minY = ty;
        if (tx + tw > maxX) maxX = tx + tw;
        if (ty + th > maxY) maxY = ty + th;
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

    transformSavedLassoRef.current = null;
    setTransformCutEraseMask(null);
    setTransformOrigStrokes(
      typeof structuredClone === 'function' ? structuredClone(frameStrokes) : JSON.parse(JSON.stringify(frameStrokes))
    );
    setTransformOrigBounds({ minX, minY, maxX, maxY });
    setTransformQuad({
      tl: { x: minX, y: minY },
      tr: { x: maxX, y: minY },
      br: { x: maxX, y: maxY },
      bl: { x: minX, y: maxY }
    });
    setTransformQuadHistory([]);
    setTransformQuadRedo([]);
    setTransformSubMode('scale');
    setTransformMenuPos(null);
    setTransformActive(true);
  }, [layers, activeLayerId, currentFrame, cropMode, setCropMode, lassoClosed, selectionPolys, lassoInverted, activeArtLayer, activeSwatch.id, canvasWidth, canvasHeight]);

  const commitTransform = useCallback(() => {
    if (!transformActive || !transformOrigBounds || !transformQuad) return;
    const mapped = mapStrokesToQuad(transformOrigStrokes, transformOrigBounds, transformQuad);
    if (transformCutEraseMask) {
      addStrokesBatch([transformCutEraseMask, ...mapped], true, true);
    } else {
      replaceStrokes(mapped);
    }
    transformSavedLassoRef.current = null;
    transformSavedLassoInvertedRef.current = false;
    setTransformActive(false);
    setTransformQuad(null);
    setTransformQuadHistory([]);
    setTransformQuadRedo([]);
    setTransformOrigBounds(null);
    setTransformOrigStrokes([]);
    setTransformCutEraseMask(null);
    setTransformMenuPos(null);
    setActiveTransformHandle(null);
    setTransformDragStart(null);
    captureTimelapseStep();
  }, [transformActive, transformOrigBounds, transformQuad, transformOrigStrokes, transformCutEraseMask, mapStrokesToQuad, addStrokesBatch, replaceStrokes, captureTimelapseStep]);

  const cancelTransform = useCallback(() => {
    if (transformSavedLassoRef.current && transformSavedLassoRef.current.length > 0) {
      setSelectionPolys(transformSavedLassoRef.current);
      setLassoPoints([]);
      setLassoClosed(true);
      setLassoInverted(transformSavedLassoInvertedRef.current);
    }
    transformSavedLassoRef.current = null;
    transformSavedLassoInvertedRef.current = false;
    setTransformActive(false);
    setTransformQuad(null);
    setTransformQuadHistory([]);
    setTransformQuadRedo([]);
    setTransformOrigBounds(null);
    setTransformOrigStrokes([]);
    setTransformCutEraseMask(null);
    setTransformMenuPos(null);
    setActiveTransformHandle(null);
    setTransformDragStart(null);
  }, []);

  // Automatically cancel transform if user switches layer or frame
  useEffect(() => {
    if (transformActive) cancelTransform();
  }, [activeLayerId, currentFrame]);

  const cloneQuad = (q: Quad): Quad => ({
    tl: { ...q.tl },
    tr: { ...q.tr },
    br: { ...q.br },
    bl: { ...q.bl }
  });

  const undoTransformStep = useCallback(() => {
    if (!transformActive || !transformQuad) return;
    if (transformQuadHistory.length === 0) {
      cancelTransform();
      return;
    }
    const prevQuad = transformQuadHistory[transformQuadHistory.length - 1];
    setTransformQuadHistory((h) => h.slice(0, -1));
    setTransformQuadRedo((r) => [...r, cloneQuad(transformQuad)]);
    setTransformQuad(prevQuad);
  }, [transformActive, transformQuad, transformQuadHistory, cancelTransform]);

  const redoTransformStep = useCallback(() => {
    if (!transformActive || !transformQuad || transformQuadRedo.length === 0) return;
    const nextQuad = transformQuadRedo[transformQuadRedo.length - 1];
    setTransformQuadRedo((r) => r.slice(0, -1));
    setTransformQuadHistory((h) => [...h, cloneQuad(transformQuad)]);
    setTransformQuad(nextQuad);
  }, [transformActive, transformQuad, transformQuadRedo]);

  const flipQuadH = useCallback(() => {
    if (!transformQuad) return;
    setTransformQuadHistory((h) => [...h.slice(-29), cloneQuad(transformQuad)]);
    setTransformQuadRedo([]);
    setTransformQuad({ tl: transformQuad.tr, tr: transformQuad.tl, br: transformQuad.bl, bl: transformQuad.br });
  }, [transformQuad]);

  const flipQuadV = useCallback(() => {
    if (!transformQuad) return;
    setTransformQuadHistory((h) => [...h.slice(-29), cloneQuad(transformQuad)]);
    setTransformQuadRedo([]);
    setTransformQuad({ tl: transformQuad.bl, tr: transformQuad.br, br: transformQuad.tr, bl: transformQuad.tl });
  }, [transformQuad]);

  const rotateQuadBy = useCallback(
    (deg: number) => {
      if (!transformQuad) return;
      setTransformQuadHistory((h) => [...h.slice(-29), cloneQuad(transformQuad)]);
      setTransformQuadRedo([]);
      const q = transformQuad;
      const cx = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
      const cy = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const r = (p: Point): Point => ({
        x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
        y: cy + (p.x - cx) * sin + (p.y - cy) * cos
      });
      setTransformQuad({ tl: r(q.tl), tr: r(q.tr), br: r(q.br), bl: r(q.bl) });
    },
    [transformQuad]
  );

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

  // Ctrl+T to open Transform, Ctrl+Z / Ctrl+Shift+Z step undo/redo inside Transform, Enter to commit, Escape to cancel, Arrow keys to nudge
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (transformActive) commitTransform();
        else openTransform();
      } else if (transformActive && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.shiftKey) redoTransformStep();
        else undoTransformStep();
      } else if (transformActive && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        commitTransform();
      } else if (transformActive && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        cancelTransform();
      } else if (
        transformActive &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (transformQuad) {
          setTransformQuadHistory((h) => [...h.slice(-29), cloneQuad(transformQuad)]);
          setTransformQuadRedo([]);
          setTransformQuad({
            tl: { x: transformQuad.tl.x + dx, y: transformQuad.tl.y + dy },
            tr: { x: transformQuad.tr.x + dx, y: transformQuad.tr.y + dy },
            br: { x: transformQuad.br.x + dx, y: transformQuad.br.y + dy },
            bl: { x: transformQuad.bl.x + dx, y: transformQuad.bl.y + dy }
          });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [transformActive, transformQuad, openTransform, commitTransform, cancelTransform, undoTransformStep, redoTransformStep]);

  // Selection keyboard controls: Ctrl+A (Select All), Alt+Backspace (Fill), Delete/Backspace, Enter, Esc/Ctrl+D
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x') && lassoClosed && selectionPolys.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const isCut = e.key.toLowerCase() === 'x';
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (!activeLayer) return;
        const strokes = getEffectiveFrameStrokes(activeLayer, currentFrame);
        if (strokes.length === 0) return;

        const bounds = getSelectionBounds(selectionPolys, lassoInverted, canvasWidth, canvasHeight);
        if (!bounds) return;
        const bx = Math.max(0, Math.floor(bounds.minX));
        const by = Math.max(0, Math.floor(bounds.minY));
        const bw = Math.max(2, Math.min(canvasWidth - bx, Math.ceil(bounds.maxX - bx)));
        const bh = Math.max(2, Math.min(canvasHeight - by, Math.ceil(bounds.maxY - by)));

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
        traceSelectionPath(cctx, selectionPolys, lassoInverted, canvasWidth, canvasHeight, bx, by);
        cctx.clip('evenodd');
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
        closeLassoAndSelect(fullRect, false, 'replace');
        return;
      }

      if (e.altKey && e.key === 'Backspace' && lassoClosed && selectionPolys.length > 0) {
        e.preventDefault();
        fillSelection();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && lassoClosed && selectionPolys.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        deleteSelection();
      } else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd')) {
        if (lassoPoints.length > 0 || selectionPolys.length > 0) {
          e.preventDefault();
          setSelectionPolys([]);
          setLassoPoints([]);
          setLassoClosed(false);
          setLassoInverted(false);
          setLassoCursor(null);
          setSelectedStrokeIds([]);
        }
      } else if (e.key === 'Enter' && lassoPoints.length >= 3) {
        e.preventDefault();
        if (activeTool === 'polylassofill') {
          commitPolyFill(lassoPoints);
        } else {
          closeLassoAndSelect(lassoPoints, false, selectionOpModeRef.current);
          selectionOpModeRef.current = 'replace';
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [
    canvasWidth,
    canvasHeight,
    selectionPolys,
    lassoPoints,
    lassoClosed,
    lassoInverted,
    activeTool,
    commitPolyFill,
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
      if (isTextEditingTarget(e.target)) return;
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
        setEyedropperPreviewHex(null);
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

      let x = (rx / zoom) * (flipX ? -1 : 1) + canvasWidth / 2;
      let y = ry / zoom + canvasHeight / 2;

      // When viewing through the 2D Camera, invert the camera lens transform so drawing/selecting lands exactly under the pen!
      if (cameraViewMode) {
        const camLayer = getActiveCameraLayer(layers);
        if (camLayer) {
          const camState = getInterpolatedCamera(camLayer, currentFrame);
          const mapped = cameraViewToArtwork(x, y, camState, canvasWidth, canvasHeight);
          x = mapped.x;
          y = mapped.y;
        }
      }

      return { x, y };
    },
    [panX, panY, rotation, zoom, flipX, canvasWidth, canvasHeight, cameraViewMode, layers, currentFrame]
  );

  // Main render loop (also exposed via drawStageRef for zero-React-re-render rAF pen painting!)
  useEffect(() => {
    const paintStage = () => {
    const draftStroke = draftStrokeRef.current;
    const stabilizerCursor = stabilizerCursorRef.current;
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
    const activeCamLayer = getActiveCameraLayer(layers);
    const activeCamState = activeCamLayer ? getInterpolatedCamera(activeCamLayer, currentFrame) : null;
    const isThroughCamera = Boolean(cameraViewMode && activeCamLayer && activeCamState);
    const useLivePostProcess = hasActivePostProcess(postProcess);

    if (lctx) {
      let stageCtx: CanvasRenderingContext2D = ctx;
      if (useLivePostProcess) {
        if (!postProcessCanvasRef.current) {
          postProcessCanvasRef.current = document.createElement('canvas');
        }
        const ppCanvas = postProcessCanvasRef.current;
        if (ppCanvas.width !== canvasWidth || ppCanvas.height !== canvasHeight) {
          ppCanvas.width = canvasWidth;
          ppCanvas.height = canvasHeight;
        }
        const ppCtx = ppCanvas.getContext('2d');
        if (ppCtx) {
          ppCtx.setTransform(1, 0, 0, 1, 0, 0);
          ppCtx.clearRect(0, 0, canvasWidth, canvasHeight);
          ppCtx.fillStyle = '#ffffff';
          ppCtx.fillRect(0, 0, canvasWidth, canvasHeight);
          stageCtx = ppCtx;
        }
      }

      stageCtx.save();
      stageCtx.beginPath();
      stageCtx.rect(0, 0, canvasWidth, canvasHeight);
      stageCtx.clip();

      // If "Ver pela Câmera" (Camera View Mode) is ON, apply the exact 2D Camera lens transform!
      if (isThroughCamera && activeCamState) {
        applyCameraTransformToCtx(stageCtx, activeCamState, canvasWidth, canvasHeight);
      }

      const ordered = [...layers].reverse().filter((l) => l.type !== 'camera');
      const renderLayerInto = (
        targetCtx: CanvasRenderingContext2D,
        layer: (typeof ordered)[number],
        compositeOp: GlobalCompositeOperation
      ) => {
        const isCurrent = layer.id === activeLayerId;
        const strokes = getEffectiveFrameStrokes(layer, currentFrame);
        if (strokes.length === 0 && !(isCurrent && draftStroke)) return;

        let sourceCanvas: HTMLCanvasElement;
        if (isCurrent && liquifyPreview) {
          lctx.clearRect(0, 0, canvasWidth, canvasHeight);
          for (const st of liquifyPreview) {
            renderStroke(lctx, st);
          }
          sourceCanvas = layerBuffer;
        } else if (isCurrent && transformActive) {
          lctx.clearRect(0, 0, canvasWidth, canvasHeight);
          const transformingIds = new Set(transformOrigStrokes.map((s) => s.id));
          for (const st of strokes) {
            if (transformingIds.has(st.id)) continue;
            renderStroke(lctx, st);
          }
          if (transformCutEraseMask) {
            renderStroke(lctx, transformCutEraseMask);
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
          if (symmetryMode === 'vertical' && effectiveDraft.points.length > 0) {
            renderStroke(lctx, {
              ...effectiveDraft,
              points: effectiveDraft.points.map((p) => ({ ...p, x: canvasWidth - p.x }))
            });
          }
          sourceCanvas = layerBuffer;
        } else {
          sourceCanvas = getCachedLayerBitmap(`${layer.id}:${currentFrame}:base`, strokes);
        }

        const kf = getInterpolatedLayerTransform(layer, currentFrame);
        const effOpacity = getLayerEffectiveOpacity(layer, layers, currentFrame);
        const lightTableDim = lightTable && !isCurrent ? 0.3 : 1;

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
        const activeHsv = isCurrent && hsvPreview && !isNoopHsv(hsvPreview) ? hsvPreview : null;
        const activeLevels = isCurrent && levelsPreview && !isNoopLevels(levelsPreview) ? levelsPreview : null;
        const activeBlur = isCurrent && blurPreview && !isNoopBlur(blurPreview) ? blurPreview : null;
        const activeColorAdj = activeHsv || activeLevels || activeBlur;
        const adjAllFrames = activeHsv
          ? activeHsv.allFrames
          : activeLevels
            ? activeLevels.allFrames
            : activeBlur
              ? activeBlur.allFrames
              : false;
        const hasSelectionHsv = Boolean(activeColorAdj && !adjAllFrames && lassoClosed && selectionPolys.length > 0);

        let hsvFilteredCanvas: HTMLCanvasElement | null = null;
        if (activeColorAdj) {
          const adjSig = activeHsv
            ? `hsv:${activeHsv.h},${activeHsv.s},${activeHsv.v}`
            : activeLevels
              ? `lvl:${activeLevels.blackPoint},${activeLevels.gamma},${activeLevels.whitePoint},${activeLevels.brightness},${activeLevels.contrast}`
              : `blur:${activeBlur!.mode},${activeBlur!.radius},${activeBlur!.angle},${activeBlur!.direction},${activeBlur!.radialStyle},${activeBlur!.centerX},${activeBlur!.centerY}`;
          const cacheKey = `${layer.id}:${currentFrame}:${canvasWidth}x${canvasHeight}:${adjSig}:${strokes.length}`;
          if (!hsvPreviewCanvasRef.current) {
            hsvPreviewCanvasRef.current = document.createElement('canvas');
          }
          if (hsvPreviewKeyRef.current !== cacheKey || hsvPreviewStrokesRef.current !== strokes || sourceCanvas === layerBuffer) {
            if (activeHsv) {
              applyHslToCanvas(sourceCanvas, hsvPreviewCanvasRef.current, activeHsv);
            } else if (activeLevels) {
              applyLevelsToCanvas(sourceCanvas, hsvPreviewCanvasRef.current, activeLevels);
            } else if (activeBlur) {
              applyBlurToCanvas(sourceCanvas, hsvPreviewCanvasRef.current, activeBlur);
            }
            hsvPreviewKeyRef.current = cacheKey;
            hsvPreviewStrokesRef.current = strokes;
          }
          hsvFilteredCanvas = hsvPreviewCanvasRef.current;
        }

        const clipSelectedRegion = (c: CanvasRenderingContext2D) => {
          traceSelectionPath(c, selectionPolys, lassoInverted, canvasWidth, canvasHeight);
          c.clip('evenodd');
        };
        const clipUnselectedRegion = (c: CanvasRenderingContext2D) => {
          traceSelectionPath(c, selectionPolys, !lassoInverted, canvasWidth, canvasHeight);
          c.clip('evenodd');
        };

        targetCtx.save();
        targetCtx.globalAlpha = effOpacity * lightTableDim;
        targetCtx.globalCompositeOperation = compositeOp;
        if (filters.length > 0) {
          targetCtx.filter = filters.join(' ');
        }
        if (hasSelectionHsv) {
          clipUnselectedRegion(targetCtx);
        }
        targetCtx.translate(canvasWidth / 2 + kf.x, canvasHeight / 2 + kf.y);
        targetCtx.rotate((kf.rotation * Math.PI) / 180);
        targetCtx.scale(kf.scale, kf.scale);
        targetCtx.drawImage(
          activeColorAdj && !hasSelectionHsv && hsvFilteredCanvas ? hsvFilteredCanvas : sourceCanvas,
          -canvasWidth / 2,
          -canvasHeight / 2
        );
        targetCtx.restore();

        if (hasSelectionHsv && hsvFilteredCanvas) {
          targetCtx.save();
          clipSelectedRegion(targetCtx);
          targetCtx.globalAlpha = effOpacity * lightTableDim;
          targetCtx.globalCompositeOperation = compositeOp;
          if (filters.length > 0) {
            targetCtx.filter = filters.join(' ');
          }
          targetCtx.translate(canvasWidth / 2 + kf.x, canvasHeight / 2 + kf.y);
          targetCtx.rotate((kf.rotation * Math.PI) / 180);
          targetCtx.scale(kf.scale, kf.scale);
          targetCtx.drawImage(hsvFilteredCanvas, -canvasWidth / 2, -canvasHeight / 2);
          targetCtx.restore();
        }
      };

      let idx = 0;
      while (idx < ordered.length) {
        const layer = ordered[idx];
        if (!isLayerEffectivelyVisible(layer, layers)) {
          idx++;
          continue;
        }

        if (onionSkin && !layer.holdFrames) {
          // Drawing-aware Onion Skin: step through distinct drawn cels (works cleanly on 2s/3s & celDurations!)
          const drawnFrames = Object.entries(layer.frames)
            .filter(([, st]) => st && st.length > 0)
            .map(([k]) => Number(k))
            .sort((a, b) => a - b);
          let activeCelStart = currentFrame;
          if (layer.frames[currentFrame] === undefined && layer.celDurations) {
            for (const f of drawnFrames) {
              if (f < currentFrame && f + Math.max(1, layer.celDurations[f] || 1) > currentFrame) {
                activeCelStart = f;
              }
            }
          }
          const prevDrawn = drawnFrames.filter((f) => f < activeCelStart);
          const nextDrawn = drawnFrames.filter((f) => f > activeCelStart);

          const prevSlice = prevDrawn.slice(-onionPrev);
          for (let i = 0; i < prevSlice.length; i++) {
            const f = prevSlice[i];
            const stepDist = prevSlice.length - i;
            const prevStrokes = layer.frames[f];
            if (!prevStrokes || prevStrokes.length === 0) continue;
            const bmp = getCachedLayerBitmap(`${layer.id}:${f}:prev`, prevStrokes, '#e04848');
            const okf = getInterpolatedLayerTransform(layer, f);
            stageCtx.save();
            stageCtx.globalAlpha = 0.45 / stepDist;
            stageCtx.translate(canvasWidth / 2 + okf.x, canvasHeight / 2 + okf.y);
            stageCtx.rotate((okf.rotation * Math.PI) / 180);
            stageCtx.scale(okf.scale, okf.scale);
            stageCtx.drawImage(bmp, -canvasWidth / 2, -canvasHeight / 2);
            stageCtx.restore();
          }
          const nextSlice = nextDrawn.slice(0, onionNext);
          for (let i = 0; i < nextSlice.length; i++) {
            const f = nextSlice[i];
            const stepDist = i + 1;
            const nextStrokes = layer.frames[f];
            if (!nextStrokes || nextStrokes.length === 0) continue;
            const bmp = getCachedLayerBitmap(`${layer.id}:${f}:next`, nextStrokes, '#32b85c');
            const okf = getInterpolatedLayerTransform(layer, f);
            stageCtx.save();
            stageCtx.globalAlpha = 0.45 / stepDist;
            stageCtx.translate(canvasWidth / 2 + okf.x, canvasHeight / 2 + okf.y);
            stageCtx.rotate((okf.rotation * Math.PI) / 180);
            stageCtx.scale(okf.scale, okf.scale);
            stageCtx.drawImage(bmp, -canvasWidth / 2, -canvasHeight / 2);
            stageCtx.restore();
          }
        }

        // Collect any consecutive clippingMask layers directly above this base layer (WYSIWYG with export!)
        const clippedChildren: typeof ordered = [];
        let look = idx + 1;
        while (look < ordered.length && ordered[look].clippingMask) {
          if (isLayerEffectivelyVisible(ordered[look], layers)) {
            clippedChildren.push(ordered[look]);
          }
          look++;
        }

        if (clippedChildren.length > 0 && !layer.clippingMask) {
          if (!clipGroupCanvasRef.current) {
            clipGroupCanvasRef.current = document.createElement('canvas');
          }
          const gCanvas = clipGroupCanvasRef.current;
          if (gCanvas.width !== canvasWidth || gCanvas.height !== canvasHeight) {
            gCanvas.width = canvasWidth;
            gCanvas.height = canvasHeight;
          }
          const gctx = gCanvas.getContext('2d');
          if (gctx) {
            gctx.clearRect(0, 0, canvasWidth, canvasHeight);
            renderLayerInto(gctx, layer, 'source-over');
            for (const clipChild of clippedChildren) {
              renderLayerInto(gctx, clipChild, 'source-atop');
            }
            stageCtx.save();
            stageCtx.globalCompositeOperation = layer.blendMode || 'source-over';
            stageCtx.drawImage(gCanvas, 0, 0);
            stageCtx.restore();
          }
          idx = look;
          continue;
        }

        renderLayerInto(stageCtx, layer, layer.blendMode || 'source-over');
        idx++;
      }
      stageCtx.restore();

      if (useLivePostProcess && postProcessCanvasRef.current) {
        applyPostProcessToCanvas(postProcessCanvasRef.current, postProcess);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvasWidth, canvasHeight);
        ctx.clip();
        ctx.drawImage(postProcessCanvasRef.current, 0, 0);
        ctx.restore();
      }
    }

    // Artwork-space overlays (Gradient guide, Symmetry, Perspective, Selection, Stabilizer, Free Transform)
    // Must apply the 2D Camera lens transform too when viewing through the Camera!
    ctx.save();
    if (isThroughCamera && activeCamState) {
      applyCameraTransformToCtx(ctx, activeCamState, canvasWidth, canvasHeight);
    }

    // Live Gradient Tool drag guide line (start -> end handle)
    if (isDrawing && draftStroke && draftStroke.tool === 'gradient' && draftStroke.points.length >= 2) {
      const p0 = draftStroke.points[0];
      const p1 = draftStroke.points[draftStroke.points.length - 1];
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.2 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [pt, col] of [
        [p0, activeColor],
        [p1, gradientToTransparent ? '#ffffff' : secondaryColor]
      ] as [Point, string][]) {
        ctx.fillStyle = col;
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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

    // Lasso Selection Overlay (Photoshop-style marching ants — supports multi-island Shift=Add, Alt=Subtract & inverted!)
    if (lassoClosed && selectionPolys.length > 0) {
      ctx.save();
      traceSelectionPath(ctx, selectionPolys, lassoInverted, canvasWidth, canvasHeight);
      ctx.fillStyle = 'rgba(58, 134, 255, 0.11)';
      ctx.fill('evenodd');

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.stroke();
      ctx.restore();
    }

    // In-progress draft selection contour (shown alongside existing selection when Shift=Add or Alt=Subtract!)
    if (lassoPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      if (lassoCursor) {
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

      const opMode = selectionOpModeRef.current;
      ctx.strokeStyle = opMode === 'add' ? '#4ade80' : opMode === 'subtract' ? '#f87171' : '#ffffff';
      ctx.lineWidth = 1.6 / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.stroke();

      if (activeTool === 'polylasso' || activeTool === 'polylassofill' || lassoPoints.length < 30) {
        ctx.fillStyle = opMode === 'add' ? '#22c55e' : opMode === 'subtract' ? '#ef4444' : '#3a86ff';
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

    // End artwork-space overlays camera transform wrapper
    ctx.restore();

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

    // Interactive 2D Camera Overlay (Stage Mode) OR Cinema Passepartout (Camera View Mode)
    if (activeCamLayer && activeCamState && !cropMode) {
      const isCamSelected = activeLayerId === activeCamLayer.id;
      if (isThroughCamera) {
        // Cinema passepartout dark border outside the camera output frame + subtle safe guides
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.beginPath();
        ctx.rect(-10000, -10000, 20000, 20000);
        ctx.rect(0, 0, canvasWidth, canvasHeight);
        ctx.fill('evenodd');

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(0, 0, canvasWidth, canvasHeight);

        if (cameraGuides) {
          // Rule of Thirds
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.moveTo(canvasWidth / 3, 0);
          ctx.lineTo(canvasWidth / 3, canvasHeight);
          ctx.moveTo((canvasWidth * 2) / 3, 0);
          ctx.lineTo((canvasWidth * 2) / 3, canvasHeight);
          ctx.moveTo(0, canvasHeight / 3);
          ctx.lineTo(canvasWidth, canvasHeight / 3);
          ctx.moveTo(0, (canvasHeight * 2) / 3);
          ctx.lineTo(canvasWidth, (canvasHeight * 2) / 3);
          ctx.stroke();

          // Action Safe (90%) & Title Safe (80%)
          ctx.setLineDash([7 / zoom, 5 / zoom]);
          ctx.strokeStyle = 'rgba(255, 165, 0, 0.35)';
          ctx.strokeRect(canvasWidth * 0.05, canvasHeight * 0.05, canvasWidth * 0.9, canvasHeight * 0.9);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
          ctx.strokeRect(canvasWidth * 0.1, canvasHeight * 0.1, canvasWidth * 0.8, canvasHeight * 0.8);
        }
        ctx.restore();
      } else {
        // Stage / Edit View: draw the animated 2D Camera framing box + Motion Path + Interactive Handles!
        const corners = getCameraFrameCorners(activeCamState, canvasWidth, canvasHeight);
        ctx.save();

        // Subtle darkened surround when Camera layer is selected so framing stands out immediately
        if (isCamSelected) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
          ctx.beginPath();
          ctx.rect(-10000, -10000, 20000, 20000);
          ctx.moveTo(corners.tl.x, corners.tl.y);
          ctx.lineTo(corners.tr.x, corners.tr.y);
          ctx.lineTo(corners.br.x, corners.br.y);
          ctx.lineTo(corners.bl.x, corners.bl.y);
          ctx.closePath();
          ctx.fill('evenodd');
        }

        // Camera Motion Path (trajectory curve + per-frame timing dots + keyframe diamonds — Harmony / After Effects style!)
        const motionPts = sampleCameraMotionPath(activeCamLayer, totalFrames);
        if (motionPts.length >= 2) {
          ctx.save();
          ctx.strokeStyle = isCamSelected ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = (isCamSelected ? 2 : 1.2) / zoom;
          ctx.setLineDash([6 / zoom, 4 / zoom]);
          ctx.beginPath();
          ctx.moveTo(canvasWidth / 2 + motionPts[0].x, canvasHeight / 2 + motionPts[0].y);
          for (let i = 1; i < motionPts.length; i++) {
            ctx.lineTo(canvasWidth / 2 + motionPts[i].x, canvasHeight / 2 + motionPts[i].y);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Per-frame timing dots & keyframe diamonds
          for (const mp of motionPts) {
            const px = canvasWidth / 2 + mp.x;
            const py = canvasHeight / 2 + mp.y;
            if (mp.isKey) {
              const d = (isCamSelected ? 6 : 4.5) / zoom;
              ctx.fillStyle = mp.frame === currentFrame ? '#f59e0b' : '#38bdf8';
              ctx.strokeStyle = '#0f172a';
              ctx.lineWidth = 1.2 / zoom;
              ctx.beginPath();
              ctx.moveTo(px, py - d);
              ctx.lineTo(px + d, py);
              ctx.lineTo(px, py + d);
              ctx.lineTo(px - d, py);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            } else if (isCamSelected) {
              ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
              ctx.beginPath();
              ctx.arc(px, py, 2.2 / zoom, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }

        // Camera Framing Box
        ctx.strokeStyle = isCamSelected ? '#38bdf8' : 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = (isCamSelected ? 2.4 : 1.6) / zoom;
        ctx.beginPath();
        ctx.moveTo(corners.tl.x, corners.tl.y);
        ctx.lineTo(corners.tr.x, corners.tr.y);
        ctx.lineTo(corners.br.x, corners.br.y);
        ctx.lineTo(corners.bl.x, corners.bl.y);
        ctx.closePath();
        ctx.stroke();

        // Internal Guides (Rule of Thirds + Action Safe 90% + Center Crosshair)
        if (cameraGuides) {
          const lerp2 = (a: Point, b: Point, t: number) => ({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
          });
          ctx.strokeStyle = isCamSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.2)';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          for (const t of [1 / 3, 2 / 3]) {
            const topP = lerp2(corners.tl, corners.tr, t);
            const botP = lerp2(corners.bl, corners.br, t);
            ctx.moveTo(topP.x, topP.y);
            ctx.lineTo(botP.x, botP.y);
            const leftP = lerp2(corners.tl, corners.bl, t);
            const rightP = lerp2(corners.tr, corners.br, t);
            ctx.moveTo(leftP.x, leftP.y);
            ctx.lineTo(rightP.x, rightP.y);
          }
          ctx.stroke();

          // Center crosshair
          const ch = 10 / zoom;
          ctx.strokeStyle = '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(corners.center.x - ch, corners.center.y);
          ctx.lineTo(corners.center.x + ch, corners.center.y);
          ctx.moveTo(corners.center.x, corners.center.y - ch);
          ctx.lineTo(corners.center.x, corners.center.y + ch);
          ctx.stroke();
        }

        // Interactive Corner Zoom Handles + Top Rotation Handle when Camera Layer is selected!
        if (isCamSelected) {
          const hs = 9 / zoom;
          for (const hp of [corners.tl, corners.tr, corners.br, corners.bl]) {
            ctx.fillStyle = '#e0f2fe';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.6 / zoom;
            ctx.fillRect(hp.x - hs / 2, hp.y - hs / 2, hs, hs);
            ctx.strokeRect(hp.x - hs / 2, hp.y - hs / 2, hs, hs);
          }
          // Stem + circular rotation handle
          const topMid = { x: (corners.tl.x + corners.tr.x) / 2, y: (corners.tl.y + corners.tr.y) / 2 };
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          ctx.moveTo(topMid.x, topMid.y);
          ctx.lineTo(corners.rotHandle.x, corners.rotHandle.y);
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.strokeStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(corners.rotHandle.x, corners.rotHandle.y, 6.5 / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Compact Camera Label Badge on top-left of camera box
        ctx.save();
        ctx.translate(corners.tl.x, corners.tl.y);
        ctx.rotate((activeCamState.rotation * Math.PI) / 180);
        const labelText = `CAM  ${activeCamState.zoom.toFixed(2)}x${Math.abs(activeCamState.rotation) >= 0.5 ? `  ${activeCamState.rotation.toFixed(0)}°` : ''}`;
        const fontSize = Math.max(10, Math.round(12 / zoom));
        ctx.font = `600 ${fontSize}px 'Segoe UI', sans-serif`;
        const tw = ctx.measureText(labelText).width + 12 / zoom;
        const th = fontSize + 6 / zoom;
        ctx.fillStyle = isCamSelected ? '#0284c7' : 'rgba(2, 132, 199, 0.75)';
        ctx.fillRect(0, -th - 2 / zoom, tw, th);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, 6 / zoom, -th / 2 - 2 / zoom);
        ctx.restore();

        ctx.restore();
      }
    } else if (showCameraFrame) {
      // Static Camera Safe Frame Border when no animated Camera layer exists
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
    };
    drawStageRef.current = paintStage;
    paintStage();
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
    cameraViewMode,
    cameraGuides,
    totalFrames,
    lightTable,
    onionSkin,
    onionPrev,
    onionNext,
    brushSmoothing,
    isDrawing,
    lassoPoints,
    lassoClosed,
    lassoInverted,
    lassoCursor,
    activeTool,
    cropMode,
    cropRect,
    transformActive,
    transformQuad,
    transformSubMode,
    transformOrigStrokes,
    transformCutEraseMask,
    transformOrigBounds,
    mapStrokesToQuad,
    imageTick,
    viewportTick,
    perspectiveMode,
    symmetryMode,
    vanishingPoints,
    hsvPreview,
    levelsPreview,
    blurPreview,
    postProcess,
    isEcoMode,
    liquifyPreview,
    selectionPolys
  ]);

  const getPointFromEvent = useCallback(
    (ev: { clientX: number; clientY: number; pressure?: number; pointerType?: string }): Point => {
      const base = screenToCanvas(ev.clientX, ev.clientY);
      const isPen = ev.pointerType === 'pen';
      let pressure = 1;
      if (usePressure && isPen) {
        // Universal tablet pressure — avoid spiking zero-pressure touch-down/lift-off to 0.5!
        pressure = ev.pressure !== undefined && ev.pressure > 0 ? Math.max(0.02, Math.min(1, ev.pressure)) : 0.05;
      } else if (usePressure && ev.pressure !== undefined && ev.pressure > 0 && ev.pressure !== 0.5 && ev.pressure !== 1) {
        // Fallback for tablet drivers that report pointerType='mouse' or 'touch' with real pressure
        pressure = Math.max(0.02, Math.min(1, ev.pressure));
      }
      return { x: base.x, y: base.y, pressure };
    },
    [screenToCanvas, usePressure]
  );

  const readColorAtClient = useCallback(
    (clientX: number, clientY: number): string | null => {
      const pt = screenToCanvas(clientX, clientY);
      const px = Math.floor(pt.x);
      const py = Math.floor(pt.y);
      if (px < 0 || py < 0 || px >= canvasWidth || py >= canvasHeight) return null;

      // Render clean artwork (no Grid, Onion Skin, Marching Ants, or Guides) into a cached offscreen canvas!
      if (!eyedropperCanvasRef.current) {
        eyedropperCanvasRef.current = document.createElement('canvas');
      }
      const key = `${currentFrame}:${canvasWidth}x${canvasHeight}:${imageTick}`;
      if (eyedropperKeyRef.current !== key || eyedropperLayersRef.current !== layers) {
        renderFrameToCanvas(
          eyedropperCanvasRef.current,
          layers,
          currentFrame,
          canvasWidth,
          canvasHeight,
          '#ffffff',
          false
        );
        eyedropperKeyRef.current = key;
        eyedropperLayersRef.current = layers;
      }
      const ectx = eyedropperCanvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!ectx) return null;
      const data = ectx.getImageData(px, py, 1, 1).data;
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}`;
    },
    [screenToCanvas, layers, currentFrame, canvasWidth, canvasHeight, imageTick]
  );

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
    // Allow middle-click pan, ignore right-click (button 2) and extra buttons so context menus/barrel buttons never draw!
    if (e.button === 1) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
      return;
    }
    if (e.button !== 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    // Hold D + Click -> pick the topmost layer containing pixels under the cursor! (disabled during Transform/Crop)
    if (dHeld && !transformActive && !cropMode) {
      const pt = getPointFromEvent(e);
      pickLayerAtCanvasPoint(pt, e.clientX, e.clientY);
      return;
    }

    // Hold Alt (when not using Selection/Zoom/Transform/Crop tools) or Eyedropper tool -> pick color from canvas!
    const isAltBlockedTool =
      activeTool === 'lasso' ||
      activeTool === 'polylasso' ||
      activeTool === 'polylassofill' ||
      activeTool === 'rectselect' ||
      activeTool === 'ellipseselect' ||
      activeTool === 'magicwand' ||
      activeTool === 'zoom';
    if (!transformActive && !cropMode && ((e.altKey && !isAltBlockedTool) || activeTool === 'eyedropper')) {
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

    if (activeTool === 'hand' || spaceHeld) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
      return;
    }

    if (activeTool === 'zoom') {
      const rect = containerRef.current?.getBoundingClientRect();
      const factor = e.altKey ? 0.8 : 1.25;
      const nextZoom = Math.max(0.1, Math.min(8, zoom * factor));
      if (rect) {
        const mx = e.clientX - (rect.left + rect.width / 2);
        const my = e.clientY - (rect.top + rect.height / 2);
        const ratio = nextZoom / zoom;
        setPan(mx - (mx - panX) * ratio, my - (my - panY) * ratio);
      }
      setZoom(nextZoom);
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

    // Interactive 2D Camera direct manipulation (when Camera layer is active & not in Camera View Mode)
    const activeLayerObj = layers.find((l) => l.id === activeLayerId);
    if (activeLayerObj && activeLayerObj.type === 'camera' && activeLayerObj.visible && !activeLayerObj.locked && !cameraViewMode) {
      const cam = getInterpolatedCamera(activeLayerObj, currentFrame, false);
      const corners = getCameraFrameCorners(cam, canvasWidth, canvasHeight);
      const handleTol = 16 / zoom;

      // 1. Top circular rotation handle
      if (Math.hypot(pt.x - corners.rotHandle.x, pt.y - corners.rotHandle.y) <= handleTol) {
        pushUndoSnapshot();
        cameraDragRef.current = {
          layerId: activeLayerObj.id,
          mode: 'rotate',
          startPt: pt,
          origX: cam.x,
          origY: cam.y,
          origZoom: cam.zoom,
          origRot: cam.rotation,
          startDist: 1,
          startAngle: Math.atan2(pt.y - corners.center.y, pt.x - corners.center.x)
        };
        return;
      }

      // 2. Any of the 4 corner handles -> smooth proportional camera zoom!
      const hitCorner = [corners.tl, corners.tr, corners.br, corners.bl].some(
        (c) => Math.hypot(pt.x - c.x, pt.y - c.y) <= handleTol
      );
      if (hitCorner) {
        pushUndoSnapshot();
        cameraDragRef.current = {
          layerId: activeLayerObj.id,
          mode: 'zoom',
          startPt: pt,
          origX: cam.x,
          origY: cam.y,
          origZoom: cam.zoom,
          origRot: cam.rotation,
          startDist: Math.max(10, Math.hypot(pt.x - corners.center.x, pt.y - corners.center.y)),
          startAngle: 0
        };
        return;
      }

      // 3. Drag anywhere on stage while Camera layer is selected -> pan camera position (X, Y) smoothly!
      pushUndoSnapshot();
      cameraDragRef.current = {
        layerId: activeLayerObj.id,
        mode: 'move',
        startPt: pt,
        origX: cam.x,
        origY: cam.y,
        origZoom: cam.zoom,
        origRot: cam.rotation,
        startDist: 1,
        startAngle: 0
      };
      return;
    }

    // Magic Wand (Varinha Mágica — W) with Shift=Add, Alt=Subtract, Reference, Tolerance, Close Gap, Expand & Exterior Detection!
    if (activeTool === 'magicwand') {
      const opMode: 'replace' | 'add' | 'subtract' = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';
      const wandRes = performMagicWandPolygon(
        layers,
        activeLayerId,
        bucketReference,
        currentFrame,
        canvasWidth,
        canvasHeight,
        pt.x,
        pt.y,
        bucketTolerance,
        bucketExpand,
        bucketCloseGap
      );
      if (wandRes && wandRes.poly.length >= 3) {
        closeLassoAndSelect(wandRes.poly, wandRes.inverted, opMode);
      } else if (opMode === 'replace') {
        setSelectionPolys([]);
        setLassoPoints([]);
        setLassoClosed(false);
        setLassoInverted(false);
        setSelectedStrokeIds([]);
      }
      return;
    }

    // Liquify (Deformar traços ao vivo — J): Empurrar / Inflar / Comprimir
    if (activeTool === 'liquify') {
      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (!activeLayer || activeLayer.locked || activeLayer.type === 'folder') return;
      const strokes = getEffectiveFrameStrokes(activeLayer, currentFrame);
      if (strokes.length === 0) return;
      // Densify freehand stroke segments (>10px) so lines curve smoothly under Liquify (skip shapes/images/text)
      const cloned: Stroke[] = (typeof structuredClone === 'function' ? structuredClone(strokes) : JSON.parse(JSON.stringify(strokes))).map((st: Stroke) => {
        if (
          st.tool === 'image' ||
          st.tool === 'text' ||
          st.tool === 'line' ||
          st.tool === 'rectangle' ||
          st.tool === 'ellipse' ||
          st.points.length < 2
        ) {
          return st;
        }
        const dense: Point[] = [st.points[0]];
        for (let i = 1; i < st.points.length; i++) {
          const a = st.points[i - 1];
          const b = st.points[i];
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          if (dist > 10) {
            const steps = Math.min(24, Math.ceil(dist / 8));
            for (let k = 1; k < steps; k++) {
              const t = k / steps;
              dense.push({
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
                pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t
              });
            }
          }
          dense.push(b);
        }
        return { ...st, points: dense };
      });
      liquifyModifiedRef.current = false;
      setLiquifyPreview(cloned);
      liquifyLastPtRef.current = pt;
      setIsDrawing(true);
      return;
    }

    // Selection tools: Lasso, Polygonal Lasso, Lasso Fill, Polygonal Lasso Fill, Rect Select, Ellipse Select
    // Shift = Add to existing selection; Alt = Subtract from existing selection!
    if (
      activeTool === 'lasso' ||
      activeTool === 'polylasso' ||
      activeTool === 'lassofill' ||
      activeTool === 'polylassofill' ||
      activeTool === 'rectselect' ||
      activeTool === 'ellipseselect'
    ) {
      const isFillTool = activeTool === 'lassofill' || activeTool === 'polylassofill';
      const opMode: 'replace' | 'add' | 'subtract' = isFillTool
        ? 'replace'
        : e.shiftKey
          ? 'add'
          : e.altKey
            ? 'subtract'
            : 'replace';

      // Only drag existing selection when NOT holding Shift (Add) or Alt (Subtract) and NOT mid-poly!
      const inSelectedRegion =
        opMode === 'replace' &&
        lassoClosed &&
        selectionPolys.length > 0 &&
        lassoPoints.length === 0 &&
        isPointInSelection(pt, selectionPolys, lassoInverted);
      if (inSelectedRegion) {
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (activeLayer && !activeLayer.locked && activeLayer.type !== 'folder' && selectedStrokeIds.length > 0) {
          pushUndoSnapshot();
        }
        setIsDraggingSelection(true);
        setDragLastPt(pt);
        return;
      }

      if (activeTool === 'rectselect' || activeTool === 'ellipseselect') {
        selectionOpModeRef.current = opMode;
        if (opMode === 'replace') {
          setSelectionPolys([]);
          setLassoClosed(false);
          setLassoInverted(false);
          setSelectedStrokeIds([]);
        }
        setSelectShapeStart(pt);
        setLassoPoints([pt]);
        setIsDrawing(true);
        return;
      }

      // Polygonal mode: dedicated polylasso or polylassofill
      const isPolyMode = activeTool === 'polylasso' || activeTool === 'polylassofill';
      if (isPolyMode) {
        if (lassoPoints.length === 0) {
          selectionOpModeRef.current = opMode;
          if (opMode === 'replace' && lassoClosed) {
            setSelectionPolys([]);
            setLassoClosed(false);
            setLassoInverted(false);
            setSelectedStrokeIds([]);
          }
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
              closeLassoAndSelect(lassoPoints, false, selectionOpModeRef.current);
              selectionOpModeRef.current = 'replace';
            }
            return;
          }
        }
        setLassoPoints((prev) => [...prev, pt]);
        setLassoCursor(pt);
        return;
      }

      // Freehand Lasso / LassoFill start
      selectionOpModeRef.current = opMode;
      if (opMode === 'replace') {
        setSelectionPolys([]);
        setLassoClosed(false);
        setLassoInverted(false);
        setSelectedStrokeIds([]);
      }
      setLassoPoints([pt]);
      setIsDrawing(true);
      return;
    }

    // Block drawing/painting/text on locked, hidden, camera, or folder layers right on pointer-down!
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer || activeLayer.locked || activeLayer.type === 'folder' || activeLayer.type === 'camera' || !activeLayer.visible) {
      return;
    }

    // Support stylus eraser end (bitmask 32, works when buttons === 32 or 33) automatically
    const isStylusEraser = e.pointerType === 'pen' && (e.buttons & 32) !== 0;
    const effectiveTool = isStylusEraser ? 'eraser' : activeTool;

    // Real Scanline Flood-Fill Paint Bucket with Close Gap & Active Selection clip (G)
    if (effectiveTool === 'paint') {
      pushRecentColor(activeColor);
      const fillRes = performFloodFill(
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
        bucketExpand,
        bucketCloseGap,
        lassoClosed && selectionPolys.length > 0 ? selectionPolys : null,
        lassoInverted
      );
      if (fillRes) {
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
            points: [{ x: fillRes.x, y: fillRes.y }],
            imageDataUrl: fillRes.dataUrl,
            imageX: fillRes.x,
            imageY: fillRes.y,
            imageW: fillRes.w,
            imageH: fillRes.h
          },
          bucketBehind
        );
        captureTimelapseStep();
      }
      return;
    }

    // Text Tool (T): click anywhere on canvas to place a styled live text editor with PC fonts!
    if (effectiveTool === 'text') {
      const rect = containerRef.current?.getBoundingClientRect();
      const sx = rect ? e.clientX - rect.left : e.clientX;
      const sy = rect ? e.clientY - rect.top : e.clientY;
      setTextDraft({ canvasX: pt.x, canvasY: pt.y, screenX: sx, screenY: sy, value: '' });
      return;
    }

    if (
      effectiveTool === 'brush' ||
      effectiveTool === 'pencil' ||
      effectiveTool === 'eraser' ||
      effectiveTool === 'line' ||
      effectiveTool === 'rectangle' ||
      effectiveTool === 'ellipse' ||
      effectiveTool === 'gradient'
    ) {
      const isEr = effectiveTool === 'eraser';
      const hasSelClip = lassoClosed && selectionPolys.length > 0;
      shiftLineAxisRef.current = null;
      shiftLineOriginRef.current = pt;
      const newStroke: Stroke = {
        id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: effectiveTool,
        preset: isEr ? eraserPreset : activeBrushPreset,
        artLayer: activeArtLayer,
        swatchId: activeSwatch.id,
        color: activeColor,
        secondaryColor: effectiveTool === 'gradient' ? secondaryColor : undefined,
        gradientMode: effectiveTool === 'gradient' ? gradientMode : undefined,
        gradientToTransparent: effectiveTool === 'gradient' ? gradientToTransparent : undefined,
        size: isEr ? eraserSize : brushSize,
        // When Pen Pressure is OFF, force minSizeRatio = 1 (100% uniform single-size stroke!)
        minSizeRatio: usePressure ? (isEr ? eraserMinSize : brushMinSize) / 100 : 1,
        opacity: isEr ? eraserOpacity : brushOpacity,
        smoothing: brushSmoothing,
        points: effectiveTool === 'gradient' ? [pt, pt] : [pt],
        clipPolys: hasSelClip ? selectionPolys.map((poly) => poly.map((p) => ({ x: p.x, y: p.y }))) : undefined,
        clipInverted: hasSelClip && lassoInverted ? true : undefined,
        filled: shapeFilled
      };
      draftStrokeRef.current = newStroke;
      stabilizerCursorRef.current = null;
      setIsDrawing(true);
      scheduleLivePaint();
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

    // Live Eyedropper color preview while holding Alt or using Dropper tool (disabled during Selection/Transform/Crop/Zoom!)
    const isAltBlockedTool =
      activeTool === 'lasso' ||
      activeTool === 'polylasso' ||
      activeTool === 'polylassofill' ||
      activeTool === 'rectselect' ||
      activeTool === 'ellipseselect' ||
      activeTool === 'magicwand' ||
      activeTool === 'zoom';
    if (!transformActive && !cropMode && ((altHeld && !isAltBlockedTool) || activeTool === 'eyedropper')) {
      const hex = readColorAtClient(e.clientX, e.clientY);
      if (hex) {
        setEyedropperPreviewHex(hex);
        if (e.buttons === 1) {
          setActiveColor(hex);
        }
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

    // Live Interactive 2D Camera drag (Move / Corner Zoom / Rotate)
    if (cameraDragRef.current) {
      const drag = cameraDragRef.current;
      const pt = getPointFromEvent(e);
      if (drag.mode === 'move') {
        let dx = pt.x - drag.startPt.x;
        let dy = pt.y - drag.startPt.y;
        if (e.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        setCameraKeyframe(drag.layerId, currentFrame, { x: drag.origX + dx, y: drag.origY + dy }, false);
      } else if (drag.mode === 'zoom') {
        const cx = canvasWidth / 2 + drag.origX;
        const cy = canvasHeight / 2 + drag.origY;
        const currDist = Math.max(10, Math.hypot(pt.x - cx, pt.y - cy));
        // Smaller box = higher zoom (zoom in); larger box = lower zoom (zoom out)
        const nextZoom = Math.max(0.25, Math.min(6, drag.origZoom * (drag.startDist / currDist)));
        setCameraKeyframe(drag.layerId, currentFrame, { zoom: nextZoom }, false);
      } else if (drag.mode === 'rotate') {
        const cx = canvasWidth / 2 + drag.origX;
        const cy = canvasHeight / 2 + drag.origY;
        const currAng = Math.atan2(pt.y - cy, pt.x - cx);
        let nextRot = drag.origRot + ((currAng - drag.startAngle) * 180) / Math.PI;
        if (e.shiftKey) nextRot = Math.round(nextRot / 15) * 15;
        setCameraKeyframe(drag.layerId, currentFrame, { rotation: nextRot }, false);
      }
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
        // Hold Shift while moving -> lock strictly to horizontal or vertical axis!
        let mdx = dx;
        let mdy = dy;
        if (e.shiftKey) {
          if (Math.abs(mdx) >= Math.abs(mdy)) mdy = 0;
          else mdx = 0;
        }
        q.tl.x += mdx; q.tl.y += mdy;
        q.tr.x += mdx; q.tr.y += mdy;
        q.br.x += mdx; q.br.y += mdy;
        q.bl.x += mdx; q.bl.y += mdy;
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
        // Local-basis Corner Scale (works cleanly at ANY rotation angle — zero division-by-zero explosion!)
        // Proportional by default; Shift = free stretch; Alt = scale from center
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

        // Compute quad local U and V unit axes
        const uVec = { x: q.tr.x - q.tl.x, y: q.tr.y - q.tl.y };
        const vVec = { x: q.bl.x - q.tl.x, y: q.bl.y - q.tl.y };
        const uLen = Math.hypot(uVec.x, uVec.y) || 1;
        const vLen = Math.hypot(vVec.x, vVec.y) || 1;
        const uHat = { x: uVec.x / uLen, y: uVec.y / uLen };
        const vHat = { x: vVec.x / vLen, y: vVec.y / vLen };

        const origRel = { x: origCorner.x - anchor.x, y: origCorner.y - anchor.y };
        const newRel = { x: origRel.x + dx, y: origRel.y + dy };

        const origU = origRel.x * uHat.x + origRel.y * uHat.y;
        const origV = origRel.x * vHat.x + origRel.y * vHat.y;
        const newU = newRel.x * uHat.x + newRel.y * uHat.y;
        const newV = newRel.x * vHat.x + newRel.y * vHat.y;

        let su = Math.abs(origU) > 1 ? newU / origU : 1;
        let sv = Math.abs(origV) > 1 ? newV / origV : 1;
        if (!e.shiftKey) {
          // Project newRel onto origRel diagonal for silky proportional scaling at any angle!
          const diagLenSq = origRel.x * origRel.x + origRel.y * origRel.y;
          const uniform = diagLenSq > 1 ? (newRel.x * origRel.x + newRel.y * origRel.y) / diagLenSq : 1;
          su = uniform;
          sv = uniform;
        }
        // Clamp away from exact 0 so quad never collapses irreversibly
        if (Math.abs(su) < 0.03) su = su < 0 ? -0.03 : 0.03;
        if (Math.abs(sv) < 0.03) sv = sv < 0 ? -0.03 : 0.03;

        const scalePt = (p: Point): Point => {
          const rx = p.x - anchor.x;
          const ry = p.y - anchor.y;
          const pu = rx * uHat.x + ry * uHat.y;
          const pv = rx * vHat.x + ry * vHat.y;
          return {
            x: anchor.x + uHat.x * (pu * su) + vHat.x * (pv * sv),
            y: anchor.y + uHat.y * (pu * su) + vHat.y * (pv * sv)
          };
        };
        q.tl = scalePt(q.tl);
        q.tr = scalePt(q.tr);
        q.br = scalePt(q.br);
        q.bl = scalePt(q.bl);
      } else {
        // Local-basis Edge Stretch (works cleanly even when box is rotated! Alt = symmetric stretch)
        const uVec = { x: q.tr.x - q.tl.x, y: q.tr.y - q.tl.y };
        const vVec = { x: q.bl.x - q.tl.x, y: q.bl.y - q.tl.y };
        const uLen = Math.hypot(uVec.x, uVec.y) || 1;
        const vLen = Math.hypot(vVec.x, vVec.y) || 1;
        const uHat = { x: uVec.x / uLen, y: uVec.y / uLen };
        const vHat = { x: vVec.x / vLen, y: vVec.y / vLen };
        const projU = dx * uHat.x + dy * uHat.y;
        const projV = dx * vHat.x + dy * vHat.y;
        const du = { x: uHat.x * projU, y: uHat.y * projU };
        const dv = { x: vHat.x * projV, y: vHat.y * projV };

        if (activeTransformHandle === 't') {
          q.tl.x += dv.x; q.tl.y += dv.y;
          q.tr.x += dv.x; q.tr.y += dv.y;
          if (e.altKey) { q.bl.x -= dv.x; q.bl.y -= dv.y; q.br.x -= dv.x; q.br.y -= dv.y; }
        } else if (activeTransformHandle === 'b') {
          q.bl.x += dv.x; q.bl.y += dv.y;
          q.br.x += dv.x; q.br.y += dv.y;
          if (e.altKey) { q.tl.x -= dv.x; q.tl.y -= dv.y; q.tr.x -= dv.x; q.tr.y -= dv.y; }
        } else if (activeTransformHandle === 'l') {
          q.tl.x += du.x; q.tl.y += du.y;
          q.bl.x += du.x; q.bl.y += du.y;
          if (e.altKey) { q.tr.x -= du.x; q.tr.y -= du.y; q.br.x -= du.x; q.br.y -= du.y; }
        } else if (activeTransformHandle === 'r') {
          q.tr.x += du.x; q.tr.y += du.y;
          q.br.x += du.x; q.br.y += du.y;
          if (e.altKey) { q.tl.x -= du.x; q.tl.y -= du.y; q.bl.x -= du.x; q.bl.y -= du.y; }
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
      setSelectionPolys((prev) => prev.map((poly) => poly.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))));
      setDragLastPt(pt);
      return;
    }

    // Polygonal lasso rubber-band cursor preview
    if ((activeTool === 'polylasso' || activeTool === 'polylassofill') && lassoPoints.length > 0) {
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

    // Live Liquify deformation on pointer move
    if (activeTool === 'liquify' && isDrawing && liquifyPreview && liquifyLastPtRef.current) {
      const prevPt = liquifyLastPtRef.current;
      const dx = pt.x - prevPt.x;
      const dy = pt.y - prevPt.y;
      liquifyLastPtRef.current = pt;
      const radius = Math.max(10, liquifySize / 2);
      const rSq = radius * radius;
      const strength = liquifyStrength / 100;

      setLiquifyPreview((curr) => {
        if (!curr) return curr;
        return curr.map((st) => {
          if (st.tool === 'image') return st;
          let changed = false;
          const nextPts = st.points.map((p) => {
            const ox = p.x - pt.x;
            const oy = p.y - pt.y;
            const dSq = ox * ox + oy * oy;
            if (dSq >= rSq) return p;
            changed = true;
            liquifyModifiedRef.current = true;
            const d = Math.sqrt(dSq);
            const falloff = Math.pow(1 - d / radius, 2) * strength;
            if (liquifyMode === 'push') {
              return { ...p, x: p.x + dx * falloff, y: p.y + dy * falloff };
            } else if (liquifyMode === 'expand') {
              const len = Math.max(1, d);
              const push = radius * 0.12 * falloff;
              return { ...p, x: p.x + (ox / len) * push, y: p.y + (oy / len) * push };
            } else {
              // pinch
              const len = Math.max(1, d);
              const pull = Math.min(d * 0.5, radius * 0.12 * falloff);
              return { ...p, x: p.x - (ox / len) * pull, y: p.y - (oy / len) * pull };
            }
          });
          return changed ? { ...st, points: nextPts } : st;
        });
      });
      return;
    }

    // Freehand lasso / Lasso Fill drawing
    if ((activeTool === 'lasso' || activeTool === 'lassofill') && isDrawing && !lassoClosed) {
      setLassoPoints((prev) => [...prev, pt]);
      return;
    }

    const prev = draftStrokeRef.current;
    if (!isDrawing || !prev) return;

    // Use coalesced events for high-polling-rate drawing tablets (200Hz+) — ZERO React setState per pointermove!
    const nativeEv = e.nativeEvent as PointerEvent;
    const coalesced = typeof nativeEv.getCoalescedEvents === 'function'
      ? nativeEv.getCoalescedEvents()
      : [];
    const eventsToProcess = coalesced.length > 0 ? coalesced : [nativeEv];

    const newPoints = eventsToProcess.map((ev) => getPointFromEvent(ev));
    const lastPt = newPoints[newPoints.length - 1];
    const now = performance.now();
    if (now - penHudTimerRef.current > 180) {
      penHudTimerRef.current = now;
      setPenStatus({ type: e.pointerType || 'mouse', pressure: lastPt.pressure ?? 1 });
    }
    if (brushSmoothing > 0) {
      stabilizerCursorRef.current = lastPt;
    }

    if (prev.tool === 'line' || prev.tool === 'rectangle' || prev.tool === 'ellipse' || prev.tool === 'gradient') {
      const p0 = prev.points[0];
      let endPt = lastPt;
      if (e.shiftKey) {
        const dx = lastPt.x - p0.x;
        const dy = lastPt.y - p0.y;
        if (prev.tool === 'line' || prev.tool === 'gradient') {
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          endPt = { ...lastPt, x: p0.x + Math.cos(ang) * dist, y: p0.y + Math.sin(ang) * dist };
        } else {
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          endPt = { ...lastPt, x: p0.x + Math.sign(dx || 1) * side, y: p0.y + Math.sign(dy || 1) * side };
        }
      }
      draftStrokeRef.current = { ...prev, points: [p0, endPt] };
    } else if (prev.tool !== 'fill') {
      // Hold Shift while drawing -> lock perfectly faithful straight Horizontal or Vertical line!
      if (e.shiftKey && prev.points.length > 0) {
        const origin = shiftLineOriginRef.current || prev.points[0];
        const adx = Math.abs(lastPt.x - origin.x);
        const ady = Math.abs(lastPt.y - origin.y);
        if (!shiftLineAxisRef.current && Math.max(adx, ady) >= 3) {
          shiftLineAxisRef.current = adx >= ady ? 'h' : 'v';
        }
        const axis = shiftLineAxisRef.current || (adx >= ady ? 'h' : 'v');
        const endX = axis === 'h' ? lastPt.x : origin.x;
        const endY = axis === 'v' ? lastPt.y : origin.y;
        const steadyPressure = usePressure ? Math.max(0.55, lastPt.pressure ?? 1) : 1;
        const segs = 24;
        const straightPts: Point[] = [];
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          straightPts.push({
            x: origin.x + (endX - origin.x) * t,
            y: origin.y + (endY - origin.y) * t,
            pressure: steadyPressure
          });
        }
        draftStrokeRef.current = { ...prev, smoothing: 0, points: straightPts };
      } else if (brushSmoothing <= 0) {
        if (shiftLineAxisRef.current) {
          shiftLineAxisRef.current = null;
          prev.smoothing = brushSmoothing;
        }
        let prevLast = prev.points[prev.points.length - 1];
        for (const np of newPoints) {
          if (!prevLast || Math.hypot(np.x - prevLast.x, np.y - prevLast.y) >= 0.6) {
            prev.points.push(np);
            prevLast = np;
          }
        }
      } else {
        if (shiftLineAxisRef.current) {
          shiftLineAxisRef.current = null;
          prev.smoothing = brushSmoothing;
        }
        // Smooth continuous Clip Studio / SAI Stabilizer (ZERO dead-zone jump / ZERO sawtooth waves!)
        const sNorm = brushSmoothing / 100;
        const alpha = Math.max(0.06, Math.pow(1 - sNorm, 1.65));
        let currTip = prev.points[prev.points.length - 1];

        for (const target of newPoints) {
          const nx = currTip.x + (target.x - currTip.x) * alpha;
          const ny = currTip.y + (target.y - currTip.y) * alpha;
          const np = (currTip.pressure ?? 1) + ((target.pressure ?? 1) - (currTip.pressure ?? 1)) * 0.35;
          if (Math.hypot(nx - currTip.x, ny - currTip.y) >= 0.75) {
            const nextPt: Point = { x: nx, y: ny, pressure: np };
            prev.points.push(nextPt);
            currTip = nextPt;
          }
        }
      }
    }
    scheduleLivePaint();
  };

  const handlePointerUp = () => {
    if (cameraDragRef.current) {
      cameraDragRef.current = null;
      return;
    }
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
      if (transformDragStart && transformQuad) {
        const s = transformDragStart.quad;
        const moved =
          Math.abs(s.tl.x - transformQuad.tl.x) > 0.2 ||
          Math.abs(s.tl.y - transformQuad.tl.y) > 0.2 ||
          Math.abs(s.tr.x - transformQuad.tr.x) > 0.2 ||
          Math.abs(s.tr.y - transformQuad.tr.y) > 0.2 ||
          Math.abs(s.br.x - transformQuad.br.x) > 0.2 ||
          Math.abs(s.br.y - transformQuad.br.y) > 0.2 ||
          Math.abs(s.bl.x - transformQuad.bl.x) > 0.2 ||
          Math.abs(s.bl.y - transformQuad.bl.y) > 0.2;
        if (moved) {
          setTransformQuadHistory((h) => [...h.slice(-29), cloneQuad(s)]);
          setTransformQuadRedo([]);
        }
      }
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
    if (activeTool === 'liquify' && isDrawing && liquifyPreview) {
      if (liquifyModifiedRef.current) {
        replaceStrokes(liquifyPreview);
        captureTimelapseStep();
      }
      setLiquifyPreview(null);
      liquifyLastPtRef.current = null;
      liquifyModifiedRef.current = false;
      setIsDrawing(false);
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
      isDrawing
    ) {
      setIsDrawing(false);
      setSelectShapeStart(null);
      const opMode = selectionOpModeRef.current;
      selectionOpModeRef.current = 'replace';
      closeLassoAndSelect(lassoPoints, false, opMode);
      return;
    }
    const activeDraft = draftStrokeRef.current;
    if (isDrawing && activeDraft) {
      // Freeze a clean copy before committing to store
      const committed: Stroke = { ...activeDraft, points: [...activeDraft.points] };
      if (committed.tool !== 'eraser') {
        pushRecentColor(committed.color);
      }
      // If Symmetry Ruler is ON, commit original + mirrored stroke in 1 atomic Undo step (skip for full-canvas gradient)!
      if (symmetryMode === 'vertical' && committed.tool !== 'gradient' && committed.points.length > 0) {
        const mirrored: Stroke = {
          ...committed,
          id: `${committed.id}-sym`,
          points: committed.points.map((p) => ({
            ...p,
            x: canvasWidth - p.x
          }))
        };
        addStrokesBatch([committed, mirrored], committed.tool === 'eraser');
      } else {
        addStroke(committed);
      }
      captureTimelapseStep();
      draftStrokeRef.current = null;
      stabilizerCursorRef.current = null;
      setIsDrawing(false);
    }
  };

  // On palm rejection / pointercancel, ABORT in-progress stroke instead of committing partial garbage!
  const handlePointerCancel = () => {
    cameraDragRef.current = null;
    setDraggingVpIndex(null);
    setIsRotating(false);
    setIsPanning(false);
    setActiveTransformHandle(null);
    setTransformDragStart(null);
    setActiveCropHandle(null);
    setCropDragStart(null);
    setIsDraggingSelection(false);
    setDragLastPt(null);
    setLiquifyPreview(null);
    liquifyLastPtRef.current = null;
    liquifyModifiedRef.current = false;
    setSelectShapeStart(null);
    draftStrokeRef.current = null;
    stabilizerCursorRef.current = null;
    setIsDrawing(false);
    scheduleLivePaint();
  };

  const handleDoubleClick = () => {
    if (transformActive) {
      commitTransform();
      return;
    }
    // Remove duplicate trailing point caused by double-click's second pointerdown
    const cleanedPoly =
      lassoPoints.length >= 2 &&
      Math.hypot(
        lassoPoints[lassoPoints.length - 1].x - lassoPoints[lassoPoints.length - 2].x,
        lassoPoints[lassoPoints.length - 1].y - lassoPoints[lassoPoints.length - 2].y
      ) < 2
        ? lassoPoints.slice(0, -1)
        : lassoPoints;
    if (activeTool === 'polylassofill' && cleanedPoly.length >= 3) {
      commitPolyFill(cleanedPoly);
    } else if ((activeTool === 'polylasso' || activeTool === 'lasso') && cleanedPoly.length >= 3) {
      const opMode = selectionOpModeRef.current;
      selectionOpModeRef.current = 'replace';
      closeLassoAndSelect(cleanedPoly, false, opMode);
    }
  };

  // Native non-passive wheel listener for smooth Zoom-to-Cursor (zero Chromium passive warnings!)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useHarmonyStore.getState();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const nextZoom = Math.max(0.1, Math.min(8, s.zoom * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mx = e.clientX - (rect.left + rect.width / 2);
        const my = e.clientY - (rect.top + rect.height / 2);
        const ratio = nextZoom / s.zoom;
        s.setPan(mx - (mx - s.panX) * ratio, my - (my - s.panY) * ratio);
      }
      s.setZoom(nextZoom);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const getCropCursor = (h: CropHandle | null) => {
    if (h === 'nw' || h === 'se') return 'nwse-resize';
    if (h === 'ne' || h === 'sw') return 'nesw-resize';
    if (h === 'n' || h === 's') return 'ns-resize';
    if (h === 'e' || h === 'w') return 'ew-resize';
    if (h === 'move') return 'move';
    return 'default';
  };

  const isEyedropperActive =
    !transformActive &&
    !cropMode &&
    (activeTool === 'eyedropper' ||
      (altHeld &&
        activeTool !== 'lasso' &&
        activeTool !== 'polylasso' &&
        activeTool !== 'polylassofill' &&
        activeTool !== 'zoom'));

  const showBrushRing =
    !cropMode &&
    !transformActive &&
    !isEyedropperActive &&
    !dHeld &&
    !spaceHeld &&
    !rHeld &&
    !isPanning &&
    !isRotating &&
    (activeTool === 'brush' || activeTool === 'pencil' || activeTool === 'eraser' || activeTool === 'liquify');

  const activeCamForCursor = cameraViewMode ? getActiveCameraLayer(layers) : null;
  const activeCamZoomForCursor = activeCamForCursor
    ? Math.max(0.2, Math.min(8, getInterpolatedCamera(activeCamForCursor, currentFrame).zoom || 1))
    : 1;

  const brushRingDiameter = Math.max(
    4,
    (activeTool === 'liquify' ? liquifySize : activeTool === 'eraser' ? eraserSize : brushSize) *
      zoom *
      activeCamZoomForCursor
  );

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
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => {
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
          <button className="icon-btn" onClick={flipQuadH}>
            Flip H
          </button>
          <button className="icon-btn" onClick={flipQuadV}>
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
              flipQuadH();
              setTransformMenuPos(null);
            }}
          >
            <span>Virar Horizontalmente</span>
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              flipQuadV();
              setTransformMenuPos(null);
            }}
          >
            <span>Virar Verticalmente</span>
          </button>
        </div>
      )}

      {/* Floating 2D Camera View Mode Banner (Cinema Preview HUD) */}
      {cameraViewMode && getActiveCameraLayer(layers) && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(12, 26, 40, 0.94)',
            border: '1px solid #0284c7',
            borderRadius: 6,
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
            zIndex: 45,
            fontSize: 11.5,
            color: '#e0f2fe'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
            Visão da Câmera 2D
          </span>
          <span style={{ color: '#7dd3fc', fontFamily: 'monospace' }}>
            Zoom {getInterpolatedCamera(getActiveCameraLayer(layers), currentFrame).zoom.toFixed(2)}x
          </span>
          <button
            className="icon-btn"
            onClick={() => setCameraViewMode(false)}
            style={{
              background: '#0284c7',
              borderColor: '#38bdf8',
              color: '#fff',
              fontSize: 11,
              padding: '2px 8px'
            }}
          >
            Voltar p/ Edição
          </button>
        </div>
      )}

      {/* Floating Selection Action Bar (Ctrl+A or Lasso) */}
      {lassoClosed && selectionPolys.length > 0 && !cropMode && (
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
              setSelectionPolys([]);
              setLassoPoints([]);
              setLassoClosed(false);
              setLassoInverted(false);
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

      {/* Floating Live Text Input Overlay (Text Tool — T) */}
      {textDraft && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(12, Math.min(textDraft.screenX, (containerRef.current?.clientWidth || 800) - 240)),
            top: Math.max(12, Math.min(textDraft.screenY, (containerRef.current?.clientHeight || 600) - 90)),
            zIndex: 85,
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          <textarea
            autoFocus
            rows={2}
            placeholder="Digite seu texto..."
            value={textDraft.value}
            onChange={(e) => setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                setTextDraft(null);
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (textDraft.value.trim()) {
                  addStroke({
                    id: `st-txt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    tool: 'text',
                    artLayer: activeArtLayer,
                    swatchId: activeSwatch.id,
                    color: activeColor,
                    size: 1,
                    opacity: brushOpacity,
                    smoothing: 0,
                    points: [{ x: textDraft.canvasX, y: textDraft.canvasY }],
                    text: textDraft.value,
                    fontFamily: textFontFamily,
                    fontSize: textFontSize,
                    fontBold: textBold,
                    fontItalic: textItalic
                  });
                  pushRecentColor(activeColor);
                  captureTimelapseStep();
                }
                setTextDraft(null);
              }
            }}
            style={{
              minWidth: 200,
              background: isDarkHexColor(activeColor) ? 'rgba(248, 248, 248, 0.92)' : 'rgba(20, 20, 20, 0.88)',
              color: activeColor,
              border: '1.5px dashed #3a86ff',
              borderRadius: 4,
              padding: '4px 8px',
              fontFamily: `"${textFontFamily}", sans-serif`,
              fontSize: Math.max(13, Math.min(48, Math.round(textFontSize * zoom))),
              fontWeight: textBold ? 'bold' : 'normal',
              fontStyle: textItalic ? 'italic' : 'normal',
              outline: 'none',
              resize: 'both'
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="icon-btn active"
              onClick={() => {
                if (textDraft.value.trim()) {
                  addStroke({
                    id: `st-txt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    tool: 'text',
                    artLayer: activeArtLayer,
                    swatchId: activeSwatch.id,
                    color: activeColor,
                    size: 1,
                    opacity: brushOpacity,
                    smoothing: 0,
                    points: [{ x: textDraft.canvasX, y: textDraft.canvasY }],
                    text: textDraft.value,
                    fontFamily: textFontFamily,
                    fontSize: textFontSize,
                    fontBold: textBold,
                    fontItalic: textItalic
                  });
                  pushRecentColor(activeColor);
                  captureTimelapseStep();
                }
                setTextDraft(null);
              }}
              style={{ fontSize: 10.5, height: 22 }}
            >
              OK (Enter)
            </button>
            <button
              className="icon-btn"
              onClick={() => setTextDraft(null)}
              style={{ fontSize: 10.5, height: 22 }}
            >
              Cancelar (Esc)
            </button>
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
