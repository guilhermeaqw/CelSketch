import { create } from 'zustand';
import { buildWarmupLayers } from '../utils/warmupGenerator';
import { adjustHexHsl } from '../utils/hsvUtils';
import { adjustHexLevels, isNoopLevels } from '../utils/levelsUtils';
import { applyBlurToCanvas, isNoopBlur } from '../utils/blurUtils';
import { DEFAULT_POST_PROCESS } from '../utils/postProcessUtils';
import {
  getDefaultShortcuts,
  loadCustomShortcuts,
  saveCustomShortcuts,
  type ShortcutMap
} from '../utils/shortcuts';
import { renderStroke } from '../utils/canvasRenderer';
import type { BrushPresetId, DrawingLayer, Stroke, ToolId } from '../types/harmony';
import type { AudioTrackData, HarmonyState, ImportedLayerSpec, SceneTab } from './types';
import {
  DEFAULT_SWATCHES,
  PREF_KEYS,
  USER_PREFS_KEY,
  cloneStrokesWithNewIds,
  createDefaultLayers,
  makeSnapshot,
  resolveEffectiveStrokes,
  savedPrefs,
  splitCelDurationsAt,
  syncActiveTabInList
} from './storeHelpers';
import { createLayerSlice } from './slices/layerSlice';
import { createCelAndStrokeSlice } from './slices/celAndStrokeSlice';
import { createProjectSlice } from './slices/projectSlice';

export type { AudioTrackData, HarmonyState, ImportedLayerSpec, SceneTab };
export { resolveEffectiveStrokes };

