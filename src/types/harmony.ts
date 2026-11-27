export type ToolId =
  | 'select'
  | 'contour'
  | 'lasso'
  | 'polylasso'
  | 'lassofill'
  | 'polylassofill'
  | 'rectselect'
  | 'ellipseselect'
  | 'magicwand'
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'liquify'
  | 'paint'
  | 'gradient'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'eyedropper'
  | 'hand'
  | 'zoom';

export type ArtLayerId = 'OL' | 'LA' | 'CA' | 'UL';

export type BrushPresetId =
  | 'csp_line'
  | 'csp_sketch'
  | 'sai_pen'
  | 'sketch_graphite'
  | 'sai_pencil'
  | 'sai_airbrush'
  | 'sai_brush'
  | 'sai_water'
  | 'sai_marker'
  | 'sai_inkpen'
  | 'sai_binary'
  | 'sai_opacity_pen'
  | 'blur_soft'
  | 'blur_smudge';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  id: string;
  tool: 'brush' | 'pencil' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'fill' | 'erase_poly' | 'image' | 'text' | 'gradient';
  preset?: BrushPresetId;
  artLayer: ArtLayerId;
  swatchId: string;
  color: string;
  secondaryColor?: string;
  gradientMode?: 'linear' | 'radial';
  gradientToTransparent?: boolean;
  size: number;
  minSizeRatio?: number;
  opacity: number;
  smoothing: number;
  points: Point[];
  extraPolys?: Point[][];
  clipPolys?: Point[][];
  clipInverted?: boolean;
  filled?: boolean;
  inverted?: boolean;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  imageDataUrl?: string;
  imageX?: number;
  imageY?: number;
  imageW?: number;
  imageH?: number;
  imageQuad?: { tl: Point; tr: Point; br: Point; bl: Point };
  hsvFilter?: { h: number; s: number; v: number; colorize?: boolean };
  hsvFilters?: Array<{ h: number; s: number; v: number; colorize?: boolean }>;
  levelsFilters?: Array<{ blackPoint: number; gamma: number; whitePoint: number; brightness: number; contrast: number }>;
  alphaLock?: boolean;
}

export interface ColourSwatch {
  id: string;
  name: string;
  hex: string;
  alpha: number;
}

export type KeyframeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

export type CameraEffectType =
  | 'impact_shake'
  | 'wind_sway'
  | 'handheld'
  | 'earthquake'
  | 'punch_zoom'
  | 'heartbeat'
  | 'float_drift';

export interface CameraEffect {
  id: string;
  type: CameraEffectType;
  name: string;
  enabled: boolean;
  startFrame: number;
  duration: number; // ignored when wholeScene === true
  wholeScene?: boolean;
  intensity: number; // 1 .. 100
  speed: number; // 0.25 .. 3.0
  seed: number;
}

export interface CameraKeyframe {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  easing?: KeyframeEasing;
}

export interface LayerTransformKeyframe {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface LayerEffects {
  blur: number;
  glow: number;
  glowColor: string;
  dropShadow: boolean;
}

export type PoseTag = 'key' | 'breakdown' | 'inbetween';

export interface DrawingLayer {
  id: string;
  name: string;
  type: 'drawing' | 'peg' | 'camera' | 'folder';
  parentId?: string | null;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  holdFrames?: boolean;
  alphaLock?: boolean;
  clippingMask?: boolean;
  collapsed?: boolean;
  opacity: number;
  blendMode?: GlobalCompositeOperation;
  effects?: LayerEffects;
  keyframes?: Record<number, LayerTransformKeyframe>;
  cameraKeyframes?: Record<number, CameraKeyframe>;
  cameraEffects?: CameraEffect[];
  // Exposure duration per drawing start frame (e.g. { 1: 3 } means frame 1 holds across frames 1, 2, 3)
  celDurations?: Record<number, number>;
  // Pose tags per frame ('key' | 'breakdown' | 'inbetween')
  frameTags?: Record<number, PoseTag>;
  tagColor: string;
  // Map of frame number (1-based) to array of strokes
  frames: Record<number, Stroke[]>;
  // Node view position
  nodeX: number;
  nodeY: number;
}

export interface PostProcessSettings {
  enabled: boolean;
  bloomIntensity: number;
  bloomRadius: number;
  bloomThreshold: number;
  chromaticAberration: number;
  vignette: number;
  motionBlur: number;
  motionBlurAngle: number;
  filmGrain: number;
}

export interface HarmonyProjectData {
  version: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  playStart?: number;
  playEnd?: number;
  timelineMarkers?: Record<number, string>;
  audioTrackPath?: string | null;
  postProcess?: PostProcessSettings;
  swatches: ColourSwatch[];
  layers: DrawingLayer[];
}

export type InstallMode = 'installed' | 'portable' | 'unpacked' | 'dev';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  installMode: InstallMode;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  htmlUrl: string;
  assetName: string | null;
  assetUrl: string | null;
  assetSize: number;
  assetSha256: string | null;
  error?: string;
}

