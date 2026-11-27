import { create } from 'zustand';
import { buildWarmupLayers } from '../utils/warmupGenerator';
import { adjustHexHsl } from '../utils/hsvUtils';
import { adjustHexLevels, isNoopLevels, LevelsAdjustment } from '../utils/levelsUtils';
import { applyBlurToCanvas, BlurSettings, isNoopBlur } from '../utils/blurUtils';
import { DEFAULT_POST_PROCESS } from '../utils/postProcessUtils';
import { renderFrameToCanvas, renderStroke } from '../utils/canvasRenderer';
import { CAMERA_EFFECT_PRESETS, getInterpolatedCamera } from '../utils/cameraUtils';
import {
  ArtLayerId,
  BrushPresetId,
  CameraEffect,
  CameraEffectType,
  CameraKeyframe,
  ColourSwatch,
  DrawingLayer,
  HarmonyProjectData,
  KeyframeEasing,
  LayerEffects,
  LayerTransformKeyframe,
  Point,
  PoseTag,
  PostProcessSettings,
  Stroke,
  ToolId
} from '../types/harmony';

interface HistorySnapshot {
  layers: DrawingLayer[];
  activeLayerId?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface AudioTrackData {
  name: string;
  filePath?: string;
  objectUrl: string;
  peaks: number[];
  duration: number;
}

export interface SceneTab {
  id: string;
  name: string;
  path: string | null;
  isDirty: boolean;
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
  timelineMarkers: Record<number, string>;
  audioTrack: AudioTrackData | null;
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}

export interface ImportedLayerSpec {
  name: string;
  type?: 'drawing' | 'folder';
  parentName?: string;
  folderKey?: string;
  parentKey?: string;
  dataUrl?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  opacity?: number;
  blendMode?: GlobalCompositeOperation;
  visible?: boolean;
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
  audioTrack: AudioTrackData | null;
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
  eraserSize: number;
  eraserMinSize: number;
  eraserOpacity: number;
  eraserPreset: BrushPresetId;
  textFontFamily: string;
  textFontSize: number;
  textBold: boolean;
  textItalic: boolean;
  activeSelectionPoly: Point[] | null;
  activeSelectionPolys: Point[][] | null;
  activeSelectionInverted: boolean;
  invertSelectionTrigger: number;
  shapeFilled: boolean;
  gradientMode: 'linear' | 'radial';
  gradientToTransparent: boolean;
  bucketReference: 'all' | 'active';
  bucketTolerance: number;
  bucketExpand: number;
  bucketCloseGap: number;
  bucketBehind: boolean;
  liquifyMode: 'push' | 'expand' | 'pinch';
  liquifySize: number;
  liquifyStrength: number;
  referenceWindowOpen: boolean;

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
  hsvPreview: { h: number; s: number; v: number; allFrames: boolean; colorize?: boolean } | null;
  levelsModalOpen: boolean;
  levelsPreview: (LevelsAdjustment & { allFrames: boolean }) | null;
  blurModalOpen: boolean;
  blurPreview: (BlurSettings & { allFrames: boolean }) | null;
  postProcessModalOpen: boolean;
  postProcess: PostProcessSettings;
  exportModalOpen: boolean;
  cropMode: boolean;
  showGrid: boolean;
  perspectiveMode: 0 | 1 | 2 | 3 | 4;
  showCameraFrame: boolean;
  cameraViewMode: boolean;
  cameraGuides: boolean;
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
  setEraserSize: (size: number) => void;
  setEraserMinSize: (minPct: number) => void;
  setEraserOpacity: (opacity: number) => void;
  setEraserPreset: (preset: BrushPresetId) => void;
  setTextFontFamily: (family: string) => void;
  setTextFontSize: (size: number) => void;
  setTextBold: (bold: boolean) => void;
  setTextItalic: (italic: boolean) => void;
  setActiveSelectionPoly: (poly: Point[] | null, inverted?: boolean, polys?: Point[][] | null) => void;
  requestInvertSelection: () => void;
  setShapeFilled: (filled: boolean) => void;
  setGradientMode: (mode: 'linear' | 'radial') => void;
  setGradientToTransparent: (toTransparent: boolean) => void;
  setBucketReference: (ref: 'all' | 'active') => void;
  setBucketTolerance: (tol: number) => void;
  setBucketExpand: (px: number) => void;
  setBucketCloseGap: (px: number) => void;
  setBucketBehind: (behind: boolean) => void;
  setLiquifyMode: (mode: 'push' | 'expand' | 'pinch') => void;
  setLiquifySize: (size: number) => void;
  setLiquifyStrength: (strength: number) => void;
  toggleReferenceWindow: () => void;

  setZoom: (zoom: number) => void;
  setShowWelcome: (show: boolean) => void;
  createNewScene: (name: string, width: number, height: number, fps: number) => void;
  createWarmupScene: () => void;
  switchSceneTab: (id: string) => void;
  closeSceneTab: (id: string) => void;
  addBlankSceneTab: () => void;
  setPan: (x: number, y: number) => void;
  setRotation: (deg: number) => void;
  resetRotation: () => void;
  toggleFlipX: () => void;
  toggleGrayscaleMode: () => void;
  setHsvModalOpen: (open: boolean) => void;
  setHsvPreview: (preview: { h: number; s: number; v: number; allFrames: boolean; colorize?: boolean } | null) => void;
  setLevelsModalOpen: (open: boolean) => void;
  setLevelsPreview: (preview: (LevelsAdjustment & { allFrames: boolean }) | null) => void;
  applyLayerLevels: (adj: LevelsAdjustment, allFrames: boolean) => void;
  setBlurModalOpen: (open: boolean) => void;
  setBlurPreview: (preview: (BlurSettings & { allFrames: boolean }) | null) => void;
  applyLayerBlur: (cfg: BlurSettings, allFrames: boolean) => void;
  setPostProcessModalOpen: (open: boolean) => void;
  setPostProcess: (patch: Partial<PostProcessSettings>) => void;
  resetPostProcess: () => void;
  setExportModalOpen: (open: boolean) => void;
  setCropMode: (open: boolean) => void;
  resizeCanvas: (offsetX: number, offsetY: number, newWidth: number, newHeight: number) => void;
  applyLayerHsv: (hDelta: number, sDelta: number, vDelta: number, allFrames: boolean, colorize?: boolean) => void;
  resetView: () => void;
  toggleGrid: () => void;
  setPerspectiveMode: (mode: 0 | 1 | 2 | 3 | 4) => void;
  toggleCameraFrame: () => void;
  toggleCameraViewMode: () => void;
  setCameraViewMode: (enabled: boolean) => void;
  toggleCameraGuides: () => void;
  toggleLightTable: () => void;
  toggleOnionSkin: () => void;
  setOnionRange: (prev: number, next: number) => void;
  setCenterTab: (tab: 'camera' | 'drawing' | 'node') => void;
  setRightTab: (tab: 'properties' | 'colour' | 'brushes') => void;

  // Timeline
  setCurrentFrame: (frame: number) => void;
  nextFrame: () => void;
  prevFrame: () => void;
  jumpToNextDrawing: () => void;
  jumpToPrevDrawing: () => void;
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
  addCameraLayer: (name?: string) => void;
  setCameraKeyframe: (id: string, frame: number, kf: Partial<CameraKeyframe>, pushUndo?: boolean) => void;
  deleteCameraKeyframe: (id: string, frame: number) => void;
  moveCameraKeyframe: (id: string, fromFrame: number, toFrame: number) => void;
  applyCameraShake: (id: string, startFrame: number, durationFrames: number, intensityPx: number) => void;
  addCameraEffect: (layerId: string, type: CameraEffectType, startFrame?: number) => void;
  updateCameraEffect: (layerId: string, effectId: string, patch: Partial<CameraEffect>, pushUndo?: boolean) => void;
  removeCameraEffect: (layerId: string, effectId: string) => void;
  toggleCameraEffect: (layerId: string, effectId: string) => void;
  duplicateLayer: (id: string) => void;
  mergeLayerDown: (id: string) => void;
  importImageLayer: (name: string, dataUrl: string, x: number, y: number, w: number, h: number, opacity?: number) => void;
  importArtworkLayersBatch: (items: ImportedLayerSpec[]) => void;
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
  setAudioTrack: (track: AudioTrackData | null) => void;