export const useHarmonyStore = create<HarmonyState>((set, get) => ({
  openScenes: [],
  activeSceneId: '',

  projectName: 'Untitled_Scene',
  projectPath: null,
  isDirty: false,
  symmetryMode: 'none',
  clipboardStrokes: [],
  audioTrack: null,
  timelineMarkers: {},
  timelineCellWidth: typeof savedPrefs.timelineCellWidth === 'number' ? savedPrefs.timelineCellWidth : 22,
  autoSaveEnabled: typeof savedPrefs.autoSaveEnabled === 'boolean' ? savedPrefs.autoSaveEnabled : true,
  autoSaveIntervalSec: typeof savedPrefs.autoSaveIntervalSec === 'number' ? savedPrefs.autoSaveIntervalSec : 60,
  lastAutoSaveTime: null,
  canvasWidth: 1920,
  canvasHeight: 1080,
  fps: 24,
  totalFrames: 60,
  playStart: 1,
  playEnd: 60,
  currentFrame: 1,
  isPlaying: false,
  loopPlayback: typeof savedPrefs.loopPlayback === 'boolean' ? savedPrefs.loopPlayback : true,

  activeTool: 'brush',
  lastSelectionTool: savedPrefs.lastSelectionTool || 'lasso',
  lastShapeTool: savedPrefs.lastShapeTool || 'rectangle',
  activeBrushPreset: savedPrefs.activeBrushPreset || 'sai_pen',
  activeArtLayer: 'LA',
  activeColor: typeof savedPrefs.activeColor === 'string' ? savedPrefs.activeColor : '#141414',
  secondaryColor: typeof savedPrefs.secondaryColor === 'string' ? savedPrefs.secondaryColor : '#ffffff',
  brushSize: typeof savedPrefs.brushSize === 'number' ? savedPrefs.brushSize : 18,
  brushMinSize: typeof savedPrefs.brushMinSize === 'number' ? savedPrefs.brushMinSize : 5,
  usePressure: typeof savedPrefs.usePressure === 'boolean' ? savedPrefs.usePressure : true,
  brushOpacity: typeof savedPrefs.brushOpacity === 'number' ? savedPrefs.brushOpacity : 1,
  brushSmoothing: typeof savedPrefs.brushSmoothing === 'number' ? savedPrefs.brushSmoothing : 35,
  eraserSize: typeof savedPrefs.eraserSize === 'number' ? savedPrefs.eraserSize : 32,
  eraserMinSize: typeof savedPrefs.eraserMinSize === 'number' ? savedPrefs.eraserMinSize : 10,
  eraserOpacity: typeof savedPrefs.eraserOpacity === 'number' ? savedPrefs.eraserOpacity : 1,
  eraserPreset: savedPrefs.eraserPreset || 'sai_pen',
  textFontFamily: typeof savedPrefs.textFontFamily === 'string' ? savedPrefs.textFontFamily : 'Segoe UI',
  textFontSize: typeof savedPrefs.textFontSize === 'number' ? savedPrefs.textFontSize : 48,
  textBold: typeof savedPrefs.textBold === 'boolean' ? savedPrefs.textBold : false,
  textItalic: typeof savedPrefs.textItalic === 'boolean' ? savedPrefs.textItalic : false,
  activeSelectionPoly: null,
  activeSelectionPolys: null,
  activeSelectionInverted: false,
  invertSelectionTrigger: 0,
  shapeFilled: typeof savedPrefs.shapeFilled === 'boolean' ? savedPrefs.shapeFilled : false,
  gradientMode: 'linear',
  gradientToTransparent: true,
  bucketReference: savedPrefs.bucketReference === 'all' ? 'all' : 'active',
  bucketTolerance: typeof savedPrefs.bucketTolerance === 'number' ? savedPrefs.bucketTolerance : 32,
  bucketExpand: typeof savedPrefs.bucketExpand === 'number' ? savedPrefs.bucketExpand : 1,
  bucketCloseGap: typeof savedPrefs.bucketCloseGap === 'number' ? savedPrefs.bucketCloseGap : 4,
  bucketBehind: typeof savedPrefs.bucketBehind === 'boolean' ? savedPrefs.bucketBehind : false,
  liquifyMode: savedPrefs.liquifyMode === 'expand' || savedPrefs.liquifyMode === 'pinch' ? savedPrefs.liquifyMode : 'push',
  liquifySize: typeof savedPrefs.liquifySize === 'number' ? savedPrefs.liquifySize : 90,
  liquifyStrength: typeof savedPrefs.liquifyStrength === 'number' ? savedPrefs.liquifyStrength : 55,
  referenceWindowOpen: false,

  timelapseRecording: false,
  timelapseRootDir: typeof savedPrefs.timelapseRootDir === 'string' ? savedPrefs.timelapseRootDir : null,
  timelapseFrames: [],
  performanceMode:
    savedPrefs.performanceMode === 'eco' || savedPrefs.performanceMode === 'ultra'
      ? savedPrefs.performanceMode
      : 'auto',

  showWelcome: true,
  zoom: 0.55,
  panX: 0,
  panY: 0,
  rotation: 0,
  flipX: false,
  grayscaleMode: false,
  hsvModalOpen: false,
  hsvPreview: null,
  levelsModalOpen: false,
  levelsPreview: null,
  blurModalOpen: false,
  blurPreview: null,
  postProcessModalOpen: false,
  postProcess: { ...DEFAULT_POST_PROCESS },
  settingsModalOpen: false,
  showBrushSizeHud: typeof savedPrefs.showBrushSizeHud === 'boolean' ? savedPrefs.showBrushSizeHud : true,
  customShortcuts: loadCustomShortcuts(),
  exportModalOpen: false,
  cropMode: false,
  showGrid: typeof savedPrefs.showGrid === 'boolean' ? savedPrefs.showGrid : false,
  perspectiveMode: 0,
  showCameraFrame: typeof savedPrefs.showCameraFrame === 'boolean' ? savedPrefs.showCameraFrame : false,
  cameraViewMode: false,
  cameraGuides: true,
  lightTable: typeof savedPrefs.lightTable === 'boolean' ? savedPrefs.lightTable : false,
  onionSkin: typeof savedPrefs.onionSkin === 'boolean' ? savedPrefs.onionSkin : true,
  onionPrev: typeof savedPrefs.onionPrev === 'number' ? savedPrefs.onionPrev : 2,
  onionNext: typeof savedPrefs.onionNext === 'number' ? savedPrefs.onionNext : 2,
  centerTab: 'camera',
  rightTab: 'colour',

  swatches: DEFAULT_SWATCHES,
  activeSwatchId: 'sw-black',
  recentColors: Array.isArray(savedPrefs.recentColors) && savedPrefs.recentColors.length > 0
    ? savedPrefs.recentColors
    : ['#141414', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'],

  layers: createDefaultLayers(),
  activeLayerId: 'layer-1',
  selectedLayerIds: ['layer-1'],

  undoStack: [],
  redoStack: [],

  setTool: (activeTool) =>
    set((s) => {
      const selGroup: ToolId[] = ['lasso', 'polylasso', 'lassofill', 'polylassofill', 'rectselect', 'ellipseselect'];
      const shapeGroup: ToolId[] = ['line', 'rectangle', 'ellipse'];
      return {
        activeTool,
        lastSelectionTool: selGroup.includes(activeTool) ? activeTool : s.lastSelectionTool,
        lastShapeTool: shapeGroup.includes(activeTool) ? activeTool : s.lastShapeTool
      };
    }),
  activateSelectionGroup: (cycle = false) =>
    set((s) => {
      const selGroup: ToolId[] = ['lasso', 'polylasso', 'lassofill', 'polylassofill', 'rectselect', 'ellipseselect'];
      if (!cycle) {
        return { activeTool: s.lastSelectionTool };
      }
      const idx = selGroup.indexOf(s.lastSelectionTool);
      const next = selGroup[(idx + 1) % selGroup.length];
      return { activeTool: next, lastSelectionTool: next };
    }),
  activateShapeGroup: (cycle = false) =>
    set((s) => {
      const shapeGroup: ToolId[] = ['line', 'rectangle', 'ellipse'];
      if (!cycle) {
        return { activeTool: s.lastShapeTool };
      }
      const idx = shapeGroup.indexOf(s.lastShapeTool);
      const next = shapeGroup[(idx + 1) % shapeGroup.length];
      return { activeTool: next, lastShapeTool: next };
    }),
  selectBrushPreset: (preset) => {
    const configs: Record<BrushPresetId, { size: number; minSize: number; opacity: number }> = {
      csp_line: { size: 17, minSize: 5, opacity: 1 },
      csp_sketch: { size: 14, minSize: 15, opacity: 0.78 },
      sai_pen: { size: 14, minSize: 5, opacity: 1 },
      sketch_graphite: { size: 12, minSize: 15, opacity: 0.65 },
      sai_pencil: { size: 10, minSize: 18, opacity: 0.78 },
      sai_airbrush: { size: 52, minSize: 25, opacity: 0.35 },
      sai_brush: { size: 30, minSize: 15, opacity: 0.85 },
      sai_water: { size: 36, minSize: 20, opacity: 0.48 },
      sai_marker: { size: 28, minSize: 65, opacity: 0.58 },
      sai_inkpen: { size: 22, minSize: 3, opacity: 1 },
      sai_binary: { size: 6, minSize: 100, opacity: 1 },
      sai_opacity_pen: { size: 18, minSize: 8, opacity: 0.82 },
      blur_soft: { size: 42, minSize: 30, opacity: 0.22 },
      blur_smudge: { size: 32, minSize: 20, opacity: 0.35 }
    };
    const cfg = configs[preset];
    set({
      activeBrushPreset: preset,
      activeTool: 'brush',
      brushSize: cfg.size,
      brushMinSize: cfg.minSize,
      brushOpacity: cfg.opacity
    });
  },
  setActiveColor: (activeColor) => set({ activeColor }),
  setSecondaryColor: (secondaryColor) => set({ secondaryColor }),
  swapColors: () =>
    set((s) => ({
      activeColor: s.secondaryColor,
      secondaryColor: s.activeColor
    })),
  pushRecentColor: (hex) =>
    set((s) => {
      const norm = hex.toLowerCase();
      const filtered = s.recentColors.filter((c) => c.toLowerCase() !== norm);
      return { recentColors: [hex, ...filtered].slice(0, 18) };
    }),
  setArtLayer: (activeArtLayer) => set({ activeArtLayer }),
  setBrushSize: (brushSize) => set({ brushSize: Math.max(1, Math.min(200, brushSize)) }),
  setBrushMinSize: (brushMinSize) => set({ brushMinSize: Math.max(0, Math.min(100, brushMinSize)) }),
  setUsePressure: (usePressure) => set({ usePressure }),
  setBrushOpacity: (brushOpacity) => set({ brushOpacity: Math.max(0.05, Math.min(1, brushOpacity)) }),
  setBrushSmoothing: (brushSmoothing) => set({ brushSmoothing: Math.max(0, Math.min(100, brushSmoothing)) }),
  setEraserSize: (eraserSize) => set({ eraserSize: Math.max(1, Math.min(300, eraserSize)) }),
  setEraserMinSize: (eraserMinSize) => set({ eraserMinSize: Math.max(0, Math.min(100, eraserMinSize)) }),
  setEraserOpacity: (eraserOpacity) => set({ eraserOpacity: Math.max(0.05, Math.min(1, eraserOpacity)) }),
  setEraserPreset: (eraserPreset) => set({ eraserPreset, activeTool: 'eraser' }),
  setTextFontFamily: (textFontFamily) => set({ textFontFamily }),
  setTextFontSize: (textFontSize) => set({ textFontSize: Math.max(8, Math.min(400, Math.round(textFontSize))) }),
  setTextBold: (textBold) => set({ textBold }),
  setTextItalic: (textItalic) => set({ textItalic }),
  setActiveSelectionPoly: (activeSelectionPoly, activeSelectionInverted = false, polys) =>
    set({
      activeSelectionPoly,
      activeSelectionPolys:
        polys && polys.length > 0
          ? polys
          : activeSelectionPoly && activeSelectionPoly.length >= 3
            ? [activeSelectionPoly]
            : null,
      activeSelectionInverted: activeSelectionPoly && activeSelectionPoly.length >= 3 ? Boolean(activeSelectionInverted) : false
    }),
  requestInvertSelection: () =>
    set((s) => (s.activeSelectionPoly && s.activeSelectionPoly.length >= 3 ? { invertSelectionTrigger: s.invertSelectionTrigger + 1 } : s)),
  setShapeFilled: (shapeFilled) => set({ shapeFilled }),
  setGradientMode: (gradientMode) => set({ gradientMode }),
  setGradientToTransparent: (gradientToTransparent) => set({ gradientToTransparent }),
  setBucketReference: (bucketReference) => set({ bucketReference }),
  setBucketTolerance: (bucketTolerance) => set({ bucketTolerance: Math.max(0, Math.min(150, bucketTolerance)) }),
  setBucketExpand: (bucketExpand) => set({ bucketExpand: Math.max(0, Math.min(4, bucketExpand)) }),
  setBucketCloseGap: (bucketCloseGap) => set({ bucketCloseGap: Math.max(0, Math.min(24, Math.round(bucketCloseGap))) }),
  setBucketBehind: (bucketBehind) => set({ bucketBehind }),
  setLiquifyMode: (liquifyMode) => set({ liquifyMode }),
  setLiquifySize: (liquifySize) => set({ liquifySize: Math.max(20, Math.min(300, Math.round(liquifySize))) }),
  setLiquifyStrength: (liquifyStrength) => set({ liquifyStrength: Math.max(10, Math.min(100, Math.round(liquifyStrength))) }),
  toggleReferenceWindow: () => set((s) => ({ referenceWindowOpen: !s.referenceWindowOpen })),

  setZoom: (zoom) =>
    set((s) => ({
      zoom: Number.isFinite(zoom) ? Math.max(0.1, Math.min(8, zoom)) : s.zoom
    })),
  setShowWelcome: (showWelcome) => set({ showWelcome }),
  setSettingsModalOpen: (settingsModalOpen) => set({ settingsModalOpen }),
  setShowBrushSizeHud: (showBrushSizeHud) => set({ showBrushSizeHud }),
  setCustomShortcut: (actionId, combo) =>
    set((s) => {
      const next: ShortcutMap = { ...s.customShortcuts, [actionId]: combo };
      saveCustomShortcuts(next);
      return { customShortcuts: next };
    }),
  resetCustomShortcuts: () => {
    const defaults = getDefaultShortcuts();
    saveCustomShortcuts(defaults);
    set({ customShortcuts: defaults });
  },
  createNewScene: (name, width, height, fps) =>
    set((s) => {
      const id = `scene-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const newLayers = createDefaultLayers();
      const w = Math.max(64, Math.min(8192, Math.round(width)));
      const h = Math.max(64, Math.min(8192, Math.round(height)));
      const f = Math.max(1, Math.min(120, Math.round(fps)));
      const sceneName = name.trim() || `Cena_${s.openScenes.length + 1}`;
      const synced = syncActiveTabInList(s);

      const newTab: SceneTab = {
        id,
        name: sceneName,
        path: null,
        isDirty: false,
        width: w,
        height: h,
        fps: f,
        totalFrames: 60,
        playStart: 1,
        playEnd: 60,
        currentFrame: 1,
        layers: newLayers,
        activeLayerId: newLayers[0].id,
        selectedLayerIds: [newLayers[0].id],
        swatches: DEFAULT_SWATCHES,
        activeSwatchId: 'sw-black',
        timelineMarkers: {},
        audioTrack: null,
        undoStack: [],
        redoStack: []
      };

      return {
        openScenes: [...synced, newTab],
        activeSceneId: id,
        projectName: sceneName,
        projectPath: null,
        isDirty: false,
        canvasWidth: w,
        canvasHeight: h,
        fps: f,
        currentFrame: 1,
        playStart: 1,
        playEnd: 60,
        totalFrames: 60,
        isPlaying: false,
        timelineMarkers: {},
        audioTrack: null,
        swatches: DEFAULT_SWATCHES,
        activeSwatchId: 'sw-black',
        activeColor: '#141414',
        layers: newLayers,
        activeLayerId: newLayers[0].id,
        selectedLayerIds: [newLayers[0].id],
        undoStack: [],
        redoStack: [],
        timelapseFrames: [],
        zoom: 0.55,
        panX: 0,
        panY: 0,
        rotation: 0,
        flipX: false,
        cameraViewMode: false,
        postProcess: { ...DEFAULT_POST_PROCESS },
        hsvPreview: null,
        levelsPreview: null,
        blurPreview: null,
        showWelcome: false
      };
    }),
  createWarmupScene: () =>
    set((s) => {
      const id = `scene-warmup-${Date.now()}`;
      const warmupLayers = buildWarmupLayers();
      const synced = syncActiveTabInList(s);
      const newTab: SceneTab = {
        id,
        name: 'Aquecimento',
        path: null,
        isDirty: false,
        width: 1920,
        height: 1080,
        fps: 24,
        totalFrames: 5,
        playStart: 1,
        playEnd: 5,
        currentFrame: 1,
        layers: warmupLayers,
        activeLayerId: warmupLayers[0].id,
        selectedLayerIds: [warmupLayers[0].id],
        swatches: DEFAULT_SWATCHES,
        activeSwatchId: 'sw-black',
        timelineMarkers: {},
        audioTrack: null,
        undoStack: [],
        redoStack: []
      };
      return {
        openScenes: [...synced, newTab],
        activeSceneId: id,
        projectName: 'Aquecimento',
        projectPath: null,
        isDirty: false,
        canvasWidth: 1920,
        canvasHeight: 1080,
        fps: 24,
        currentFrame: 1,
        playStart: 1,
        playEnd: 5,
        totalFrames: 5,
        isPlaying: false,
        timelineMarkers: {},
        audioTrack: null,
        activeTool: 'brush',
        swatches: DEFAULT_SWATCHES,
        activeSwatchId: 'sw-black',
        layers: warmupLayers,
        activeLayerId: warmupLayers[0].id,
        selectedLayerIds: [warmupLayers[0].id],
        undoStack: [],
        redoStack: [],
        timelapseFrames: [],
        zoom: 0.55,
        panX: 0,
        panY: 0,
        rotation: 0,
        flipX: false,
        cameraViewMode: false,
        postProcess: { ...DEFAULT_POST_PROCESS },
        hsvPreview: null,
        levelsPreview: null,
        blurPreview: null,
        showWelcome: false
      };
    }),
  switchSceneTab: (id) =>
    set((s) => {
      if (id === s.activeSceneId) return s;
      const synced = syncActiveTabInList(s);
      const target = synced.find((sc) => sc.id === id);
      if (!target) return s;
      return {
        openScenes: synced,
        activeSceneId: target.id,
        projectName: target.name,
        projectPath: target.path,
        isDirty: target.isDirty,
        canvasWidth: target.width,
        canvasHeight: target.height,
        fps: target.fps,
        totalFrames: target.totalFrames,
        playStart: target.playStart,
        playEnd: target.playEnd,
        currentFrame: target.currentFrame,
        layers: target.layers,
        activeLayerId: target.activeLayerId,
        selectedLayerIds: target.selectedLayerIds,
        swatches: target.swatches,
        activeSwatchId: target.activeSwatchId,
        timelineMarkers: target.timelineMarkers || {},
        audioTrack: target.audioTrack || null,
        isPlaying: false,
        undoStack: target.undoStack || [],
        redoStack: target.redoStack || []
      };
    }),
  closeSceneTab: (id) =>
    set((s) => {
      const synced = syncActiveTabInList(s);
      const closing = synced.find((sc) => sc.id === id);
      const remaining = synced.filter((sc) => sc.id !== id);
      // Revoke closed tab's audio objectUrl if no other tab shares it
      if (closing?.audioTrack?.objectUrl) {
        const stillUsed = remaining.some((sc) => sc.audioTrack?.objectUrl === closing.audioTrack?.objectUrl);
        if (!stillUsed) {
          try {
            URL.revokeObjectURL(closing.audioTrack.objectUrl);
          } catch {
            // ignore
          }
        }
      }
      if (remaining.length === 0) {
        return {
          openScenes: [],
          activeSceneId: '',
          layers: [],
          isDirty: false,
          isPlaying: false,
          audioTrack: null,
          timelineMarkers: {},
          undoStack: [],
          redoStack: [],
          activeSelectionPoly: null,
          activeSelectionInverted: false,
          hsvModalOpen: false,
          hsvPreview: null,
          cropMode: false,
          showWelcome: true
        };
      }
      if (id !== s.activeSceneId) {
        return { openScenes: remaining };
      }
      const next = remaining[remaining.length - 1];
      return {
        openScenes: remaining,
        activeSceneId: next.id,
        projectName: next.name,
        projectPath: next.path,
        isDirty: next.isDirty,
        canvasWidth: next.width,
        canvasHeight: next.height,
        fps: next.fps,
        totalFrames: next.totalFrames,
        playStart: next.playStart,
        playEnd: next.playEnd,
        currentFrame: next.currentFrame,
        layers: next.layers,
        activeLayerId: next.activeLayerId,
        selectedLayerIds: next.selectedLayerIds,
        swatches: next.swatches,
        activeSwatchId: next.activeSwatchId,
        timelineMarkers: next.timelineMarkers || {},
        audioTrack: next.audioTrack || null,
        isPlaying: false,
        undoStack: next.undoStack || [],
        redoStack: next.redoStack || []
      };
    }),
  addBlankSceneTab: () => {
    const s = get();
    s.createNewScene(`Cena_${s.openScenes.length + 1}`, s.canvasWidth, s.canvasHeight, s.fps);
  },
  setPan: (panX, panY) =>
    set((s) => ({
      panX: Number.isFinite(panX) ? Math.max(-20000, Math.min(20000, panX)) : s.panX,
      panY: Number.isFinite(panY) ? Math.max(-20000, Math.min(20000, panY)) : s.panY
    })),
  setRotation: (rotation) =>
    set((s) => ({
      rotation: Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : s.rotation
    })),
  resetRotation: () => set({ rotation: 0 }),
  toggleFlipX: () => set((s) => ({ flipX: !s.flipX })),
  toggleGrayscaleMode: () => set((s) => ({ grayscaleMode: !s.grayscaleMode })),
  setHsvModalOpen: (hsvModalOpen) => set((s) => ({ hsvModalOpen, hsvPreview: hsvModalOpen ? s.hsvPreview : null })),
  setHsvPreview: (hsvPreview) => set({ hsvPreview }),
  setExportModalOpen: (exportModalOpen) => set({ exportModalOpen }),
  setCropMode: (cropMode) => set({ cropMode }),
  resizeCanvas: (offsetX, offsetY, newWidth, newHeight) =>
    set((s) => {
      const w = Math.max(64, Math.min(8192, Math.round(newWidth)));
      const h = Math.max(64, Math.min(8192, Math.round(newHeight)));
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        const updatedFrames: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          updatedFrames[Number(fKey)] = strokes.map((st) => {
            const shifted: Stroke = {
              ...st,
              points: st.points.map((pt) => ({
                ...pt,
                x: pt.x - offsetX,
                y: pt.y - offsetY
              }))
            };
            if (st.tool === 'image') {
              if (typeof st.imageX === 'number') shifted.imageX = st.imageX - offsetX;
              if (typeof st.imageY === 'number') shifted.imageY = st.imageY - offsetY;
              if (st.imageQuad) {
                shifted.imageQuad = {
                  tl: { x: st.imageQuad.tl.x - offsetX, y: st.imageQuad.tl.y - offsetY },
                  tr: { x: st.imageQuad.tr.x - offsetX, y: st.imageQuad.tr.y - offsetY },
                  br: { x: st.imageQuad.br.x - offsetX, y: st.imageQuad.br.y - offsetY },
                  bl: { x: st.imageQuad.bl.x - offsetX, y: st.imageQuad.bl.y - offsetY }
                };
              }
            }
            return shifted;
          });
        }
        return { ...l, frames: updatedFrames };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        canvasWidth: w,
        canvasHeight: h,
        layers,
        cropMode: false,
        isDirty: true
      };
    }),
  applyLayerHsv: (hDelta, sDelta, vDelta, allFrames, colorize = false) =>
    set((s) => {
      if (!colorize && hDelta === 0 && sDelta === 0 && vDelta === 0) return { hsvPreview: null };
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder') return { hsvPreview: null };
      const snapshot = makeSnapshot(s);
      const step = { h: hDelta, s: sDelta, v: vDelta, ...(colorize ? { colorize: true } : {}) };
      const adjustStroke = (st: Stroke): Stroke => {
        if (st.tool === 'eraser' || st.tool === 'erase_poly') return st;
        if (st.tool === 'image') {
          const prevList = st.hsvFilters
            ? st.hsvFilters
            : st.hsvFilter
              ? [st.hsvFilter]
              : [];
          return {
            ...st,
            hsvFilter: undefined,
            hsvFilters: [...prevList, step]
          };
        }
        return {
          ...st,
          color: adjustHexHsl(st.color, hDelta, sDelta, vDelta, colorize)
        };
      };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const updatedFrames: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          const fNum = Number(fKey);
          if (allFrames || fNum === s.currentFrame) {
            updatedFrames[fNum] = strokes.map(adjustStroke);
          } else {
            updatedFrames[fNum] = strokes;
          }
        }
        let nextDur = l.celDurations;
        // If adjusting only the current frame and it is displaying a held/stretched Cel, materialize it cleanly!
        if (!allFrames && l.frames[s.currentFrame] === undefined) {
          const effective = resolveEffectiveStrokes(l, s.currentFrame);
          if (effective.length > 0) {
            updatedFrames[s.currentFrame] = cloneStrokesWithNewIds(effective, 'st-hsv').map(adjustStroke);
            nextDur = splitCelDurationsAt(l.celDurations, s.currentFrame, true);
          }
        }
        return { ...l, frames: updatedFrames, celDurations: nextDur };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        hsvPreview: null,
        isDirty: true
      };
    }),
  setLevelsModalOpen: (levelsModalOpen) => set({ levelsModalOpen, levelsPreview: levelsModalOpen ? null : null }),
  setLevelsPreview: (levelsPreview) => set({ levelsPreview }),
  applyLayerLevels: (adj, allFrames) =>
    set((s) => {
      if (isNoopLevels(adj)) return { levelsPreview: null };
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') {
        return { levelsPreview: null };
      }
      const snapshot = makeSnapshot(s);
      const step = { ...adj };
      const adjustStroke = (st: Stroke): Stroke => {
        if (st.tool === 'eraser' || st.tool === 'erase_poly') return st;
        if (st.tool === 'image') {
          return {
            ...st,
            levelsFilters: [...(st.levelsFilters || []), step]
          };
        }
        return {
          ...st,
          color: adjustHexLevels(st.color, step),
          ...(st.secondaryColor ? { secondaryColor: adjustHexLevels(st.secondaryColor, step) } : {})
        };
      };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const updatedFrames: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          const fNum = Number(fKey);
          if (allFrames || fNum === s.currentFrame) {
            updatedFrames[fNum] = strokes.map(adjustStroke);
          } else {
            updatedFrames[fNum] = strokes;
          }
        }
        let nextDur = l.celDurations;
        if (!allFrames && l.frames[s.currentFrame] === undefined) {
          const effective = resolveEffectiveStrokes(l, s.currentFrame);
          if (effective.length > 0) {
            updatedFrames[s.currentFrame] = cloneStrokesWithNewIds(effective, 'st-lvl').map(adjustStroke);
            nextDur = splitCelDurationsAt(l.celDurations, s.currentFrame, true);
          }
        }
        return { ...l, frames: updatedFrames, celDurations: nextDur };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        levelsPreview: null,
        isDirty: true
      };
    }),
  setPostProcessModalOpen: (postProcessModalOpen) => set({ postProcessModalOpen }),
  setBlurModalOpen: (blurModalOpen) => set({ blurModalOpen, blurPreview: null }),
  setBlurPreview: (blurPreview) => set({ blurPreview }),
  applyLayerBlur: (cfg, allFrames) =>
    set((s) => {
      if (isNoopBlur(cfg) || typeof document === 'undefined') return { blurPreview: null };
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') {
        return { blurPreview: null };
      }
      const snapshot = makeSnapshot(s);
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = s.canvasWidth;
      srcCanvas.height = s.canvasHeight;
      const sctx = srcCanvas.getContext('2d');
      const dstCanvas = document.createElement('canvas');
      if (!sctx) return { blurPreview: null };

      const blurFrameStrokes = (strokes: Stroke[], fNum: number): Stroke[] => {
        if (!strokes || strokes.length === 0) return strokes;
        sctx.clearRect(0, 0, s.canvasWidth, s.canvasHeight);
        for (const st of strokes) {
          renderStroke(sctx, st);
        }
        applyBlurToCanvas(srcCanvas, dstCanvas, cfg);
        return [
          {
            id: `st-blur-${Date.now()}-${fNum}-${Math.random().toString(36).slice(2, 5)}`,
            tool: 'image',
            artLayer: 'LA',
            swatchId: 'sw-black',
            color: '#ffffff',
            size: 1,
            opacity: 1,
            smoothing: 0,
            points: [{ x: 0, y: 0 }],
            imageDataUrl: dstCanvas.toDataURL('image/png'),
            imageX: 0,
            imageY: 0,
            imageW: s.canvasWidth,
            imageH: s.canvasHeight
          }
        ];
      };

      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const updatedFrames: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          const fNum = Number(fKey);
          if (allFrames || fNum === s.currentFrame) {
            updatedFrames[fNum] = blurFrameStrokes(strokes, fNum);
          } else {
            updatedFrames[fNum] = strokes;
          }
        }
        let nextDur = l.celDurations;
        if (!allFrames && l.frames[s.currentFrame] === undefined) {
          const effective = resolveEffectiveStrokes(l, s.currentFrame);
          if (effective.length > 0) {
            updatedFrames[s.currentFrame] = blurFrameStrokes(effective, s.currentFrame);
            nextDur = splitCelDurationsAt(l.celDurations, s.currentFrame, true);
          }
        }
        return { ...l, frames: updatedFrames, celDurations: nextDur };
      });

      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        blurPreview: null,
        isDirty: true
      };
    }),
  setPostProcess: (patch) =>
    set((s) => ({
      postProcess: { ...s.postProcess, ...patch },
      isDirty: true
    })),
  resetPostProcess: () =>
    set({
      postProcess: { ...DEFAULT_POST_PROCESS },
      isDirty: true
    }),
  resetView: () => set({ zoom: 0.55, panX: 0, panY: 0, rotation: 0, flipX: false }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setPerspectiveMode: (perspectiveMode) => set({ perspectiveMode }),
  toggleCameraFrame: () => set((s) => ({ showCameraFrame: !s.showCameraFrame })),
  toggleCameraViewMode: () => set((s) => ({ cameraViewMode: !s.cameraViewMode })),
  setCameraViewMode: (cameraViewMode) => set({ cameraViewMode }),
  toggleCameraGuides: () => set((s) => ({ cameraGuides: !s.cameraGuides })),
  toggleLightTable: () => set((s) => ({ lightTable: !s.lightTable })),
  toggleOnionSkin: () => set((s) => ({ onionSkin: !s.onionSkin })),
  setOnionRange: (onionPrev, onionNext) => set({ onionPrev, onionNext }),
  setCenterTab: (centerTab) => set({ centerTab }),
  setRightTab: (rightTab) => set({ rightTab }),

  setCurrentFrame: (frame) =>
    set((s) => ({
      currentFrame: Math.max(1, Math.min(s.totalFrames, frame))
    })),
  nextFrame: () =>
    set((s) => {
      if (s.isPlaying) {
        const next = s.currentFrame + 1;
        if (next > s.playEnd) {
          return { currentFrame: s.loopPlayback ? s.playStart : s.playEnd };
        }
        return { currentFrame: next < s.playStart ? s.playStart : next };
      }
      return {
        currentFrame: s.currentFrame >= s.totalFrames ? (s.loopPlayback ? 1 : s.totalFrames) : s.currentFrame + 1
      };
    }),
  jumpToNextDrawing: () =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!layer) return s;
      const drawn = Object.entries(layer.frames)
        .filter(([, strokes]) => strokes && strokes.length > 0)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b);
      if (drawn.length === 0) return s;
      const next = drawn.find((f) => f > s.currentFrame);
      return { currentFrame: next ?? drawn[0] };
    }),
  jumpToPrevDrawing: () =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!layer) return s;
      const drawn = Object.entries(layer.frames)
        .filter(([, strokes]) => strokes && strokes.length > 0)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b);
      if (drawn.length === 0) return s;
      const prev = [...drawn].reverse().find((f) => f < s.currentFrame);
      return { currentFrame: prev ?? drawn[drawn.length - 1] };
    }),
  prevFrame: () =>
    set((s) => ({
      currentFrame: s.currentFrame <= 1 ? (s.loopPlayback ? s.totalFrames : 1) : s.currentFrame - 1
    })),
  setFps: (fps) =>
    set((s) => {
      if (!Number.isFinite(fps)) return s;
      return { fps: Math.max(1, Math.min(120, Math.round(fps))), isDirty: true };
    }),
  setTotalFrames: (totalFrames) =>
    set((s) => {
      if (!Number.isFinite(totalFrames)) return s;
      const clamped = Math.max(1, Math.min(1000, Math.round(totalFrames)));
      return {
        totalFrames: clamped,
        playEnd: Math.min(s.playEnd, clamped),
        playStart: Math.min(s.playStart, clamped),
        currentFrame: Math.min(s.currentFrame, clamped),
        isDirty: true
      };
    }),
  setPlayRange: (start, end) =>
    set((s) => {
      if (!Number.isFinite(start) || !Number.isFinite(end)) return s;
      const clampedStart = Math.max(1, Math.min(s.totalFrames, Math.round(start)));
      const clampedEnd = Math.max(clampedStart, Math.min(s.totalFrames, Math.round(end)));
      return { playStart: clampedStart, playEnd: clampedEnd, isDirty: true };
    }),
  togglePlay: () =>
    set((s) => {
      if (!s.isPlaying && !s.loopPlayback && s.currentFrame >= s.playEnd) {
        return { isPlaying: true, currentFrame: s.playStart };
      }
      return { isPlaying: !s.isPlaying };
    }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  toggleLoop: () => set((s) => ({ loopPlayback: !s.loopPlayback })),

  setActiveSwatch: (activeSwatchId) =>
    set((s) => {
      const sw = s.swatches.find((item) => item.id === activeSwatchId);
      return {
        activeSwatchId,
        activeColor: sw ? sw.hex : s.activeColor
      };
    }),
  addSwatch: (name, hex) =>
    set((s) => {
      const id = `sw-${Date.now()}`;
      return {
        swatches: [...s.swatches, { id, name, hex, alpha: 1 }],
        activeSwatchId: id,
        activeColor: hex,
        isDirty: true
      };
    }),
  updateSwatch: (id, hex, name) =>
    set((s) => ({
      activeColor: hex,
      swatches: s.swatches.map((sw) =>
        sw.id === id ? { ...sw, hex, name: name ?? sw.name } : sw
      ),
      isDirty: true
    })),
  deleteSwatch: (id) =>
    set((s) => {
      if (s.swatches.length <= 1) return s;
      const remaining = s.swatches.filter((sw) => sw.id !== id);
      return {
        swatches: remaining,
        activeSwatchId: s.activeSwatchId === id ? remaining[0].id : s.activeSwatchId,
        isDirty: true
      };
    }),

  ...(createLayerSlice(set, get) as any),
  ...(createCelAndStrokeSlice(set, get) as any),
  ...(createProjectSlice(set, get) as any)
}));

let prefsSaveTimer: number | null = null;
let lastElectronDirty = false;
useHarmonyStore.subscribe((s, prev) => {
  // Keep Electron main process informed whether ANY open scene has unsaved edits (even while viewing Home screen!)
  const anyDirty =
    s.isDirty || s.openScenes.some((sc) => sc.id !== s.activeSceneId && sc.isDirty);
  if (anyDirty !== lastElectronDirty) {
    lastElectronDirty = anyDirty;
    window.harmonyAPI?.setDirty?.(anyDirty);
  }

  let prefChanged = false;
  for (const key of PREF_KEYS) {
    if (s[key] !== prev[key]) {
      prefChanged = true;
      break;
    }
  }
  if (!prefChanged) return;

  if (prefsSaveTimer) window.clearTimeout(prefsSaveTimer);
  prefsSaveTimer = window.setTimeout(() => {
    try {
      const cur = useHarmonyStore.getState();
      const prefs: Record<string, any> = {};
      for (const key of PREF_KEYS) {
        prefs[key] = cur[key];
      }
      localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore storage quota errors
    }
  }, 250);
});

