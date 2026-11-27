import type { StateCreator } from 'zustand';
import type { LevelsAdjustment } from '../utils/levelsUtils';
import type { BlurSettings } from '../utils/blurUtils';
import type { ShortcutActionId, ShortcutMap } from '../utils/shortcuts';
import type {
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

export interface HistorySnapshot {
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

export interface HarmonyState {
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
  settingsModalOpen: boolean;
  showBrushSizeHud: boolean;
  customShortcuts: ShortcutMap;
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
  setSettingsModalOpen: (open: boolean) => void;
  setShowBrushSizeHud: (show: boolean) => void;
  setCustomShortcut: (actionId: ShortcutActionId, combo: string) => void;
  resetCustomShortcuts: () => void;
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


export type HarmonySet = Parameters<StateCreator<HarmonyState>>[0];
export type HarmonyGet = Parameters<StateCreator<HarmonyState>>[1];