  pushUndoSnapshot: () => void;
  addStroke: (stroke: Stroke, insertAtBottom?: boolean) => void;
  addStrokesBatch: (strokes: Stroke[], materializeHeld?: boolean, bypassAlphaLock?: boolean) => void;
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

// Structural-sharing snapshot: shares immutable Stroke[] arrays across all 40 Undo steps (~20-50x less RAM & instant!)
const cloneLayers = (layers: DrawingLayer[]): DrawingLayer[] =>
  layers.map((l) => ({
    ...l,
    frames: { ...l.frames },
    celDurations: l.celDurations ? { ...l.celDurations } : undefined,
    frameTags: l.frameTags ? { ...l.frameTags } : undefined,
    keyframes: l.keyframes ? { ...l.keyframes } : undefined,
    effects: l.effects ? { ...l.effects } : undefined
  }));

/**
 * Auto-split/trim any earlier stretched Cel that overlaps targetFrame:
 * e.g. Cel at F1 stretched 8f (1..8) -> creating a new Cel at F4 cleanly splits it into F1 (3f) + F4 (5f)!
 */
function splitCelDurationsAt(
  celDurations: Record<number, number> | undefined,
  targetFrame: number,
  inheritRemainder = true
): Record<number, number> {
  const next = { ...(celDurations || {}) };
  for (const [k, rawDur] of Object.entries(next)) {
    const start = Number(k);
    const dur = Math.max(1, rawDur || 1);
    const end = start + dur - 1;
    if (start < targetFrame && end >= targetFrame) {
      next[start] = Math.max(1, targetFrame - start);
      if (inheritRemainder && !next[targetFrame]) {
        const remainder = end - targetFrame + 1;
        if (remainder > 1) {
          next[targetFrame] = remainder;
        }
      }
    }
  }
  return next;
}

/**
 * Single source of truth for resolving which strokes are visible on `frame` for `layer`.
 * Explicit blank frames (`layer.frames[frame] = []`) stop earlier celDurations & holdFrames!
 */
export function resolveEffectiveStrokes(layer: DrawingLayer, frame: number): Stroke[] {
  if (layer.frames[frame] !== undefined) {
    return layer.frames[frame];
  }
  if (layer.celDurations) {
    let bestStart = -1;
    for (const [k, rawDur] of Object.entries(layer.celDurations)) {
      const start = Number(k);
      const dur = Math.max(1, rawDur || 1);
      if (start < frame && start + dur - 1 >= frame && layer.frames[start] !== undefined) {
        if (start > bestStart) bestStart = start;
      }
    }
    if (bestStart !== -1) {
      return layer.frames[bestStart] || [];
    }
  }
  if (layer.holdFrames) {
    for (let f = frame - 1; f >= 1; f--) {
      if (layer.frames[f] !== undefined) return layer.frames[f];
    }
  }
  return [];
}

function cloneStrokesWithNewIds(strokes: Stroke[], prefix = 'st-copy'): Stroke[] {
  const base = Date.now();
  return strokes.map((st, idx) => {
    const cloned: Stroke =
      typeof structuredClone === 'function' ? structuredClone(st) : JSON.parse(JSON.stringify(st));
    cloned.id = `${prefix}-${base}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    return cloned;
  });
}

function makeSnapshot(s: HarmonyState): HistorySnapshot {
  return {
    layers: cloneLayers(s.layers),
    activeLayerId: s.activeLayerId,
    canvasWidth: s.canvasWidth,
    canvasHeight: s.canvasHeight
  };
}

function syncActiveTabInList(s: HarmonyState): SceneTab[] {
  return s.openScenes.map((sc) =>
    sc.id === s.activeSceneId
      ? {
          ...sc,
          name: s.projectName,
          path: s.projectPath,
          isDirty: s.isDirty,
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
          activeSwatchId: s.activeSwatchId,
          timelineMarkers: s.timelineMarkers,
          audioTrack: s.audioTrack,
          undoStack: s.undoStack,
          redoStack: s.redoStack
        }
      : sc
  );
}

function findCoveringCelStart(layer: DrawingLayer, frame: number): number | null {
  if (layer.frames[frame] !== undefined) return frame;
  if (layer.celDurations) {
    let bestStart = -1;
    for (const [k, rawDur] of Object.entries(layer.celDurations)) {
      const start = Number(k);
      const dur = Math.max(1, rawDur || 1);
      if (start < frame && start + dur - 1 >= frame && layer.frames[start] !== undefined) {
        if (start > bestStart) bestStart = start;
      }
    }
    if (bestStart !== -1) return bestStart;
  }
  return null;
}

function shiftRecordKeys<T>(rec: Record<number, T> | undefined, fromFrame: number, delta: number): Record<number, T> {
  const out: Record<number, T> = {};
  if (!rec) return out;
  for (const [k, v] of Object.entries(rec)) {
    const f = Number(k);
    if (f >= fromFrame) {
      const nf = f + delta;
      if (nf >= 1) out[nf] = v;
    } else {
      out[f] = v;
    }
  }
  return out;
}

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
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
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
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: [folder, ...s.layers],
        activeLayerId: folder.id,
        selectedLayerIds: [folder.id],
        isDirty: true
      };
    }),

  addCameraLayer: (name) =>
    set((s) => {
      const existing = s.layers.find((l) => l.type === 'camera');
      if (existing) {
        return {
          activeLayerId: existing.id,
          selectedLayerIds: [existing.id],
          rightTab: 'properties',
          showCameraFrame: true
        };
      }
      const cam: DrawingLayer = {
        id: `camera-${Date.now()}`,
        name: name || 'Camera_2D',
        type: 'camera',
        visible: true,
        locked: false,
        solo: false,
        opacity: 1,
        tagColor: '#38bdf8',
        frames: {},
        cameraKeyframes: {
          1: { x: 0, y: 0, zoom: 1, rotation: 0, easing: 'ease-in-out' }
        },
        nodeX: 120,
        nodeY: 40
      };
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: [cam, ...s.layers],
        activeLayerId: cam.id,
        selectedLayerIds: [cam.id],
        rightTab: 'properties',
        showCameraFrame: true,
        isDirty: true
      };
    }),

  setCameraKeyframe: (id, frame, kf, pushUndo = true) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === id && l.type === 'camera');
      if (!target || target.locked) return s;
      const cur = getInterpolatedCamera(target, frame, false);
      const nextKf: CameraKeyframe = {
        x: Math.round((kf.x ?? cur.x) * 10) / 10,
        y: Math.round((kf.y ?? cur.y) * 10) / 10,
        zoom: Math.max(0.2, Math.min(8, Math.round((kf.zoom ?? cur.zoom) * 1000) / 1000)),
        rotation: Math.max(-360, Math.min(360, Math.round((kf.rotation ?? cur.rotation) * 10) / 10)),
        easing: (kf.easing ?? cur.easing ?? 'ease-in-out') as KeyframeEasing
      };
      const layers = s.layers.map((l) =>
        l.id === id
          ? {
              ...l,
              cameraKeyframes: {
                ...(l.cameraKeyframes || {}),
                [frame]: nextKf
              }
            }
          : l
      );
      return {
        ...(pushUndo ? { undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)], redoStack: [] } : {}),
        layers,
        isDirty: true
      };
    }),

  deleteCameraKeyframe: (id, frame) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === id && l.type === 'camera');
      if (!target || target.locked || !target.cameraKeyframes?.[frame]) return s;
      const nextKfs = { ...target.cameraKeyframes };
      delete nextKfs[frame];
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: s.layers.map((l) => (l.id === id ? { ...l, cameraKeyframes: nextKfs } : l)),
        isDirty: true
      };
    }),

  moveCameraKeyframe: (id, fromFrame, toFrame) =>
    set((s) => {
      if (fromFrame === toFrame || toFrame < 1 || toFrame > s.totalFrames) return s;
      const target = s.layers.find((l) => l.id === id && l.type === 'camera');
      if (!target || target.locked || !target.cameraKeyframes?.[fromFrame]) return s;
      const nextKfs = { ...target.cameraKeyframes };
      const data = nextKfs[fromFrame];
      delete nextKfs[fromFrame];
      nextKfs[toFrame] = data;
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: s.layers.map((l) => (l.id === id ? { ...l, cameraKeyframes: nextKfs } : l)),
        isDirty: true
      };
    }),

  applyCameraShake: (id, startFrame, durationFrames, intensityPx) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === id && l.type === 'camera');
      if (!target || target.locked) return s;
      const dur = Math.max(2, Math.min(48, Math.round(durationFrames)));
      const amp = Math.max(2, Math.min(200, intensityPx));
      const base = getInterpolatedCamera(target, startFrame);
      const nextKfs = { ...(target.cameraKeyframes || {}) };
      // Deterministic damped impact shake returning cleanly to exact baseline!
      for (let i = 0; i <= dur; i++) {
        const f = startFrame + i;
        if (f > s.totalFrames) break;
        if (i === dur) {
          nextKfs[f] = {
            x: Math.round(base.x * 10) / 10,
            y: Math.round(base.y * 10) / 10,
            zoom: base.zoom,
            rotation: base.rotation,
            easing: 'ease-out'
          };
        } else {
          const decay = Math.pow(1 - i / dur, 1.45);
          const signX = i % 2 === 0 ? 1 : -1;
          const signY = (i + 1) % 3 === 0 ? -1 : 1;
          const jitterX = Math.sin(i * 2.7 + 0.5) * 0.45 + 0.55;
          const jitterY = Math.cos(i * 3.1 + 1.1) * 0.5 + 0.5;
          nextKfs[f] = {
            x: Math.round((base.x + signX * amp * decay * jitterX) * 10) / 10,
            y: Math.round((base.y + signY * amp * 0.72 * decay * jitterY) * 10) / 10,
            zoom: base.zoom,
            rotation: Math.round((base.rotation + signX * Math.min(3.5, amp * 0.04) * decay) * 10) / 10,
            easing: 'linear'
          };
        }
      }
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: s.layers.map((l) => (l.id === id ? { ...l, cameraKeyframes: nextKfs } : l)),
        isDirty: true
      };
    }),

  addCameraEffect: (layerId, type, startFrame) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === layerId && l.type === 'camera');
      if (!target || target.locked) return s;
      const meta = CAMERA_EFFECT_PRESETS.find((p) => p.type === type) || CAMERA_EFFECT_PRESETS[0];
      const fx: CameraEffect = {
        id: `camfx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type: meta.type,
        name: meta.label,
        enabled: true,
        startFrame: Math.max(1, Math.min(s.totalFrames, startFrame ?? s.currentFrame)),
        duration: meta.defaultDuration,
        wholeScene: meta.defaultWholeScene,
        intensity: meta.defaultIntensity,
        speed: meta.defaultSpeed,
        seed: Math.floor(Math.random() * 1000) + 1
      };
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: s.layers.map((l) =>
          l.id === layerId ? { ...l, cameraEffects: [...(l.cameraEffects || []), fx] } : l
        ),
        isDirty: true
      };
    }),

