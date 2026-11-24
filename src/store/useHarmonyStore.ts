import { create } from 'zustand';
import {
  ArtLayerId,
  BrushPresetId,
  ColourSwatch,
  DrawingLayer,
  HarmonyProjectData,
  LayerEffects,
  LayerTransformKeyframe,
  PoseTag,
  Stroke,
  ToolId
} from '../types/harmony';

function adjustHexHsv(hex: string, hDelta: number, sDelta: number, vDelta: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2) || '00', 16) / 255;
  const g = parseInt(clean.substring(2, 4) || '00', 16) / 255;
  const b = parseInt(clean.substring(4, 6) || '00', 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;

  const nh = (h + hDelta + 360) % 360;
  const ns = Math.max(0, Math.min(1, s * (1 + sDelta / 100)));
  const nv = Math.max(0, Math.min(1, v * (1 + vDelta / 100)));

  const c = nv * ns;
  const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
  const m = nv - c;
  let nr = 0, ng = 0, nb = 0;
  if (nh < 60) { nr = c; ng = x; nb = 0; }
  else if (nh < 120) { nr = x; ng = c; nb = 0; }
  else if (nh < 180) { nr = 0; ng = c; nb = x; }
  else if (nh < 240) { nr = 0; ng = x; nb = c; }
  else if (nh < 300) { nr = x; ng = 0; nb = c; }
  else { nr = c; ng = 0; nb = x; }

  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

interface HistorySnapshot {
  layers: DrawingLayer[];
}

export interface SceneTab {
  id: string;
  name: string;
  path: string | null;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  playStart: number;
  playEnd: number;
  currentFrame: number;
  layers: DrawingLayer[];
  activeLayerId: string;
  selectedLayerIds: string[];
  swatches: ColourSwatch[];
  activeSwatchId: string;
}

interface HarmonyState {
  // Multi-scene tabs
  openScenes: SceneTab[];
  activeSceneId: string;

  // Project info
  projectName: string;
  projectPath: string | null;
  isDirty: boolean;
  symmetryMode: 'none' | 'vertical';
  clipboardStrokes: Stroke[];
  audioTrack: { name: string; objectUrl: string; peaks: number[]; duration: number } | null;
  timelineMarkers: Record<number, string>;
  timelineCellWidth: number;
  autoSaveEnabled: boolean;
  autoSaveIntervalSec: number;
  lastAutoSaveTime: string | null;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  totalFrames: number;
  playStart: number;
  playEnd: number;
  currentFrame: number;
  isPlaying: boolean;
  loopPlayback: boolean;

  // Tool state
  activeTool: ToolId;
  lastSelectionTool: ToolId;
  lastShapeTool: ToolId;
  activeBrushPreset: BrushPresetId;
  activeArtLayer: ArtLayerId;
  activeColor: string;
  secondaryColor: string;
  brushSize: number;
  brushMinSize: number;
  usePressure: boolean;
  brushOpacity: number;
  brushSmoothing: number;
  shapeFilled: boolean;
  bucketReference: 'all' | 'active';
  bucketTolerance: number;
  bucketExpand: number;
  bucketBehind: boolean;

  // Timelapse recording
  timelapseRecording: boolean;
  timelapseRootDir: string | null;
  timelapseFrames: string[];

  // Performance mode ('auto' | 'eco' | 'ultra')
  performanceMode: 'auto' | 'eco' | 'ultra';

  // View state
  showWelcome: boolean;
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
  flipX: boolean;
  grayscaleMode: boolean;
  hsvModalOpen: boolean;
  hsvPreview: { h: number; s: number; v: number; allFrames: boolean } | null;
  exportModalOpen: boolean;
  cropMode: boolean;
  showGrid: boolean;
  perspectiveMode: 0 | 1 | 2 | 3 | 4;
  showCameraFrame: boolean;
  lightTable: boolean;
  onionSkin: boolean;
  onionPrev: number;
  onionNext: number;
  centerTab: 'camera' | 'drawing' | 'node';
  rightTab: 'properties' | 'colour' | 'brushes';

  // Swatches & Recent Colors
  swatches: ColourSwatch[];
  activeSwatchId: string;
  recentColors: string[];

  // Layers
  layers: DrawingLayer[];
  activeLayerId: string;
  selectedLayerIds: string[];

  // Undo/Redo
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];

  // Actions
  setTool: (tool: ToolId) => void;
  activateSelectionGroup: (cycle?: boolean) => void;
  activateShapeGroup: (cycle?: boolean) => void;
  selectBrushPreset: (preset: BrushPresetId) => void;
  setActiveColor: (hex: string) => void;
  setSecondaryColor: (hex: string) => void;
  swapColors: () => void;
  pushRecentColor: (hex: string) => void;
  setArtLayer: (artLayer: ArtLayerId) => void;
  setBrushSize: (size: number) => void;
  setBrushMinSize: (minPct: number) => void;
  setUsePressure: (use: boolean) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushSmoothing: (smoothing: number) => void;
  setShapeFilled: (filled: boolean) => void;
  setBucketReference: (ref: 'all' | 'active') => void;
  setBucketTolerance: (tol: number) => void;
  setBucketExpand: (px: number) => void;
  setBucketBehind: (behind: boolean) => void;

  setZoom: (zoom: number) => void;
  setShowWelcome: (show: boolean) => void;
  createNewScene: (name: string, width: number, height: number, fps: number) => void;
  switchSceneTab: (id: string) => void;
  closeSceneTab: (id: string) => void;
  addBlankSceneTab: () => void;
  setPan: (x: number, y: number) => void;
  setRotation: (deg: number) => void;
  resetRotation: () => void;
  toggleFlipX: () => void;
  toggleGrayscaleMode: () => void;
  setHsvModalOpen: (open: boolean) => void;
  setHsvPreview: (preview: { h: number; s: number; v: number; allFrames: boolean } | null) => void;
  setExportModalOpen: (open: boolean) => void;
  setCropMode: (open: boolean) => void;
  resizeCanvas: (offsetX: number, offsetY: number, newWidth: number, newHeight: number) => void;
  applyLayerHsv: (hDelta: number, sDelta: number, vDelta: number, allFrames: boolean) => void;
  resetView: () => void;
  toggleGrid: () => void;
  setPerspectiveMode: (mode: 0 | 1 | 2 | 3 | 4) => void;
  toggleCameraFrame: () => void;
  toggleLightTable: () => void;
  toggleOnionSkin: () => void;
  setOnionRange: (prev: number, next: number) => void;
  setCenterTab: (tab: 'camera' | 'drawing' | 'node') => void;
  setRightTab: (tab: 'properties' | 'colour' | 'brushes') => void;

  // Timeline
  setCurrentFrame: (frame: number) => void;
  nextFrame: () => void;
  prevFrame: () => void;
  setFps: (fps: number) => void;
  setTotalFrames: (total: number) => void;
  setPlayRange: (start: number, end: number) => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  toggleLoop: () => void;

  // Swatches
  setActiveSwatch: (id: string) => void;
  addSwatch: (name: string, hex: string) => void;
  updateSwatch: (id: string, hex: string, name?: string) => void;
  deleteSwatch: (id: string) => void;

  // Layers & Drawing
  addLayer: (name?: string) => void;
  addFolderLayer: (name?: string) => void;
  duplicateLayer: (id: string) => void;
  mergeLayerDown: (id: string) => void;
  importImageLayer: (name: string, dataUrl: string, x: number, y: number, w: number, h: number, opacity?: number) => void;
  deleteLayer: (id: string) => void;
  deleteSelectedLayers: () => void;
  setActiveLayer: (id: string) => void;
  toggleSelectLayer: (id: string, multi: boolean, range?: boolean) => void;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  setLayerBlendMode: (id: string, blendMode: GlobalCompositeOperation) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerSolo: (id: string) => void;
  toggleLayerHold: (id: string) => void;
  toggleFolderCollapse: (id: string) => void;
  setLayerParent: (id: string, parentId: string | null) => void;
  toggleLayerAlphaLock: (id: string) => void;
  toggleLayerClippingMask: (id: string) => void;
  setLayerEffects: (id: string, effects: Partial<LayerEffects>) => void;
  setLayerKeyframe: (id: string, frame: number, kf: Partial<LayerTransformKeyframe>) => void;
  deleteLayerKeyframe: (id: string, frame: number) => void;
  setCelDuration: (layerId: string, startFrame: number, duration: number) => void;
  moveCelFrame: (layerId: string, fromFrame: number, toFrame: number) => void;
  substituteCel: (layerId: string, targetFrame: number, sourceFrame: number) => void;
  setFrameTag: (layerId: string, frame: number, tag: PoseTag | null) => void;
  setTimelineMarker: (frame: number, label: string | null) => void;
  setTimelineCellWidth: (w: number) => void;
  reverseFrameRange: (layerId: string, startFrame: number, endFrame: number) => void;
  deleteFrameRange: (layerId: string, startFrame: number, endFrame: number) => void;
  moveFrameRange: (layerId: string, startFrame: number, endFrame: number, delta: number) => void;
  renameLayer: (id: string, name: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setSelectedLayersOpacity: (opacity: number) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;

  toggleSymmetry: () => void;
  setClipboardStrokes: (strokes: Stroke[]) => void;
  copyCurrentFrame: () => void;
  pasteToCurrentFrame: () => void;
  extendExposureF5: () => void;
  reduceExposureShiftF5: () => void;
  setAudioTrack: (track: { name: string; objectUrl: string; peaks: number[]; duration: number } | null) => void;

  addStroke: (stroke: Stroke, insertAtBottom?: boolean) => void;
  moveStrokes: (strokeIds: string[], dx: number, dy: number) => void;
  replaceStrokes: (updated: Stroke[]) => void;
  deleteStrokes: (strokeIds: string[]) => void;
  toggleTimelapseRecording: () => void;
  setTimelapseRootDir: (dir: string | null) => void;
  setPerformanceMode: (mode: 'auto' | 'eco' | 'ultra') => void;
  pushTimelapseFrame: (dataUrl: string) => void;
  clearTimelapse: () => void;
  clearCurrentFrame: () => void;
  duplicateFrameToNext: () => void;
  insertFrameAfterCurrent: () => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;

  // Project IO
  setProjectMeta: (name: string, path: string | null) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveIntervalSec: (sec: number) => void;
  setLastAutoSaveTime: (time: string | null) => void;
  exportProjectData: () => HarmonyProjectData;
  loadProjectData: (data: HarmonyProjectData, filePath: string | null) => void;
  newProject: () => void;
}

const DEFAULT_SWATCHES: ColourSwatch[] = [
  { id: 'sw-black', name: 'Line_Black', hex: '#141414', alpha: 1 },
  { id: 'sw-white', name: 'BG_White', hex: '#ffffff', alpha: 1 },
  { id: 'sw-sketch-blue', name: 'Sketch_Blue', hex: '#3b82f6', alpha: 0.75 },
  { id: 'sw-sketch-red', name: 'Rough_Red', hex: '#ef4444', alpha: 0.75 },
  { id: 'sw-skin', name: 'Skin_Base', hex: '#f5cfa0', alpha: 1 },
  { id: 'sw-skin-shadow', name: 'Skin_Shadow', hex: '#d9a06c', alpha: 1 },
  { id: 'sw-hair', name: 'Hair_Dark', hex: '#2d2436', alpha: 1 },
  { id: 'sw-shirt', name: 'Jacket_Teal', hex: '#14b8a6', alpha: 1 },
  { id: 'sw-accent', name: 'Accent_Gold', hex: '#f59e0b', alpha: 1 },
  { id: 'sw-sky', name: 'Sky_Cyan', hex: '#38bdf8', alpha: 1 }
];

const createDefaultLayers = (): DrawingLayer[] => [
  {
    id: 'layer-1',
    name: 'Character_Line',
    type: 'drawing',
    visible: true,
    locked: false,
    solo: false,
    opacity: 1,
    tagColor: '#4f9cf9',
    frames: { 1: [] },
    nodeX: 160,
    nodeY: 110
  },
  {
    id: 'layer-2',
    name: 'Rough_Sketch',
    type: 'drawing',
    visible: true,
    locked: false,
    solo: false,
    opacity: 0.85,
    tagColor: '#f59e0b',
    frames: { 1: [] },
    nodeX: 360,
    nodeY: 110
  },
  {
    id: 'layer-3',
    name: 'Background',
    type: 'drawing',
    visible: true,
    locked: false,
    solo: false,
    holdFrames: true,
    opacity: 1,
    tagColor: '#10b981',
    frames: { 1: [] },
    nodeX: 560,
    nodeY: 110
  }
];

const cloneLayers = (layers: DrawingLayer[]): DrawingLayer[] =>
  typeof structuredClone === 'function' ? structuredClone(layers) : JSON.parse(JSON.stringify(layers));

const USER_PREFS_KEY = 'celsketch_user_prefs';

function loadUserPrefs(): Record<string, any> {
  try {
    const raw = localStorage.getItem(USER_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const savedPrefs = loadUserPrefs();

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
  shapeFilled: typeof savedPrefs.shapeFilled === 'boolean' ? savedPrefs.shapeFilled : false,
  bucketReference: savedPrefs.bucketReference === 'all' ? 'all' : 'active',
  bucketTolerance: typeof savedPrefs.bucketTolerance === 'number' ? savedPrefs.bucketTolerance : 32,
  bucketExpand: typeof savedPrefs.bucketExpand === 'number' ? savedPrefs.bucketExpand : 1,
  bucketBehind: typeof savedPrefs.bucketBehind === 'boolean' ? savedPrefs.bucketBehind : false,

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
  exportModalOpen: false,
  cropMode: false,
  showGrid: typeof savedPrefs.showGrid === 'boolean' ? savedPrefs.showGrid : false,
  perspectiveMode: 0,
  showCameraFrame: typeof savedPrefs.showCameraFrame === 'boolean' ? savedPrefs.showCameraFrame : false,
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
  setShapeFilled: (shapeFilled) => set({ shapeFilled }),
  setBucketReference: (bucketReference) => set({ bucketReference }),
  setBucketTolerance: (bucketTolerance) => set({ bucketTolerance: Math.max(0, Math.min(150, bucketTolerance)) }),
  setBucketExpand: (bucketExpand) => set({ bucketExpand: Math.max(0, Math.min(4, bucketExpand)) }),
  setBucketBehind: (bucketBehind) => set({ bucketBehind }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(8, zoom)) }),
  setShowWelcome: (showWelcome) => set({ showWelcome }),
  createNewScene: (name, width, height, fps) =>
    set((s) => {
      const id = `scene-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const newLayers = createDefaultLayers();
      const w = Math.max(64, Math.min(8192, Math.round(width)));
      const h = Math.max(64, Math.min(8192, Math.round(height)));
      const f = Math.max(1, Math.min(120, Math.round(fps)));
      const sceneName = name.trim() || `Cena_${s.openScenes.length + 1}`;

      // Save current active scene state back into openScenes before adding new one
      const synced = s.openScenes.map((sc) =>
        sc.id === s.activeSceneId
          ? {
              ...sc,
              name: s.projectName,
              path: s.projectPath,
              width: s.canvasWidth,
              height: s.canvasHeight,
              fps: s.fps,
              totalFrames: s.totalFrames,
              playStart: s.playStart,
              playEnd: s.playEnd,
              currentFrame: s.currentFrame,
              layers: s.layers,
              activeLayerId: s.activeLayerId,
              selectedLayerIds: s.selectedLayerIds,
              swatches: s.swatches,
              activeSwatchId: s.activeSwatchId
            }
          : sc
      );

      const newTab: SceneTab = {
        id,
        name: sceneName,
        path: null,
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
        activeSwatchId: 'sw-black'
      };

      return {
        openScenes: [...synced, newTab],
        activeSceneId: id,
        projectName: sceneName,
        projectPath: null,
        canvasWidth: w,
        canvasHeight: h,
        fps: f,
        currentFrame: 1,
        playStart: 1,
        playEnd: 60,
        totalFrames: 60,
        isPlaying: false,
        swatches: DEFAULT_SWATCHES,
        activeSwatchId: 'sw-black',
        activeColor: '#141414',
        layers: newLayers,
        activeLayerId: newLayers[0].id,
        selectedLayerIds: [newLayers[0].id],
        undoStack: [],
        redoStack: [],
        showWelcome: false
      };
    }),
  switchSceneTab: (id) =>
    set((s) => {
      if (id === s.activeSceneId) return s;
      const synced = s.openScenes.map((sc) =>
        sc.id === s.activeSceneId
          ? {
              ...sc,
              name: s.projectName,
              path: s.projectPath,
              width: s.canvasWidth,
              height: s.canvasHeight,
              fps: s.fps,
              totalFrames: s.totalFrames,
              playStart: s.playStart,
              playEnd: s.playEnd,
              currentFrame: s.currentFrame,
              layers: s.layers,
              activeLayerId: s.activeLayerId,
              selectedLayerIds: s.selectedLayerIds,
              swatches: s.swatches,
              activeSwatchId: s.activeSwatchId
            }
          : sc
      );
      const target = synced.find((sc) => sc.id === id);
      if (!target) return s;
      return {
        openScenes: synced,
        activeSceneId: target.id,
        projectName: target.name,
        projectPath: target.path,
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
        isPlaying: false,
        undoStack: [],
        redoStack: []
      };
    }),
  closeSceneTab: (id) =>
    set((s) => {
      const remaining = s.openScenes.filter((sc) => sc.id !== id);
      if (remaining.length === 0) {
        return {
          openScenes: [],
          activeSceneId: '',
          isPlaying: false,
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
        isPlaying: false,
        undoStack: [],
        redoStack: []
      };
    }),
  addBlankSceneTab: () => {
    const s = get();
    s.createNewScene(`Cena_${s.openScenes.length + 1}`, s.canvasWidth, s.canvasHeight, s.fps);
  },
  setPan: (panX, panY) => set({ panX, panY }),
  setRotation: (rotation) => set({ rotation: ((rotation % 360) + 360) % 360 }),
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
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        const updatedFrames: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          updatedFrames[Number(fKey)] = strokes.map((st) => ({
            ...st,
            points: st.points.map((pt) => ({
              ...pt,
              x: pt.x - offsetX,
              y: pt.y - offsetY
            }))
          }));
        }
        return { ...l, frames: updatedFrames };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        canvasWidth: w,
        canvasHeight: h,
        layers,
        cropMode: false
      };
    }),
  applyLayerHsv: (hDelta, sDelta, vDelta, allFrames) =>
    set((s) => {
      if (hDelta === 0 && sDelta === 0 && vDelta === 0) return { hsvPreview: null };
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const updatedFrames: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          const fNum = Number(fKey);
          if (allFrames || fNum === s.currentFrame) {
            updatedFrames[fNum] = strokes.map((st) => {
              if (st.tool === 'image') {
                const prev = st.hsvFilter || { h: 0, s: 0, v: 0 };
                return {
                  ...st,
                  hsvFilter: {
                    h: (prev.h + hDelta + 360) % 360,
                    s: Math.max(-100, Math.min(200, prev.s + sDelta)),
                    v: Math.max(-100, Math.min(200, prev.v + vDelta))
                  }
                };
              }
              return {
                ...st,
                color: adjustHexHsv(st.color, hDelta, sDelta, vDelta)
              };
            });
          } else {
            updatedFrames[fNum] = strokes;
          }
        }
        return { ...l, frames: updatedFrames };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        hsvPreview: null
      };
    }),
  resetView: () => set({ zoom: 0.55, panX: 0, panY: 0, rotation: 0, flipX: false }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setPerspectiveMode: (perspectiveMode) => set({ perspectiveMode }),
  toggleCameraFrame: () => set((s) => ({ showCameraFrame: !s.showCameraFrame })),
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
  prevFrame: () =>
    set((s) => ({
      currentFrame: s.currentFrame <= 1 ? (s.loopPlayback ? s.totalFrames : 1) : s.currentFrame - 1
    })),
  setFps: (fps) => set({ fps: Math.max(1, Math.min(120, fps)) }),
  setTotalFrames: (totalFrames) =>
    set((s) => {
      const clamped = Math.max(1, Math.min(1000, totalFrames));
      return {
        totalFrames: clamped,
        playEnd: Math.min(s.playEnd, clamped),
        playStart: Math.min(s.playStart, clamped),
        currentFrame: Math.min(s.currentFrame, clamped)
      };
    }),
  setPlayRange: (start, end) =>
    set((s) => {
      const clampedStart = Math.max(1, Math.min(s.totalFrames, start));
      const clampedEnd = Math.max(clampedStart, Math.min(s.totalFrames, end));
      return { playStart: clampedStart, playEnd: clampedEnd };
    }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
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
        activeColor: hex
      };
    }),
  updateSwatch: (id, hex, name) =>
    set((s) => ({
      activeColor: hex,
      swatches: s.swatches.map((sw) =>
        sw.id === id ? { ...sw, hex, name: name ?? sw.name } : sw
      )
    })),
  deleteSwatch: (id) =>
    set((s) => {
      if (s.swatches.length <= 1) return s;
      const remaining = s.swatches.filter((sw) => sw.id !== id);
      return {
        swatches: remaining,
        activeSwatchId: s.activeSwatchId === id ? remaining[0].id : s.activeSwatchId
      };
    }),

  addLayer: (name) =>
    set((s) => {
      const idx = s.layers.length + 1;
      const colors = ['#4f9cf9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];
      const newLayer: DrawingLayer = {
        id: `layer-${Date.now()}`,
        name: name || `Drawing_${idx}`,
        type: 'drawing',
        visible: true,
        locked: false,
        solo: false,
        opacity: 1,
        tagColor: colors[idx % colors.length],
        frames: { [s.currentFrame]: [] },
        nodeX: 120 + (idx - 1) * 180,
        nodeY: 110
      };
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: [newLayer, ...s.layers],
        activeLayerId: newLayer.id,
        selectedLayerIds: [newLayer.id],
        isDirty: true
      };
    }),

  addFolderLayer: (name) =>
    set((s) => {
      const folder: DrawingLayer = {
        id: `folder-${Date.now()}`,
        name: name || `Folder_${s.layers.length + 1}`,
        type: 'folder',
        visible: true,
        locked: false,
        solo: false,
        collapsed: false,
        opacity: 1,
        tagColor: '#eab308',
        frames: {},
        nodeX: 120,
        nodeY: 80
      };
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: [folder, ...s.layers],
        activeLayerId: folder.id,
        selectedLayerIds: [folder.id],
        isDirty: true
      };
    }),

  duplicateLayer: (id) =>
    set((s) => {
      const idx = s.layers.findIndex((l) => l.id === id);
      if (idx === -1) return s;
      const orig = s.layers[idx];
      const copy: DrawingLayer = {
        ...JSON.parse(JSON.stringify(orig)),
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: `${orig.name}_Copy`
      };
      const next = [...s.layers];
      next.splice(idx, 0, copy);
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: next,
        activeLayerId: copy.id,
        selectedLayerIds: [copy.id],
        isDirty: true
      };
    }),

  mergeLayerDown: (id) =>
    set((s) => {
      const idx = s.layers.findIndex((l) => l.id === id);
      if (idx === -1 || idx >= s.layers.length - 1) return s;
      const top = s.layers[idx];
      const bottom = s.layers[idx + 1];
      const mergedFrames: Record<number, Stroke[]> = JSON.parse(JSON.stringify(bottom.frames));
      for (const [fKey, strokes] of Object.entries(top.frames)) {
        const f = Number(fKey);
        mergedFrames[f] = [...(mergedFrames[f] || []), ...JSON.parse(JSON.stringify(strokes))];
      }
      const next = s.layers
        .map((l, i) => (i === idx + 1 ? { ...l, frames: mergedFrames } : l))
        .filter((_, i) => i !== idx);
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: next,
        activeLayerId: bottom.id,
        selectedLayerIds: [bottom.id],
        isDirty: true
      };
    }),

  importImageLayer: (name, dataUrl, x, y, w, h, opacity = 1) =>
    set((s) => {
      const idx = s.layers.length + 1;
      const colors = ['#4f9cf9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];
      const imgStroke: Stroke = {
        id: `st-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: 'image',
        artLayer: 'LA',
        swatchId: 'sw-black',
        color: '#ffffff',
        size: 1,
        opacity: 1,
        smoothing: 0,
        points: [{ x, y }],
        imageDataUrl: dataUrl,
        imageX: x,
        imageY: y,
        imageW: w,
        imageH: h
      };
      const newLayer: DrawingLayer = {
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: name || `Imported_${idx}`,
        type: 'drawing',
        visible: true,
        locked: false,
        solo: false,
        holdFrames: true,
        opacity,
        tagColor: colors[idx % colors.length],
        frames: { [s.currentFrame]: [imgStroke] },
        nodeX: 120 + (idx - 1) * 160,
        nodeY: 110
      };
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: [newLayer, ...s.layers],
        activeLayerId: newLayer.id,
        selectedLayerIds: [newLayer.id],
        isDirty: true
      };
    }),

  deleteLayer: (id) =>
    set((s) => {
      if (s.layers.length <= 1) return s;
      const remaining = s.layers.filter((l) => l.id !== id);
      const nextActive = s.activeLayerId === id ? remaining[0].id : s.activeLayerId;
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: remaining,
        activeLayerId: nextActive,
        selectedLayerIds: [nextActive],
        isDirty: true
      };
    }),

  deleteSelectedLayers: () =>
    set((s) => {
      const targetIds = new Set(s.selectedLayerIds.length > 0 ? s.selectedLayerIds : [s.activeLayerId]);
      const remaining = s.layers.filter((l) => !targetIds.has(l.id));
      if (remaining.length === 0) {
        // Keep at least one layer (the last one) so scene is never empty
        const kept = s.layers[s.layers.length - 1];
        if (!kept || s.layers.length <= 1) return s;
        return {
          undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
          redoStack: [],
          layers: [kept],
          activeLayerId: kept.id,
          selectedLayerIds: [kept.id],
          isDirty: true
        };
      }
      const nextActive = targetIds.has(s.activeLayerId) ? remaining[0].id : s.activeLayerId;
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: remaining,
        activeLayerId: nextActive,
        selectedLayerIds: [nextActive],
        isDirty: true
      };
    }),

  setActiveLayer: (activeLayerId) => set({ activeLayerId, selectedLayerIds: [activeLayerId] }),
  toggleSelectLayer: (id, multi, range = false) =>
    set((s) => {
      if (range) {
        const anchorIdx = s.layers.findIndex((l) => l.id === s.activeLayerId);
        const targetIdx = s.layers.findIndex((l) => l.id === id);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          const rangeIds = s.layers.slice(start, end + 1).map((l) => l.id);
          return { activeLayerId: id, selectedLayerIds: rangeIds };
        }
      }
      if (!multi) {
        return { activeLayerId: id, selectedLayerIds: [id] };
      }
      const exists = s.selectedLayerIds.includes(id);
      const next = exists
        ? s.selectedLayerIds.length > 1
          ? s.selectedLayerIds.filter((x) => x !== id)
          : s.selectedLayerIds
        : [...s.selectedLayerIds, id];
      return { activeLayerId: id, selectedLayerIds: next };
    }),
  reorderLayer: (fromIndex, toIndex) =>
    set((s) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= s.layers.length || toIndex >= s.layers.length) {
        return s;
      }
      const next = [...s.layers];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { layers: next };
    }),
  setLayerBlendMode: (id, blendMode) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, blendMode } : l))
    })),
  toggleLayerVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    })),
  toggleLayerLock: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l))
    })),
  toggleLayerSolo: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, solo: !l.solo } : l))
    })),
  toggleFolderCollapse: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, collapsed: !l.collapsed } : l))
    })),
  setLayerParent: (id, parentId) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id && l.id !== parentId ? { ...l, parentId } : l)),
      isDirty: true
    })),
  setCelDuration: (layerId, startFrame, duration) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== layerId) return l;
        return {
          ...l,
          celDurations: {
            ...(l.celDurations || {}),
            [startFrame]: Math.max(1, Math.min(200, Math.round(duration)))
          }
        };
      }),
      isDirty: true
    })),
  moveCelFrame: (layerId, fromFrame, toFrame) =>
    set((s) => {
      if (fromFrame === toFrame || toFrame < 1 || toFrame > s.totalFrames) return s;
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const srcStrokes = l.frames[fromFrame];
        if (!srcStrokes) return l;
        const nextFrames = { ...l.frames };
        delete nextFrames[fromFrame];
        nextFrames[toFrame] = srcStrokes;

        const nextDur = { ...(l.celDurations || {}) };
        if (nextDur[fromFrame]) {
          nextDur[toFrame] = nextDur[fromFrame];
          delete nextDur[fromFrame];
        }
        const nextTags = { ...(l.frameTags || {}) };
        if (nextTags[fromFrame]) {
          nextTags[toFrame] = nextTags[fromFrame];
          delete nextTags[fromFrame];
        }
        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        currentFrame: toFrame,
        isDirty: true
      };
    }),
  substituteCel: (layerId, targetFrame, sourceFrame) =>
    set((s) => {
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const src = l.frames[sourceFrame];
        if (!src) return l;
        return {
          ...l,
          frames: {
            ...l.frames,
            [targetFrame]: JSON.parse(JSON.stringify(src))
          }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  setFrameTag: (layerId, frame, tag) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const next = { ...(l.frameTags || {}) };
        if (tag === null) delete next[frame];
        else next[frame] = tag;
        return { ...l, frameTags: next };
      }),
      isDirty: true
    })),
  setTimelineMarker: (frame, label) =>
    set((s) => {
      const next = { ...s.timelineMarkers };
      if (!label || !label.trim()) delete next[frame];
      else next[frame] = label.trim();
      return { timelineMarkers: next, isDirty: true };
    }),
  setTimelineCellWidth: (w) =>
    set({ timelineCellWidth: Math.max(12, Math.min(44, Math.round(w))) }),
  reverseFrameRange: (layerId, startFrame, endFrame) =>
    set((s) => {
      const a = Math.min(startFrame, endFrame);
      const b = Math.max(startFrame, endFrame);
      if (a === b) return s;
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const nextFrames = { ...l.frames };
        const slice: (Stroke[] | undefined)[] = [];
        for (let f = a; f <= b; f++) {
          slice.push(l.frames[f]);
          delete nextFrames[f];
        }
        slice.reverse();
        for (let i = 0; i < slice.length; i++) {
          if (slice[i] !== undefined) nextFrames[a + i] = slice[i]!;
        }
        return { ...l, frames: nextFrames };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  deleteFrameRange: (layerId, startFrame, endFrame) =>
    set((s) => {
      const a = Math.min(startFrame, endFrame);
      const b = Math.max(startFrame, endFrame);
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const nextFrames = { ...l.frames };
        const nextDur = { ...(l.celDurations || {}) };
        const nextTags = { ...(l.frameTags || {}) };
        for (let f = a; f <= b; f++) {
          delete nextFrames[f];
          delete nextDur[f];
          delete nextTags[f];
        }
        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  moveFrameRange: (layerId, startFrame, endFrame, delta) =>
    set((s) => {
      if (delta === 0) return s;
      const a = Math.min(startFrame, endFrame);
      const b = Math.max(startFrame, endFrame);
      if (a + delta < 1 || b + delta > s.totalFrames) return s;
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const nextFrames = { ...l.frames };
        const temp: Record<number, Stroke[]> = {};
        for (let f = a; f <= b; f++) {
          if (l.frames[f] !== undefined) {
            temp[f + delta] = l.frames[f];
            delete nextFrames[f];
          }
        }
        for (const [k, v] of Object.entries(temp)) {
          nextFrames[Number(k)] = v;
        }
        return { ...l, frames: nextFrames };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  toggleLayerHold: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, holdFrames: !l.holdFrames } : l)),
      isDirty: true
    })),
  toggleLayerAlphaLock: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, alphaLock: !l.alphaLock } : l)),
      isDirty: true
    })),
  toggleLayerClippingMask: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, clippingMask: !l.clippingMask } : l)),
      isDirty: true
    })),
  setLayerEffects: (id, effects) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id
          ? {
              ...l,
              effects: {
                blur: l.effects?.blur ?? 0,
                glow: l.effects?.glow ?? 0,
                glowColor: l.effects?.glowColor ?? '#38bdf8',
                dropShadow: l.effects?.dropShadow ?? false,
                ...effects
              }
            }
          : l
      ),
      isDirty: true
    })),
  setLayerKeyframe: (id, frame, kf) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== id) return l;
        const prev = l.keyframes?.[frame] || { x: 0, y: 0, scale: 1, rotation: 0, opacity: l.opacity };
        return {
          ...l,
          keyframes: {
            ...(l.keyframes || {}),
            [frame]: { ...prev, ...kf }
          }
        };
      }),
      isDirty: true
    })),
  deleteLayerKeyframe: (id, frame) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== id || !l.keyframes) return l;
        const copy = { ...l.keyframes };
        delete copy[frame];
        return { ...l, keyframes: copy };
      }),
      isDirty: true
    })),
  toggleSymmetry: () =>
    set((s) => ({ symmetryMode: s.symmetryMode === 'none' ? 'vertical' : 'none' })),
  setClipboardStrokes: (clipboardStrokes) => set({ clipboardStrokes }),
  copyCurrentFrame: () =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === s.activeLayerId);
      const strokes = layer?.frames[s.currentFrame] || [];
      return { clipboardStrokes: JSON.parse(JSON.stringify(strokes)) };
    }),
  pasteToCurrentFrame: () =>
    set((s) => {
      if (s.clipboardStrokes.length === 0) return s;
      const snapshot = { layers: cloneLayers(s.layers) };
      const pasted = s.clipboardStrokes.map((st) => ({
        ...JSON.parse(JSON.stringify(st)),
        id: `st-paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      }));
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const existing = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: { ...l.frames, [s.currentFrame]: [...existing, ...pasted] }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  extendExposureF5: () => {
    // Same as inserting a held/blank exposure shift right after current frame
    get().insertFrameAfterCurrent();
  },
  reduceExposureShiftF5: () =>
    set((s) => {
      const removeAt = s.currentFrame;
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const shifted: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          const fNum = Number(fKey);
          if (fNum < removeAt) shifted[fNum] = strokes;
          else if (fNum > removeAt) shifted[fNum - 1] = strokes;
        }
        return { ...l, frames: shifted };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  setAudioTrack: (audioTrack) => set({ audioTrack }),
  renameLayer: (id, name) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l))
    })),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l))
    })),
  setSelectedLayersOpacity: (opacity) =>
    set((s) => {
      const targetSet = new Set(s.selectedLayerIds.length > 0 ? s.selectedLayerIds : [s.activeLayerId]);
      return {
        layers: s.layers.map((l) => (targetSet.has(l.id) ? { ...l, opacity } : l))
      };
    }),
  updateNodePosition: (id, nodeX, nodeY) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, nodeX, nodeY } : l))
    })),

  addStroke: (stroke, insertAtBottom = false) =>
    set((s) => {
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked) return s;
      const finalStroke: Stroke =
        targetLayer.alphaLock && stroke.tool !== 'eraser' && stroke.tool !== 'erase_poly'
          ? { ...stroke, alphaLock: true }
          : stroke;
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const existing = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: insertAtBottom ? [finalStroke, ...existing] : [...existing, finalStroke]
          }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),

  moveStrokes: (strokeIds, dx, dy) =>
    set((s) => {
      if (strokeIds.length === 0 || (dx === 0 && dy === 0)) return s;
      const idSet = new Set(strokeIds);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const existing = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: existing.map((st) =>
              idSet.has(st.id)
                ? {
                    ...st,
                    points: st.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy }))
                  }
                : st
            )
          }
        };
      });
      return { layers };
    }),

  replaceStrokes: (updated) =>
    set((s) => {
      if (updated.length === 0) return s;
      const map = new Map(updated.map((st) => [st.id, st]));
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const existing = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: existing.map((st) => map.get(st.id) || st)
          }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),

  deleteStrokes: (strokeIds) =>
    set((s) => {
      if (strokeIds.length === 0) return s;
      const idSet = new Set(strokeIds);
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const existing = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: existing.filter((st) => !idSet.has(st.id))
          }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),

  toggleTimelapseRecording: () => set((s) => ({ timelapseRecording: !s.timelapseRecording })),
  setTimelapseRootDir: (timelapseRootDir) => set({ timelapseRootDir }),
  setPerformanceMode: (performanceMode) => set({ performanceMode }),
  pushTimelapseFrame: (dataUrl) =>
    set((s) => ({
      timelapseFrames: [...s.timelapseFrames.slice(-1499), dataUrl]
    })),
  clearTimelapse: () => set({ timelapseFrames: [] }),

  insertFrameAfterCurrent: () =>
    set((s) => {
      const activeLayer = s.layers.find((l) => l.id === s.activeLayerId);
      const snapshot = { layers: cloneLayers(s.layers) };

      // If current frame has no frame yet on this layer, create it right here without shifting!
      if (activeLayer && activeLayer.frames[s.currentFrame] === undefined) {
        const layers = s.layers.map((l) =>
          l.id === s.activeLayerId
            ? { ...l, frames: { ...l.frames, [s.currentFrame]: [] } }
            : l
        );
        return {
          undoStack: [...s.undoStack.slice(-39), snapshot],
          redoStack: [],
          layers,
          isDirty: true
        };
      }

      const insertAt = s.currentFrame + 1;
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const shifted: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          const fNum = Number(fKey);
          if (fNum >= insertAt) {
            shifted[fNum + 1] = strokes;
          } else {
            shifted[fNum] = strokes;
          }
        }
        shifted[insertAt] = [];
        return { ...l, frames: shifted };
      });
      const newTotal = Math.max(s.totalFrames, insertAt + 1);
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        totalFrames: newTotal,
        playEnd: Math.max(s.playEnd, insertAt),
        currentFrame: insertAt,
        isDirty: true
      };
    }),

  clearCurrentFrame: () =>
    set((s) => {
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: []
          }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),

  duplicateFrameToNext: () =>
    set((s) => {
      const next = Math.min(s.totalFrames, s.currentFrame + 1);
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const curr = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: {
            ...l.frames,
            [next]: JSON.parse(JSON.stringify(curr))
          }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        currentFrame: next
      };
    }),

  undo: () =>
    set((s) => {
      if (s.undoStack.length === 0) return s;
      const prev = s.undoStack[s.undoStack.length - 1];
      return {
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, { layers: cloneLayers(s.layers) }],
        layers: prev.layers
      };
    }),

  redo: () =>
    set((s) => {
      if (s.redoStack.length === 0) return s;
      const next = s.redoStack[s.redoStack.length - 1];
      return {
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, { layers: cloneLayers(s.layers) }],
        layers: next.layers
      };
    }),

  setProjectMeta: (projectName, projectPath) =>
    set((s) => ({
      projectName,
      projectPath,
      isDirty: false,
      openScenes: s.openScenes.map((sc) =>
        sc.id === s.activeSceneId ? { ...sc, name: projectName, path: projectPath } : sc
      )
    })),
  setAutoSaveEnabled: (autoSaveEnabled) => set({ autoSaveEnabled }),
  setAutoSaveIntervalSec: (sec) => set({ autoSaveIntervalSec: Math.max(5, Math.min(3600, Math.round(sec))) }),
  setLastAutoSaveTime: (lastAutoSaveTime) => set({ lastAutoSaveTime }),

  exportProjectData: () => {
    const s = get();
    return {
      version: '27.1.0',
      name: s.projectName,
      width: s.canvasWidth,
      height: s.canvasHeight,
      fps: s.fps,
      totalFrames: s.totalFrames,
      swatches: s.swatches,
      layers: s.layers
    };
  },

  loadProjectData: (data, filePath) =>
    set((s) => {
      // If already open in a tab, just switch to it!
      if (filePath) {
        const existing = s.openScenes.find((sc) => sc.path === filePath);
        if (existing) {
          return {
            activeSceneId: existing.id,
            projectName: existing.name,
            projectPath: existing.path,
            canvasWidth: existing.width,
            canvasHeight: existing.height,
            fps: existing.fps,
            totalFrames: existing.totalFrames,
            playStart: existing.playStart,
            playEnd: existing.playEnd,
            currentFrame: existing.currentFrame,
            layers: existing.layers,
            activeLayerId: existing.activeLayerId,
            selectedLayerIds: existing.selectedLayerIds,
            swatches: existing.swatches,
            activeSwatchId: existing.activeSwatchId,
            showWelcome: false
          };
        }
      }

      const synced = s.openScenes.map((sc) =>
        sc.id === s.activeSceneId
          ? {
              ...sc,
              name: s.projectName,
              path: s.projectPath,
              width: s.canvasWidth,
              height: s.canvasHeight,
              fps: s.fps,
              totalFrames: s.totalFrames,
              playStart: s.playStart,
              playEnd: s.playEnd,
              currentFrame: s.currentFrame,
              layers: s.layers,
              activeLayerId: s.activeLayerId,
              selectedLayerIds: s.selectedLayerIds,
              swatches: s.swatches,
              activeSwatchId: s.activeSwatchId
            }
          : sc
      );

      const id = `scene-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const loadedLayers = data.layers?.length ? data.layers : createDefaultLayers();
      const loadedSwatches = data.swatches?.length ? data.swatches : DEFAULT_SWATCHES;
      const total = data.totalFrames || 60;
      const newTab: SceneTab = {
        id,
        name: data.name || 'Loaded_Scene',
        path: filePath,
        width: data.width || 1920,
        height: data.height || 1080,
        fps: data.fps || 24,
        totalFrames: total,
        playStart: 1,
        playEnd: total,
        currentFrame: 1,
        layers: loadedLayers,
        activeLayerId: loadedLayers[0].id,
        selectedLayerIds: [loadedLayers[0].id],
        swatches: loadedSwatches,
        activeSwatchId: loadedSwatches[0].id
      };

      return {
        openScenes: [...synced, newTab],
        activeSceneId: id,
        projectName: newTab.name,
        projectPath: filePath,
        canvasWidth: newTab.width,
        canvasHeight: newTab.height,
        fps: newTab.fps,
        totalFrames: total,
        playStart: 1,
        playEnd: total,
        currentFrame: 1,
        swatches: loadedSwatches,
        activeSwatchId: loadedSwatches[0].id,
        layers: loadedLayers,
        activeLayerId: loadedLayers[0].id,
        selectedLayerIds: [loadedLayers[0].id],
        undoStack: [],
        redoStack: [],
        showWelcome: false
      };
    }),

  newProject: () =>
    set({
      projectName: 'Untitled_Scene',
      projectPath: null,
      currentFrame: 1,
      isPlaying: false,
      swatches: DEFAULT_SWATCHES,
      activeSwatchId: 'sw-black',
      layers: createDefaultLayers(),
      activeLayerId: 'layer-1',
      undoStack: [],
      redoStack: []
    })
}));

