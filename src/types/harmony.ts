export type ToolId =
  | 'select'
  | 'contour'
  | 'lasso'
  | 'polylasso'
  | 'rectselect'
  | 'ellipseselect'
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'paint'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'eyedropper'
  | 'hand'
  | 'zoom';

export type ArtLayerId = 'OL' | 'LA' | 'CA' | 'UL';

export type BrushPresetId =
  | 'sai_pen'
  | 'sai_pencil'
  | 'sai_airbrush'
  | 'sai_brush'
  | 'sai_water'
  | 'sai_marker'
  | 'sai_inkpen'
  | 'sai_binary'
  | 'blur_soft'
  | 'blur_smudge';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  id: string;
  tool: 'brush' | 'pencil' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'fill' | 'erase_poly' | 'image';
  preset?: BrushPresetId;
  artLayer: ArtLayerId;
  swatchId: string;
  color: string;
  size: number;
  minSizeRatio?: number;
  opacity: number;
  smoothing: number;
  points: Point[];
  filled?: boolean;
  imageDataUrl?: string;
  imageX?: number;
  imageY?: number;
  imageW?: number;
  imageH?: number;
  hsvFilter?: { h: number; s: number; v: number };
}

export interface ColourSwatch {
  id: string;
  name: string;
  hex: string;
  alpha: number;
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

export interface DrawingLayer {
  id: string;
  name: string;
  type: 'drawing' | 'peg' | 'camera' | 'folder';
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
  tagColor: string;
  // Map of frame number (1-based) to array of strokes
  frames: Record<number, Stroke[]>;
  // Node view position
  nodeX: number;
  nodeY: number;
}

export interface HarmonyProjectData {
  version: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  swatches: ColourSwatch[];
  layers: DrawingLayer[];
}

declare global {
  interface Window {
    harmonyAPI?: {
      minimize: () => Promise<void>;
      maximize: () => Promise<boolean>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      saveProject: (content: string, currentPath?: string | null) => Promise<{ canceled: boolean; filePath?: string }>;
      saveProjectAs: (content: string) => Promise<{ canceled: boolean; filePath?: string }>;
      autoSave: (content: string, currentPath?: string | null) => Promise<{ ok: boolean; filePath: string }>;
      openProject: () => Promise<{ canceled: boolean; filePath?: string; content?: string }>;
      openProjectByPath: (filePath: string) => Promise<{ canceled: boolean; filePath?: string; content?: string; error?: string }>;
      importExternal: () => Promise<{ canceled: boolean; filePath?: string; ext?: string; bytes?: Uint8Array }>;
      importAudio: () => Promise<{ canceled: boolean; filePath?: string; name?: string; bytes?: Uint8Array }>;
      exportPng: (dataUrl: string, defaultName: string) => Promise<{ canceled: boolean; filePath?: string }>;
      pickDirectory: () => Promise<{ canceled: boolean; dirPath?: string }>;
      writeFrameToDir: (dirPath: string, name: string, dataUrl: string) => Promise<{ ok: boolean }>;
      saveBinaryFile: (
        defaultName: string,
        filterName: string,
        extensions: string[],
        bytes: Uint8Array
      ) => Promise<{ canceled: boolean; filePath?: string }>;
      openPath: (targetPath: string) => Promise<void>;
    };
  }
}