  updateCameraEffect: (layerId, effectId, patch, pushUndo = false) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === layerId && l.type === 'camera');
      if (!target || target.locked) return s;
      return {
        ...(pushUndo ? { undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)], redoStack: [] } : {}),
        layers: s.layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                cameraEffects: (l.cameraEffects || []).map((fx) =>
                  fx.id === effectId ? { ...fx, ...patch } : fx
                )
              }
            : l
        ),
        isDirty: true
      };
    }),

  removeCameraEffect: (layerId, effectId) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === layerId && l.type === 'camera');
      if (!target || target.locked) return s;
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: s.layers.map((l) =>
          l.id === layerId
            ? { ...l, cameraEffects: (l.cameraEffects || []).filter((fx) => fx.id !== effectId) }
            : l
        ),
        isDirty: true
      };
    }),

  toggleCameraEffect: (layerId, effectId) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === layerId && l.type === 'camera');
      if (!target || target.locked) return s;
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: s.layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                cameraEffects: (l.cameraEffects || []).map((fx) =>
                  fx.id === effectId ? { ...fx, enabled: !fx.enabled } : fx
                )
              }
            : l
        ),
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
        id: `${orig.type === 'folder' ? 'folder' : 'layer'}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: `${orig.name}_Copy`
      };
      const next = [...s.layers];
      next.splice(idx, 0, copy);
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
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
      // Prevent merging folders, cameras, or locked layers
      if (
        top.type === 'folder' ||
        bottom.type === 'folder' ||
        top.type === 'camera' ||
        bottom.type === 'camera' ||
        top.locked ||
        bottom.locked
      ) {
        return s;
      }

      // Check if safe vector append is possible or if raster compositing is required
      // (erasers, alphaLock, clippingMask, blendMode, opacity < 1, effects, or keyframes require pixel compositing so top erasers never erase bottom!)
      const topHasDestructiveOrMasked =
        Boolean(top.clippingMask) ||
        top.opacity < 0.999 ||
        Boolean(top.blendMode && top.blendMode !== 'source-over') ||
        Boolean(top.effects && (top.effects.blur > 0 || top.effects.glow > 0 || top.effects.dropShadow)) ||
        Boolean(top.keyframes && Object.keys(top.keyframes).length > 0) ||
        Object.values(top.frames).some((sts) =>
          sts.some((st) => st.tool === 'eraser' || st.tool === 'erase_poly' || st.alphaLock)
        );

      let mergedFrames: Record<number, Stroke[]>;
      let mergedDur: Record<number, number>;

      if (topHasDestructiveOrMasked && typeof document !== 'undefined') {
        const frameSet = new Set<number>();
        for (const k of Object.keys(bottom.frames)) frameSet.add(Number(k));
        for (const k of Object.keys(top.frames)) frameSet.add(Number(k));
        const sortedFrames = Array.from(frameSet).sort((a, b) => a - b);
        const compCanvas = document.createElement('canvas');
        compCanvas.width = s.canvasWidth;
        compCanvas.height = s.canvasHeight;
        // Render strictly [top, bottom] with bottom at 100% opacity (so bottom.opacity isn't double-applied!)
        const pairLayers: DrawingLayer[] = [
          { ...top, visible: true, parentId: null },
          { ...bottom, visible: true, parentId: null, opacity: 1 }
        ];
        mergedFrames = {};
        for (const f of sortedFrames) {
          const topEff = resolveEffectiveStrokes(top, f);
          const botEff = resolveEffectiveStrokes(bottom, f);
          if (topEff.length === 0 && botEff.length === 0) {
            mergedFrames[f] = [];
            continue;
          }
          renderFrameToCanvas(compCanvas, pairLayers, f, s.canvasWidth, s.canvasHeight, 'transparent', false);
          mergedFrames[f] = [
            {
              id: `st-mrg-${Date.now()}-${f}-${Math.random().toString(36).slice(2, 5)}`,
              tool: 'image',
              artLayer: 'LA',
              swatchId: 'sw-black',
              color: '#ffffff',
              size: 1,
              opacity: 1,
              smoothing: 0,
              points: [{ x: 0, y: 0 }],
              imageDataUrl: compCanvas.toDataURL('image/png'),
              imageX: 0,
              imageY: 0,
              imageW: s.canvasWidth,
              imageH: s.canvasHeight
            }
          ];
        }
        mergedDur = { ...(bottom.celDurations || {}) };
        for (const [k, d] of Object.entries(top.celDurations || {})) {
          const f = Number(k);
          mergedDur[f] = Math.max(mergedDur[f] || 1, d);
        }
      } else {
        mergedFrames = cloneLayers([bottom])[0].frames;
        for (const [fKey, strokes] of Object.entries(top.frames)) {
          const f = Number(fKey);
          const botBase =
            mergedFrames[f] !== undefined
              ? mergedFrames[f]
              : cloneStrokesWithNewIds(resolveEffectiveStrokes(bottom, f), 'st-mrg-b');
          const clonedTop = cloneStrokesWithNewIds(strokes, 'st-mrg');
          mergedFrames[f] = [...botBase, ...clonedTop];
        }
        mergedDur = { ...(bottom.celDurations || {}) };
        for (const [k, d] of Object.entries(top.celDurations || {})) {
          const f = Number(k);
          mergedDur[f] = Math.max(mergedDur[f] || 1, d);
        }
      }

      const next = s.layers
        .map((l, i) => (i === idx + 1 ? { ...l, frames: mergedFrames, celDurations: mergedDur } : l))
        .filter((_, i) => i !== idx);
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
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
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: [newLayer, ...s.layers],
        activeLayerId: newLayer.id,
        selectedLayerIds: [newLayer.id],
        isDirty: true
      };
    }),

  importArtworkLayersBatch: (items) =>
    set((s) => {
      if (!items || items.length === 0) return s;
      const colors = ['#4f9cf9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];
      const now = Date.now();
      const created: DrawingLayer[] = [];
      const folderIdByKey = new Map<string, string>();
      const folderIdByName = new Map<string, string>();
      items.forEach((item, i) => {
        const lid = `${item.type === 'folder' ? 'folder' : 'layer'}-${now}-${i}-${Math.random().toString(36).slice(2, 5)}`;
        const resolvedParentId = item.parentKey
          ? folderIdByKey.get(item.parentKey) || null
          : item.parentName
            ? folderIdByName.get(item.parentName) || null
            : null;
        if (item.type === 'folder') {
          if (item.folderKey) folderIdByKey.set(item.folderKey, lid);
          folderIdByName.set(item.name, lid);
          created.push({
            id: lid,
            name: item.name || `Group_${i + 1}`,
            type: 'folder',
            parentId: resolvedParentId,
            visible: item.visible ?? true,
            locked: false,
            solo: false,
            collapsed: false,
            opacity: item.opacity ?? 1,
            tagColor: '#eab308',
            frames: {},
            nodeX: 120,
            nodeY: 80
          });
        } else if (item.dataUrl) {
          const x = item.x ?? 0;
          const y = item.y ?? 0;
          const w = item.w ?? s.canvasWidth;
          const h = item.h ?? s.canvasHeight;
          const imgStroke: Stroke = {
            id: `st-img-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            tool: 'image',
            artLayer: 'LA',
            swatchId: 'sw-black',
            color: '#ffffff',
            size: 1,
            opacity: 1,
            smoothing: 0,
            points: [{ x, y }],
            imageDataUrl: item.dataUrl,
            imageX: x,
            imageY: y,
            imageW: w,
            imageH: h
          };
          created.push({
            id: lid,
            name: item.name || `Imported_${i + 1}`,
            type: 'drawing',
            parentId: resolvedParentId,
            visible: item.visible ?? true,
            locked: false,
            solo: false,
            holdFrames: true,
            opacity: item.opacity ?? 1,
            blendMode: item.blendMode,
            tagColor: colors[(s.layers.length + i) % colors.length],
            frames: { [s.currentFrame]: [imgStroke] },
            nodeX: 120 + i * 140,
            nodeY: 110
          });
        }
      });
      if (created.length === 0) return s;
      const firstDrawing = created.find((l) => l.type !== 'folder') || created[0];
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: [...created, ...s.layers],
        activeLayerId: firstDrawing.id,
        selectedLayerIds: [firstDrawing.id],
        isDirty: true
      };
    }),

  deleteLayer: (id) =>
    set((s) => {
      if (s.layers.length <= 1) return s;
      // Clear parentId on any children if deleting a folder
      const remaining = s.layers
        .filter((l) => l.id !== id)
        .map((l) => (l.parentId === id ? { ...l, parentId: null } : l));
      // Never leave a scene with zero drawing layers (only folders/cameras)
      if (!remaining.some((l) => l.type === 'drawing')) return s;
      const fallbackActive = remaining.find((l) => l.type === 'drawing')?.id || remaining[0].id;
      const nextActive = s.activeLayerId === id ? fallbackActive : s.activeLayerId;
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
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
      const remaining = s.layers
        .filter((l) => !targetIds.has(l.id))
        .map((l) => (l.parentId && targetIds.has(l.parentId) ? { ...l, parentId: null } : l));
      if (remaining.length === 0 || !remaining.some((l) => l.type === 'drawing')) {
        // Keep at least one drawing layer so scene is never empty or folder/camera-only
        const kept = [...s.layers].reverse().find((l) => l.type === 'drawing') || s.layers[s.layers.length - 1];
        if (!kept || s.layers.length <= 1) return s;
        const cleanKept = kept.parentId ? { ...kept, parentId: null } : kept;
        const nextLayers = remaining.some((l) => l.id === cleanKept.id) ? remaining : [...remaining, cleanKept];
        if (nextLayers.length === s.layers.length) return s;
        return {
          undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
          redoStack: [],
          layers: nextLayers,
          activeLayerId: cleanKept.id,
          selectedLayerIds: [cleanKept.id],
          isDirty: true
        };
      }
      const fallbackActive = remaining.find((l) => l.type !== 'folder')?.id || remaining[0].id;
      const nextActive = targetIds.has(s.activeLayerId) ? fallbackActive : s.activeLayerId;
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
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
        // Only include visible rows (skip children inside collapsed folders)
        const collapsedFolders = new Set(s.layers.filter((l) => l.type === 'folder' && l.collapsed).map((l) => l.id));
        const visibleLayers = s.layers.filter((l) => !l.parentId || !collapsedFolders.has(l.parentId));
        const anchorIdx = visibleLayers.findIndex((l) => l.id === s.activeLayerId);
        const targetIdx = visibleLayers.findIndex((l) => l.id === id);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          const rangeIds = visibleLayers.slice(start, end + 1).map((l) => l.id);
          return { activeLayerId: id, selectedLayerIds: rangeIds };
        }
      }
      if (!multi) {
        return { activeLayerId: id, selectedLayerIds: [id] };
      }
      const exists = s.selectedLayerIds.includes(id);
      if (exists) {
        if (s.selectedLayerIds.length <= 1) return s;
        const next = s.selectedLayerIds.filter((x) => x !== id);
        const nextActive = s.activeLayerId === id ? next[next.length - 1] : s.activeLayerId;
        return { activeLayerId: nextActive, selectedLayerIds: next };
      }
      return { activeLayerId: id, selectedLayerIds: [...s.selectedLayerIds, id] };
    }),
  reorderLayer: (fromIndex, toIndex) =>
    set((s) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= s.layers.length || toIndex >= s.layers.length) {
        return s;
      }
      const moving = s.layers[fromIndex];
      const next = [...s.layers];
      // If moving a folder, move its children right along with it!
      if (moving.type === 'folder') {
        const children = next.filter((l) => l.parentId === moving.id);
        const childIds = new Set(children.map((c) => c.id));
        const targetLayer = s.layers[toIndex];
        if (childIds.has(targetLayer.id)) return s;
        const withoutGroup = next.filter((l) => l.id !== moving.id && !childIds.has(l.id));
        const targetInWithout = withoutGroup.findIndex((l) => l.id === targetLayer.id);
        const insertPos = targetInWithout === -1 ? withoutGroup.length : (fromIndex < toIndex ? targetInWithout + 1 : targetInWithout);
        withoutGroup.splice(insertPos, 0, moving, ...children);
        return {
          undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
          redoStack: [],
          layers: withoutGroup,
          isDirty: true
        };
      }
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return {
        undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
        redoStack: [],
        layers: next,
        isDirty: true
      };
    }),
  setLayerBlendMode: (id, blendMode) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
      redoStack: [],
      layers: s.layers.map((l) => (l.id === id ? { ...l, blendMode } : l)),
      isDirty: true
    })),
  toggleLayerVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
      isDirty: true
    })),
  toggleLayerLock: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
      isDirty: true
    })),
  toggleLayerSolo: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, solo: !l.solo } : l)),
      isDirty: true
    })),
  toggleFolderCollapse: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, collapsed: !l.collapsed } : l))
    })),
  setLayerParent: (id, parentId) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
      redoStack: [],
      layers: s.layers.map((l) => (l.id === id && l.id !== parentId ? { ...l, parentId } : l)),
      isDirty: true
    })),
  setCelDuration: (layerId, startFrame, duration) =>
    set((s) => {
      const target = s.layers.find((l) => l.id === layerId);
      if (!target || target.locked || target.type === 'folder') return s;
      return {
        layers: s.layers.map((l) => {
          if (l.id !== layerId) return l;
          const nextExisting = Object.keys(l.frames)
            .map(Number)
            .filter((f) => f > startFrame)
            .sort((a, b) => a - b)[0];
          const maxDur = nextExisting
            ? Math.max(1, nextExisting - startFrame)
            : Math.max(1, s.totalFrames - startFrame + 1);
          const clamped = Math.max(1, Math.min(maxDur, Math.round(duration)));
          return {
            ...l,
            celDurations: {
              ...(l.celDurations || {}),
              [startFrame]: clamped
            }
          };
        }),
        isDirty: true
      };
    }),
  moveCelFrame: (layerId, fromFrame, toFrame) =>
    set((s) => {
      if (fromFrame === toFrame || toFrame < 1 || toFrame > s.totalFrames) return s;
      const target = s.layers.find((l) => l.id === layerId);
      if (!target || target.locked || target.type === 'folder' || target.frames[fromFrame] === undefined) return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const srcStrokes = l.frames[fromFrame];
        if (srcStrokes === undefined) return l;
        const nextFrames = { ...l.frames };
        delete nextFrames[fromFrame];
        nextFrames[toFrame] = srcStrokes;

        let nextDur = { ...(l.celDurations || {}) };
        const movedDur = nextDur[fromFrame];
        delete nextDur[fromFrame];
        delete nextDur[toFrame];
        nextDur = splitCelDurationsAt(nextDur, toFrame, false);
        if (movedDur) {
          const nextAfter = Object.keys(nextFrames)
            .map(Number)
            .filter((f) => f > toFrame)
            .sort((a, b) => a - b)[0];
          const maxDur = nextAfter
            ? Math.max(1, nextAfter - toFrame)
            : Math.max(1, s.totalFrames - toFrame + 1);
          nextDur[toFrame] = Math.min(movedDur, maxDur);
        }
        const nextTags = { ...(l.frameTags || {}) };
        const movedTag = nextTags[fromFrame];
        delete nextTags[fromFrame];
        delete nextTags[toFrame];
        if (movedTag) nextTags[toFrame] = movedTag;

        const nextKfs = { ...(l.keyframes || {}) };
        const movedKf = nextKfs[fromFrame];
        delete nextKfs[fromFrame];
        delete nextKfs[toFrame];
        if (movedKf) nextKfs[toFrame] = movedKf;

        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags, keyframes: nextKfs };
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
      const target = s.layers.find((l) => l.id === layerId);
      if (!target || target.locked || target.type === 'folder' || !target.frames[sourceFrame]) return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const src = l.frames[sourceFrame];
        if (!src) return l;
        return {
          ...l,
          frames: {
            ...l.frames,
            [targetFrame]: cloneStrokesWithNewIds(src, 'st-sub')
          },
          celDurations: splitCelDurationsAt(l.celDurations, targetFrame, true)
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
      const target = s.layers.find((l) => l.id === layerId);
      if (!target || target.locked || target.type === 'folder') return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const nextFrames = { ...l.frames };
        const nextDur = { ...(l.celDurations || {}) };
        const nextTags = { ...(l.frameTags || {}) };
        const nextKfs = { ...(l.keyframes || {}) };

        // Trim any earlier stretched cel that spills into [a, b]
        for (const [k, d] of Object.entries(nextDur)) {
          const cf = Number(k);
          if (cf < a && cf + d - 1 >= a) {
            nextDur[cf] = Math.max(1, a - cf);
          }
        }

        // Collect all cels starting in [a, b] with their effective duration clamped to [a, b]
        const cels: Array<{
          start: number;
          dur: number;
          strokes?: Stroke[];
          tag?: PoseTag;
          kf?: LayerTransformKeyframe;
        }> = [];
        for (let f = a; f <= b; f++) {
          const hasAny =
            l.frames[f] !== undefined || nextTags[f] !== undefined || nextKfs[f] !== undefined;
          if (hasAny) {
            const rawDur = Math.max(1, nextDur[f] || 1);
            const clampedDur = Math.min(rawDur, b - f + 1);
            cels.push({
              start: f,
              dur: clampedDur,
              strokes: l.frames[f],
              tag: nextTags[f],
              kf: nextKfs[f]
            });
          }
          delete nextFrames[f];
          delete nextDur[f];
          delete nextTags[f];
          delete nextKfs[f];
        }

        // Mirror each cel block [start .. start+dur-1] cleanly inside [a, b] so nothing spills out!
        for (const cel of cels) {
          const celEnd = cel.start + cel.dur - 1;
          const newStart = a + (b - celEnd);
          if (cel.strokes !== undefined) nextFrames[newStart] = cel.strokes;
          if (cel.dur > 1) nextDur[newStart] = cel.dur;
          if (cel.tag !== undefined) nextTags[newStart] = cel.tag;
          if (cel.kf !== undefined) nextKfs[newStart] = cel.kf;
        }
        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags, keyframes: nextKfs };
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
      const target = s.layers.find((l) => l.id === layerId);
      if (!target || target.locked || target.type === 'folder') return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const nextFrames = { ...l.frames };
        const nextDur = { ...(l.celDurations || {}) };
        const nextTags = { ...(l.frameTags || {}) };
        const nextKfs = { ...(l.keyframes || {}) };
        for (let f = a; f <= b; f++) {
          delete nextFrames[f];
          delete nextDur[f];
          delete nextTags[f];
          delete nextKfs[f];
        }
        // Trim any earlier stretched Cel whose tail overlaps [a, b]
        for (const [k, rawDur] of Object.entries(nextDur)) {
          const start = Number(k);
          const dur = Math.max(1, rawDur || 1);
          if (start < a && start + dur - 1 >= a) {
            nextDur[start] = Math.max(1, a - start);
          }
        }
        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags, keyframes: nextKfs };
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
      const target = s.layers.find((l) => l.id === layerId);
      if (!target || target.locked || target.type === 'folder') return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const nextFrames = { ...l.frames };
        let nextDur = { ...(l.celDurations || {}) };
        const nextTags = { ...(l.frameTags || {}) };
        const nextKfs = { ...(l.keyframes || {}) };
        const tmpF: Record<number, Stroke[]> = {};
        const tmpD: Record<number, number> = {};
        const tmpT: Record<number, PoseTag> = {};
        const tmpK: Record<number, LayerTransformKeyframe> = {};
        for (let f = a; f <= b; f++) {
          if (l.frames[f] !== undefined) {
            tmpF[f + delta] = l.frames[f];
            delete nextFrames[f];
          }
          if (nextDur[f] !== undefined) {
            tmpD[f + delta] = nextDur[f];
            delete nextDur[f];
          }
          if (nextTags[f] !== undefined) {
            tmpT[f + delta] = nextTags[f];
            delete nextTags[f];
          }
          if (nextKfs[f] !== undefined) {
            tmpK[f + delta] = nextKfs[f];
            delete nextKfs[f];
          }
        }
        // Clear destination metadata before writing moved frames so overwritten cels don't leak old durations/tags/keyframes
        for (let f = a; f <= b; f++) {
          const dest = f + delta;
          delete nextDur[dest];
          delete nextTags[dest];
          delete nextKfs[dest];
        }
        for (const [k, v] of Object.entries(tmpF)) {
          const nf = Number(k);
          nextFrames[nf] = v;
          nextDur = splitCelDurationsAt(nextDur, nf, false);
        }
        for (const [k, v] of Object.entries(tmpD)) {
          const nf = Number(k);
          nextDur[nf] = Math.max(1, Math.min(v, s.totalFrames - nf + 1));
        }
        for (const [k, v] of Object.entries(tmpT)) nextTags[Number(k)] = v;
        for (const [k, v] of Object.entries(tmpK)) nextKfs[Number(k)] = v;
        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags, keyframes: nextKfs };
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
      if (!layer || layer.type === 'folder') return s;
      const strokes = resolveEffectiveStrokes(layer, s.currentFrame);
      return { clipboardStrokes: cloneStrokesWithNewIds(strokes, 'st-clip') };
    }),
  pasteToCurrentFrame: () =>
    set((s) => {
      if (s.clipboardStrokes.length === 0) return s;
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const snapshot = makeSnapshot(s);
      const pasted = cloneStrokesWithNewIds(s.clipboardStrokes, 'st-paste');
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const existing = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: { ...l.frames, [s.currentFrame]: [...existing, ...pasted] },
          celDurations:
            l.frames[s.currentFrame] === undefined
              ? splitCelDurationsAt(l.celDurations, s.currentFrame, true)
              : l.celDurations
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  extendExposureF5: () =>
    set((s) => {
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const snapshot = makeSnapshot(s);
      const coveringStart = findCoveringCelStart(targetLayer, s.currentFrame);
      const shiftFrom = coveringStart !== null
        ? coveringStart + Math.max(1, targetLayer.celDurations?.[coveringStart] || 1)
        : s.currentFrame + 1;
      let maxFrame = s.totalFrames;
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const nextFrames = shiftRecordKeys(l.frames, shiftFrom, 1);
        const nextDur = shiftRecordKeys(l.celDurations, shiftFrom, 1);
        const nextTags = shiftRecordKeys(l.frameTags, shiftFrom, 1);
        const nextKfs = shiftRecordKeys(l.keyframes, shiftFrom, 1);
        if (coveringStart !== null) {
          const prevDur = Math.max(1, l.celDurations?.[coveringStart] || 1);
          nextDur[coveringStart] = prevDur + 1;
          maxFrame = Math.max(maxFrame, coveringStart + prevDur);
        }
        for (const k of Object.keys(nextFrames)) {
          const f = Number(k);
          maxFrame = Math.max(maxFrame, f + Math.max(1, nextDur[f] || 1) - 1);
        }
        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags, keyframes: nextKfs };
      });
      const newTotal = Math.min(1000, Math.max(s.totalFrames, maxFrame));
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        totalFrames: newTotal,
        playEnd: Math.min(newTotal, Math.max(s.playEnd, Math.min(newTotal, maxFrame))),
        isDirty: true
      };
    }),
  reduceExposureShiftF5: () =>
    set((s) => {
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const removeAt = s.currentFrame;
      const snapshot = makeSnapshot(s);
      const coveringStart = findCoveringCelStart(targetLayer, removeAt);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        if (coveringStart !== null) {
          const prevDur = Math.max(1, l.celDurations?.[coveringStart] || 1);
          if (prevDur > 1) {
            const shiftFrom = coveringStart + prevDur;
            const nextFrames = shiftRecordKeys(l.frames, shiftFrom, -1);
            const nextDur = shiftRecordKeys(l.celDurations, shiftFrom, -1);
            const nextTags = shiftRecordKeys(l.frameTags, shiftFrom, -1);
            const nextKfs = shiftRecordKeys(l.keyframes, shiftFrom, -1);
            nextDur[coveringStart] = prevDur - 1;
            return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags, keyframes: nextKfs };
          }
        }
        // Duration is 1 (or empty frame): remove removeAt and shift everything > removeAt left by 1
        const nextFrames: Record<number, Stroke[]> = {};
        for (const [k, v] of Object.entries(l.frames)) {
          const f = Number(k);
          if (f < removeAt) nextFrames[f] = v;
          else if (f > removeAt) nextFrames[f - 1] = v;
        }
        const nextDur: Record<number, number> = {};
        for (const [k, v] of Object.entries(l.celDurations || {})) {
          const f = Number(k);
          if (f < removeAt) nextDur[f] = v;
          else if (f > removeAt) nextDur[f - 1] = v;
        }
        const nextTags: Record<number, PoseTag> = {};
        for (const [k, v] of Object.entries(l.frameTags || {})) {
          const f = Number(k);
          if (f < removeAt) nextTags[f] = v;
          else if (f > removeAt) nextTags[f - 1] = v;
        }
        const nextKfs: Record<number, LayerTransformKeyframe> = {};
        for (const [k, v] of Object.entries(l.keyframes || {})) {
          const f = Number(k);
          if (f < removeAt) nextKfs[f] = v;
          else if (f > removeAt) nextKfs[f - 1] = v;
        }
        return { ...l, frames: nextFrames, celDurations: nextDur, frameTags: nextTags, keyframes: nextKfs };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),
  setAudioTrack: (audioTrack) =>
    set((s) => {
      const prevUrl = s.audioTrack?.objectUrl;
      if (prevUrl && prevUrl !== audioTrack?.objectUrl) {
        const usedByOtherTab = s.openScenes.some(
          (sc) => sc.id !== s.activeSceneId && sc.audioTrack?.objectUrl === prevUrl
        );
        if (!usedByOtherTab) {
          try {
            URL.revokeObjectURL(prevUrl);
          } catch {
            // ignore
          }
        }
      }
      return { audioTrack, isDirty: true };
    }),
  renameLayer: (id, name) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l)),
      isDirty: true
    })),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
      isDirty: true
    })),
  setSelectedLayersOpacity: (opacity) =>
    set((s) => {
      const targetSet = new Set(s.selectedLayerIds.length > 0 ? s.selectedLayerIds : [s.activeLayerId]);
      return {
        layers: s.layers.map((l) => (targetSet.has(l.id) ? { ...l, opacity } : l)),
        isDirty: true
      };
    }),
  updateNodePosition: (id, nodeX, nodeY) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, nodeX, nodeY } : l)),
      isDirty: true
    })),

  pushUndoSnapshot: () =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-39), makeSnapshot(s)],
      redoStack: []
    })),

  addStroke: (stroke, insertAtBottom = false) =>
    set((s) => {
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const finalStroke: Stroke =
        targetLayer.alphaLock && stroke.tool !== 'eraser' && stroke.tool !== 'erase_poly' && !insertAtBottom
          ? { ...stroke, alphaLock: true }
          : stroke;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const isDirectUndefined = l.frames[s.currentFrame] === undefined;
        let existing: Stroke[];
        if (!isDirectUndefined) {
          existing = l.frames[s.currentFrame];
        } else if (
          stroke.tool === 'eraser' ||
          stroke.tool === 'erase_poly' ||
          l.holdFrames ||
          l.alphaLock
        ) {
          // Materialize the currently displayed held/stretched drawing when erasing, alpha-locked, or on holdFrames layers
          existing = cloneStrokesWithNewIds(resolveEffectiveStrokes(l, s.currentFrame), 'st-mat');
        } else {
          existing = [];
        }
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: insertAtBottom ? [finalStroke, ...existing] : [...existing, finalStroke]
          },
          celDurations: isDirectUndefined
            ? splitCelDurationsAt(l.celDurations, s.currentFrame, true)
            : l.celDurations
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        isDirty: true
      };
    }),

  addStrokesBatch: (newStrokes, materializeHeld = true, bypassAlphaLock = false) =>
    set((s) => {
      if (newStrokes.length === 0) return s;
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const isDirectUndefined = l.frames[s.currentFrame] === undefined;
        let base: Stroke[] = !isDirectUndefined ? [...l.frames[s.currentFrame]] : [];
        if (isDirectUndefined && (materializeHeld || l.holdFrames || l.alphaLock)) {
          const eff = resolveEffectiveStrokes(l, s.currentFrame);
          if (eff.length > 0) base = cloneStrokesWithNewIds(eff, 'st-mat');
        }
        const taggedNew = newStrokes.map((st) =>
          !bypassAlphaLock && l.alphaLock && st.tool !== 'eraser' && st.tool !== 'erase_poly'
            ? { ...st, alphaLock: true }
            : st
        );
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: [...base, ...taggedNew]
          },
          celDurations: isDirectUndefined
            ? splitCelDurationsAt(l.celDurations, s.currentFrame, true)
            : l.celDurations
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
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const idSet = new Set(strokeIds);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const isDirectUndefined = l.frames[s.currentFrame] === undefined;
        const existing = isDirectUndefined ? resolveEffectiveStrokes(l, s.currentFrame) : l.frames[s.currentFrame];
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: existing.map((st) => {
              if (!idSet.has(st.id)) return st;
              const next: Stroke = {
                ...st,
                points: st.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy }))
              };
              if (st.tool === 'image') {
                next.imageX = (st.imageX ?? 0) + dx;
                next.imageY = (st.imageY ?? 0) + dy;
                if (st.imageQuad) {
                  next.imageQuad = {
                    tl: { x: st.imageQuad.tl.x + dx, y: st.imageQuad.tl.y + dy },
                    tr: { x: st.imageQuad.tr.x + dx, y: st.imageQuad.tr.y + dy },
                    br: { x: st.imageQuad.br.x + dx, y: st.imageQuad.br.y + dy },
                    bl: { x: st.imageQuad.bl.x + dx, y: st.imageQuad.bl.y + dy }
                  };
                }
              }
              return next;
            })
          },
          celDurations: isDirectUndefined
            ? splitCelDurationsAt(l.celDurations, s.currentFrame, true)
            : l.celDurations
        };
      });
      return { layers, isDirty: true };
    }),

  replaceStrokes: (updated) =>
    set((s) => {
      if (updated.length === 0) return s;
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const map = new Map(updated.map((st) => [st.id, st]));
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const isDirectUndefined = l.frames[s.currentFrame] === undefined;
        const existing = isDirectUndefined ? resolveEffectiveStrokes(l, s.currentFrame) : l.frames[s.currentFrame];
        const nextFrameStrokes =
          existing.length > 0 ? existing.map((st) => map.get(st.id) || st) : updated;
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: nextFrameStrokes
          },
          celDurations: isDirectUndefined
            ? splitCelDurationsAt(l.celDurations, s.currentFrame, true)
            : l.celDurations
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
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const idSet = new Set(strokeIds);
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const isDirectUndefined = l.frames[s.currentFrame] === undefined;
        const existing = isDirectUndefined ? resolveEffectiveStrokes(l, s.currentFrame) : l.frames[s.currentFrame];
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: existing.filter((st) => !idSet.has(st.id))
          },
          celDurations: isDirectUndefined
            ? splitCelDurationsAt(l.celDurations, s.currentFrame, true)
            : l.celDurations
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
      if (!activeLayer || activeLayer.locked || activeLayer.type === 'folder') return s;
      const snapshot = makeSnapshot(s);

      // If current frame has no frame yet on this layer, create it right here AND auto-split any stretched Cel covering it!
      if (activeLayer.frames[s.currentFrame] === undefined) {
        const layers = s.layers.map((l) =>
          l.id === s.activeLayerId
            ? {
                ...l,
                frames: { ...l.frames, [s.currentFrame]: [] },
                celDurations: splitCelDurationsAt(l.celDurations, s.currentFrame, true)
              }
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
      let maxShiftedFrame = insertAt;
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const shifted = shiftRecordKeys(l.frames, insertAt, 1);
        shifted[insertAt] = [];
        const shiftedDur = splitCelDurationsAt(shiftRecordKeys(l.celDurations, insertAt, 1), insertAt, false);
        const shiftedTags = shiftRecordKeys(l.frameTags, insertAt, 1);
        const shiftedKfs = shiftRecordKeys(l.keyframes, insertAt, 1);
        for (const k of Object.keys(shifted)) {
          const f = Number(k);
          maxShiftedFrame = Math.max(maxShiftedFrame, f + Math.max(1, shiftedDur[f] || 1) - 1);
        }
        return {
          ...l,
          frames: shifted,
          celDurations: shiftedDur,
          frameTags: shiftedTags,
          keyframes: shiftedKfs
        };
      });
      const newTotal = Math.min(1000, Math.max(s.totalFrames, maxShiftedFrame));
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        totalFrames: newTotal,
        playEnd: Math.min(newTotal, Math.max(s.playEnd, insertAt)),
        currentFrame: Math.min(newTotal, insertAt),
        isDirty: true
      };
    }),

  clearCurrentFrame: () =>
    set((s) => {
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: []
          },
          celDurations:
            l.frames[s.currentFrame] === undefined
              ? splitCelDurationsAt(l.celDurations, s.currentFrame, true)
              : l.celDurations
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
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked || targetLayer.type === 'folder' || targetLayer.type === 'camera') return s;
      const next = Math.min(1000, s.currentFrame + 1);
      if (next === s.currentFrame) return s;
      const snapshot = makeSnapshot(s);
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const curr = resolveEffectiveStrokes(l, s.currentFrame);
        return {
          ...l,
          frames: {
            ...l.frames,
            [next]: cloneStrokesWithNewIds(curr, 'st-dup')
          },
          celDurations: splitCelDurationsAt(l.celDurations, next, true)
        };
      });
      const newTotal = Math.max(s.totalFrames, next);
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers,
        totalFrames: newTotal,
        playEnd: Math.max(s.playEnd, next),
        currentFrame: next,
        isDirty: true
      };
    }),

  undo: () =>
    set((s) => {
      if (s.undoStack.length === 0) return s;
      const prev = s.undoStack[s.undoStack.length - 1];
      const layerIds = new Set(prev.layers.map((l) => l.id));
      const fallbackActive = prev.layers.find((l) => l.type !== 'folder')?.id || prev.layers[0]?.id || '';
      const validActive =
        (prev.activeLayerId && layerIds.has(prev.activeLayerId) ? prev.activeLayerId : null) ||
        (layerIds.has(s.activeLayerId) ? s.activeLayerId : fallbackActive);
      const validSelected = s.selectedLayerIds.filter((id) => layerIds.has(id));
      return {
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, makeSnapshot(s)],
        layers: prev.layers,
        activeLayerId: validActive,
        selectedLayerIds: validSelected.length > 0 ? validSelected : validActive ? [validActive] : [],
        canvasWidth: prev.canvasWidth ?? s.canvasWidth,
        canvasHeight: prev.canvasHeight ?? s.canvasHeight,
        isDirty: true
      };
    }),

  redo: () =>
    set((s) => {
      if (s.redoStack.length === 0) return s;
      const next = s.redoStack[s.redoStack.length - 1];
      const layerIds = new Set(next.layers.map((l) => l.id));
      const fallbackActive = next.layers.find((l) => l.type !== 'folder')?.id || next.layers[0]?.id || '';
      const validActive =
        (next.activeLayerId && layerIds.has(next.activeLayerId) ? next.activeLayerId : null) ||
        (layerIds.has(s.activeLayerId) ? s.activeLayerId : fallbackActive);
      const validSelected = s.selectedLayerIds.filter((id) => layerIds.has(id));
      return {
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, makeSnapshot(s)],
        layers: next.layers,
        activeLayerId: validActive,
        selectedLayerIds: validSelected.length > 0 ? validSelected : validActive ? [validActive] : [],
        canvasWidth: next.canvasWidth ?? s.canvasWidth,
        canvasHeight: next.canvasHeight ?? s.canvasHeight,
        isDirty: true
      };
    }),

  setProjectMeta: (projectName, projectPath) =>
    set((s) => ({
      projectName,
      projectPath,
      isDirty: false,
      openScenes: s.openScenes.map((sc) =>
        sc.id === s.activeSceneId ? { ...sc, name: projectName, path: projectPath, isDirty: false } : sc
      )
    })),
  setAutoSaveEnabled: (autoSaveEnabled) => set({ autoSaveEnabled }),
  setAutoSaveIntervalSec: (sec) => set({ autoSaveIntervalSec: Math.max(5, Math.min(3600, Math.round(sec))) }),
  setLastAutoSaveTime: (lastAutoSaveTime) => set({ lastAutoSaveTime }),

  exportProjectData: () => {
    const s = get();
    return {
      version: '27.2.0',
      name: s.projectName,
      width: s.canvasWidth,
      height: s.canvasHeight,
      fps: s.fps,
      totalFrames: s.totalFrames,
      playStart: s.playStart,
      playEnd: s.playEnd,
      timelineMarkers: s.timelineMarkers,
      audioTrackPath: s.audioTrack?.filePath || null,
      postProcess: s.postProcess,
      swatches: s.swatches,
      layers: s.layers
    };
  },

  loadProjectData: (data, filePath) =>
    set((s) => {
      const synced = syncActiveTabInList(s);
      // If already open in a tab, sync current tab FIRST and switch cleanly!
      if (filePath) {
        const existing = synced.find((sc) => sc.path === filePath);
        if (existing) {
          return {
            openScenes: synced,
            activeSceneId: existing.id,
            projectName: existing.name,
            projectPath: existing.path,
            isDirty: existing.isDirty,
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
            timelineMarkers: existing.timelineMarkers || {},
            audioTrack: existing.audioTrack || null,
            undoStack: existing.undoStack || [],
            redoStack: existing.redoStack || [],
            isPlaying: false,
            showWelcome: false
          };
        }
      }

      const id = `scene-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const loadedLayers = data.layers?.length ? data.layers : createDefaultLayers();
      const loadedSwatches = data.swatches?.length ? data.swatches : DEFAULT_SWATCHES;
      const total = Math.max(1, Math.min(1000, data.totalFrames || 60));
      const pStart = Math.max(1, Math.min(total, data.playStart ?? 1));
      const pEnd = Math.max(pStart, Math.min(total, data.playEnd ?? total));
      const markers = data.timelineMarkers || {};
      const firstActive = loadedLayers.find((l) => l.type !== 'folder')?.id || loadedLayers[0].id;

      const newTab: SceneTab = {
        id,
        name: data.name || 'Loaded_Scene',
        path: filePath,
        isDirty: false,
        width: data.width || 1920,
        height: data.height || 1080,
        fps: data.fps || 24,
        totalFrames: total,
        playStart: pStart,
        playEnd: pEnd,
        currentFrame: pStart,
        layers: loadedLayers,
        activeLayerId: firstActive,
        selectedLayerIds: [firstActive],
        swatches: loadedSwatches,
        activeSwatchId: loadedSwatches[0].id,
        timelineMarkers: markers,
        audioTrack: null,
        undoStack: [],
        redoStack: []
      };

      return {
        openScenes: [...synced, newTab],
        activeSceneId: id,
        projectName: newTab.name,
        projectPath: filePath,
        isDirty: false,
        canvasWidth: newTab.width,
        canvasHeight: newTab.height,
        fps: newTab.fps,
        totalFrames: total,
        playStart: pStart,
        playEnd: pEnd,
        currentFrame: pStart,
        timelineMarkers: markers,
        audioTrack: null,
        postProcess: data.postProcess ? { ...DEFAULT_POST_PROCESS, ...data.postProcess } : { ...DEFAULT_POST_PROCESS },
        swatches: loadedSwatches,
        activeSwatchId: loadedSwatches[0].id,
        layers: loadedLayers,
        activeLayerId: firstActive,
        selectedLayerIds: [firstActive],
        undoStack: [],
        redoStack: [],
        timelapseFrames: [],
        isPlaying: false,
        showWelcome: false
      };
    }),

  newProject: () => {
    const s = get();
    s.createNewScene(`Cena_${s.openScenes.length + 1}`, 1920, 1080, 24);
  }
}));

// Automatically persist ONLY user preferences when a preference actually changes + sync Electron dirty flag
const PREF_KEYS = [
  'onionSkin',
  'onionPrev',
  'onionNext',
  'brushSmoothing',
  'brushSize',
  'brushMinSize',
  'brushOpacity',
  'eraserSize',
  'eraserMinSize',
  'eraserOpacity',
  'eraserPreset',
  'textFontFamily',
  'textFontSize',
  'textBold',
  'textItalic',
  'usePressure',
  'activeBrushPreset',
  'activeColor',
  'secondaryColor',
  'recentColors',
  'lastSelectionTool',
  'lastShapeTool',
  'shapeFilled',
  'bucketReference',
  'bucketTolerance',
  'bucketExpand',
  'bucketCloseGap',
  'bucketBehind',
  'liquifyMode',
  'liquifySize',
  'liquifyStrength',
  'showGrid',
  'showCameraFrame',
  'lightTable',
  'loopPlayback',
  'timelineCellWidth',
  'autoSaveEnabled',
  'autoSaveIntervalSec',
  'timelapseRootDir',
  'performanceMode'
] as const;

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
