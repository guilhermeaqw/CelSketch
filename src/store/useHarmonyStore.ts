import { create } from 'zustand';
import { ArtLayerId, BrushPresetId, ColourSwatch, DrawingLayer, HarmonyProjectData, Stroke, ToolId } from '../types/harmony';

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
  const ns = Math.max(0, Math.min(1, s + sDelta / 100));
  const nv = Math.max(0, Math.min(1, v + vDelta / 100));

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

interface HarmonyState {
  // Project info
  projectName: string;
  projectPath: string | null;
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
  activeBrushPreset: BrushPresetId;
  activeArtLayer: ArtLayerId;
  activeColor: string;
  brushSize: number;
  brushMinSize: number;
  usePressure: boolean;
  brushOpacity: number;
  brushSmoothing: number;
  shapeFilled: boolean;

  // View state
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
  flipX: boolean;
  grayscaleMode: boolean;
  hsvModalOpen: boolean;
  exportModalOpen: boolean;
  cropMode: boolean;
  showGrid: boolean;
  showCameraFrame: boolean;
  lightTable: boolean;
  onionSkin: boolean;
  onionPrev: number;
  onionNext: number;
  centerTab: 'camera' | 'drawing' | 'node';
  rightTab: 'properties' | 'colour' | 'brushes';

  // Swatches (Harmony Colour Pots)
  swatches: ColourSwatch[];
  activeSwatchId: string;

  // Layers
  layers: DrawingLayer[];
  activeLayerId: string;

  // Undo/Redo
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];

  // Actions
  setTool: (tool: ToolId) => void;
  selectBrushPreset: (preset: BrushPresetId) => void;
  setActiveColor: (hex: string) => void;
  setArtLayer: (artLayer: ArtLayerId) => void;
  setBrushSize: (size: number) => void;
  setBrushMinSize: (minPct: number) => void;
  setUsePressure: (use: boolean) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushSmoothing: (smoothing: number) => void;
  setShapeFilled: (filled: boolean) => void;

  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setRotation: (deg: number) => void;
  resetRotation: () => void;
  toggleFlipX: () => void;
  toggleGrayscaleMode: () => void;
  setHsvModalOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  setCropMode: (open: boolean) => void;
  resizeCanvas: (offsetX: number, offsetY: number, newWidth: number, newHeight: number) => void;
  applyLayerHsv: (hDelta: number, sDelta: number, vDelta: number) => void;
  resetView: () => void;
  toggleGrid: () => void;
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
  importImageLayer: (name: string, dataUrl: string, x: number, y: number, w: number, h: number, opacity?: number) => void;
  deleteLayer: (id: string) => void;
  setActiveLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerHold: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;

  addStroke: (stroke: Stroke) => void;
  moveStrokes: (strokeIds: string[], dx: number, dy: number) => void;
  deleteStrokes: (strokeIds: string[]) => void;
  clearCurrentFrame: () => void;
  duplicateFrameToNext: () => void;

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
  JSON.parse(JSON.stringify(layers));