export interface UpdateDownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  stage: 'downloading' | 'verifying';
}

declare global {
  interface Window {
    harmonyAPI?: {
      minimize: () => Promise<void>;
      maximize: () => Promise<boolean>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      setDirty: (dirty: boolean) => Promise<void>;
      confirmClose?: (discardRecovery?: boolean) => Promise<void>;
      onRequestClose?: (callback: () => void) => () => void;
      getLaunchFile: () => Promise<string | null>;
      onOpenExternalFile: (callback: (filePath: string) => void) => () => void;
      saveProject: (
        content: string | Uint8Array,
        currentPath?: string | null,
        defaultName?: string
      ) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
      saveProjectAs: (
        content: string | Uint8Array,
        defaultName?: string
      ) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
      autoSave: (
        content: string | Uint8Array,
        currentPath?: string | null
      ) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
      checkRecovery: () => Promise<{
        exists: boolean;
        mtimeMs?: number;
        content?: string;
        bytes?: Uint8Array;
        filePath?: string;
      }>;
      clearRecovery: () => Promise<{ ok: boolean }>;
      openProject: () => Promise<{
        canceled: boolean;
        filePath?: string;
        content?: string;
        bytes?: Uint8Array;
        error?: string;
      }>;
      openProjectByPath: (
        filePath: string
      ) => Promise<{
        canceled: boolean;
        filePath?: string;
        content?: string;
        bytes?: Uint8Array;
        error?: string;
      }>;
      importExternal: () => Promise<{ canceled: boolean; filePath?: string; ext?: string; bytes?: Uint8Array; error?: string }>;
      importAudio: () => Promise<{ canceled: boolean; filePath?: string; name?: string; bytes?: Uint8Array; error?: string }>;
      readAudioByPath: (filePath: string) => Promise<{ canceled: boolean; filePath?: string; name?: string; bytes?: Uint8Array; error?: string }>;
      exportPng: (dataUrl: string, defaultName: string) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
      pickDirectory: (title?: string) => Promise<{ canceled: boolean; dirPath?: string; error?: string }>;
      getNextStepNumber: (dirPath: string, subFolder: string) => Promise<number>;
      writeFrameToDir: (dirPath: string, name: string, dataUrl: string) => Promise<{ ok: boolean; error?: string }>;
      saveBinaryFile: (
        defaultName: string,
        filterName: string,
        extensions: string[],
        bytes: Uint8Array
      ) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
      openPath: (targetPath: string) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      listFonts: () => Promise<string[]>;
      getAppInfo?: () => Promise<{ version: string; installMode: InstallMode; platform: string; editorOpen: boolean }>;
      getLauncherPrefs?: () => Promise<{ autoLaunchIfUpToDate: boolean }>;
      setLauncherPrefs?: (prefs: { autoLaunchIfUpToDate?: boolean }) => Promise<{ autoLaunchIfUpToDate: boolean }>;
      launchEditor?: (opts?: { projectPath?: string | null }) => Promise<{ ok: boolean }>;
      openLauncher?: () => Promise<{ ok: boolean }>;
      pickProjectFile?: () => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
      checkForUpdates?: () => Promise<UpdateCheckResult>;
      getLastUpdateCheck?: () => Promise<UpdateCheckResult | null>;
      downloadUpdate?: (
        assetUrl: string,
        assetName: string,
        expectedSha256: string | null
      ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; sha256Verified?: boolean; error?: string }>;
      cancelDownload?: () => Promise<{ ok: boolean }>;
      installUpdate?: (
        filePath: string,
        installMode: InstallMode
      ) => Promise<{ ok: boolean; needsSave?: boolean; error?: string }>;
      onUpdateProgress?: (callback: (progress: UpdateDownloadProgress) => void) => () => void;
      onUpdateStatusChanged?: (callback: (result: UpdateCheckResult) => void) => () => void;
      refOpenPopout?: () => Promise<{ ok: boolean }>;
      refClosePopout?: () => Promise<{ ok: boolean }>;
      refSetAlwaysOnTop?: (flag: boolean) => Promise<{ ok: boolean }>;
      refSetWindowOpacity?: (alpha: number) => Promise<{ ok: boolean }>;
      refPickColor?: (hex: string) => Promise<{ ok: boolean }>;
      refSetBoardState?: (json: string) => Promise<{ ok: boolean }>;
      refGetBoardState?: () => Promise<string | null>;
      onRefColorPicked?: (callback: (hex: string) => void) => () => void;
      onRefPopoutClosed?: (callback: () => void) => () => void;
    };
  }
}