// Automatically persist user preferences to localStorage (debounced 250ms)
let prefsSaveTimer: number | null = null;
useHarmonyStore.subscribe((s) => {
  if (prefsSaveTimer) window.clearTimeout(prefsSaveTimer);
  prefsSaveTimer = window.setTimeout(() => {
    try {
      const prefs = {
        onionSkin: s.onionSkin,
        onionPrev: s.onionPrev,
        onionNext: s.onionNext,
        brushSmoothing: s.brushSmoothing,
        brushSize: s.brushSize,
        brushMinSize: s.brushMinSize,
        brushOpacity: s.brushOpacity,
        usePressure: s.usePressure,
        activeBrushPreset: s.activeBrushPreset,
        activeColor: s.activeColor,
        secondaryColor: s.secondaryColor,
        recentColors: s.recentColors,
        lastSelectionTool: s.lastSelectionTool,
        lastShapeTool: s.lastShapeTool,
        shapeFilled: s.shapeFilled,
        bucketReference: s.bucketReference,
        bucketTolerance: s.bucketTolerance,
        bucketExpand: s.bucketExpand,
        bucketBehind: s.bucketBehind,
        showGrid: s.showGrid,
        showCameraFrame: s.showCameraFrame,
        lightTable: s.lightTable,
        loopPlayback: s.loopPlayback,
        timelineCellWidth: s.timelineCellWidth,
        autoSaveEnabled: s.autoSaveEnabled,
        autoSaveIntervalSec: s.autoSaveIntervalSec,
        timelapseRootDir: s.timelapseRootDir,
        performanceMode: s.performanceMode
      };
      localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore storage quota errors
    }
  }, 250);
});