export const useHarmonyStore = create<HarmonyState>((set, get) => ({
  projectName: 'Untitled_Scene',
  projectPath: null,
  autoSaveEnabled: true,
  autoSaveIntervalSec: 60,
  lastAutoSaveTime: null,
  canvasWidth: 1920,
  canvasHeight: 1080,
  fps: 24,
  totalFrames: 60,
  playStart: 1,
  playEnd: 60,
  currentFrame: 1,
  isPlaying: false,
  loopPlayback: true,

  activeTool: 'brush',
  activeBrushPreset: 'sai_pen',
  activeArtLayer: 'LA',
  activeColor: '#141414',
  brushSize: 18,
  brushMinSize: 5,
  usePressure: true,
  brushOpacity: 1,
  brushSmoothing: 35,
  shapeFilled: false,

  zoom: 0.55,
  panX: 0,
  panY: 0,
  rotation: 0,
  flipX: false,
  grayscaleMode: false,
  hsvModalOpen: false,
  exportModalOpen: false,
  cropMode: false,
  showGrid: true,
  showCameraFrame: true,
  lightTable: false,
  onionSkin: true,
  onionPrev: 2,
  onionNext: 2,
  centerTab: 'camera',
  rightTab: 'colour',

  swatches: DEFAULT_SWATCHES,
  activeSwatchId: 'sw-black',

  layers: createDefaultLayers(),
  activeLayerId: 'layer-1',

  undoStack: [],
  redoStack: [],

  setTool: (activeTool) => set({ activeTool }),
  selectBrushPreset: (preset) => {
    const configs: Record<BrushPresetId, { size: number; minSize: number; opacity: number }> = {
      sai_pen: { size: 14, minSize: 5, opacity: 1 },
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
  setArtLayer: (activeArtLayer) => set({ activeArtLayer }),
  setBrushSize: (brushSize) => set({ brushSize: Math.max(1, Math.min(200, brushSize)) }),
  setBrushMinSize: (brushMinSize) => set({ brushMinSize: Math.max(0, Math.min(100, brushMinSize)) }),
  setUsePressure: (usePressure) => set({ usePressure }),
  setBrushOpacity: (brushOpacity) => set({ brushOpacity: Math.max(0.05, Math.min(1, brushOpacity)) }),
  setBrushSmoothing: (brushSmoothing) => set({ brushSmoothing: Math.max(0, Math.min(100, brushSmoothing)) }),
  setShapeFilled: (shapeFilled) => set({ shapeFilled }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(8, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  setRotation: (rotation) => set({ rotation: ((rotation % 360) + 360) % 360 }),
  resetRotation: () => set({ rotation: 0 }),
  toggleFlipX: () => set((s) => ({ flipX: !s.flipX })),
  toggleGrayscaleMode: () => set((s) => ({ grayscaleMode: !s.grayscaleMode })),
  setHsvModalOpen: (hsvModalOpen) => set({ hsvModalOpen }),
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
  applyLayerHsv: (hDelta, sDelta, vDelta) =>
    set((s) => {
      if (hDelta === 0 && sDelta === 0 && vDelta === 0) return s;
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const updatedFrames: Record<number, Stroke[]> = {};
        for (const [fKey, strokes] of Object.entries(l.frames)) {
          updatedFrames[Number(fKey)] = strokes.map((st) => ({
            ...st,
            color: adjustHexHsv(st.color, hDelta, sDelta, vDelta)
          }));
        }
        return { ...l, frames: updatedFrames };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers
      };
    }),
  resetView: () => set({ zoom: 0.55, panX: 0, panY: 0, rotation: 0, flipX: false }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
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
        activeLayerId: newLayer.id
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
        activeLayerId: newLayer.id
      };
    }),

  deleteLayer: (id) =>
    set((s) => {
      if (s.layers.length <= 1) return s;
      const remaining = s.layers.filter((l) => l.id !== id);
      return {
        undoStack: [...s.undoStack.slice(-39), { layers: cloneLayers(s.layers) }],
        redoStack: [],
        layers: remaining,
        activeLayerId: s.activeLayerId === id ? remaining[0].id : s.activeLayerId
      };
    }),

  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  toggleLayerVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    })),
  toggleLayerLock: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l))
    })),
  toggleLayerHold: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, holdFrames: !l.holdFrames } : l))
    })),
  renameLayer: (id, name) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l))
    })),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l))
    })),
  updateNodePosition: (id, nodeX, nodeY) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, nodeX, nodeY } : l))
    })),

  addStroke: (stroke) =>
    set((s) => {
      const targetLayer = s.layers.find((l) => l.id === s.activeLayerId);
      if (!targetLayer || targetLayer.locked) return s;
      const snapshot = { layers: cloneLayers(s.layers) };
      const layers = s.layers.map((l) => {
        if (l.id !== s.activeLayerId) return l;
        const existing = l.frames[s.currentFrame] || [];
        return {
          ...l,
          frames: {
            ...l.frames,
            [s.currentFrame]: [...existing, stroke]
          }
        };
      });
      return {
        undoStack: [...s.undoStack.slice(-39), snapshot],
        redoStack: [],
        layers
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
        layers
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
        layers
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

  setProjectMeta: (projectName, projectPath) => set({ projectName, projectPath }),
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
    set({
      projectName: data.name || 'Loaded_Scene',
      projectPath: filePath,
      canvasWidth: data.width || 1920,
      canvasHeight: data.height || 1080,
      fps: data.fps || 24,
      totalFrames: data.totalFrames || 60,
      currentFrame: 1,
      swatches: data.swatches?.length ? data.swatches : DEFAULT_SWATCHES,
      activeSwatchId: data.swatches?.[0]?.id || 'sw-black',
      layers: data.layers?.length ? data.layers : createDefaultLayers(),
      activeLayerId: data.layers?.[0]?.id || 'layer-1',
      undoStack: [],
      redoStack: []
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
