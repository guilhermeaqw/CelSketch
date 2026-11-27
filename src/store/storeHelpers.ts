import type { ColourSwatch, DrawingLayer, Stroke } from '../types/harmony';
import type { HarmonyState, HistorySnapshot, SceneTab } from './types';

export const DEFAULT_SWATCHES: ColourSwatch[] = [
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

export const createDefaultLayers = (): DrawingLayer[] => [
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
export const cloneLayers = (layers: DrawingLayer[]): DrawingLayer[] =>
  layers.map((l) => ({
    ...l,
    frames: { ...l.frames },
    celDurations: l.celDurations ? { ...l.celDurations } : undefined,
    frameTags: l.frameTags ? { ...l.frameTags } : undefined,
    keyframes: l.keyframes ? { ...l.keyframes } : undefined,
    cameraKeyframes: l.cameraKeyframes ? { ...l.cameraKeyframes } : undefined,
    cameraEffects: l.cameraEffects ? l.cameraEffects.map((fx) => ({ ...fx })) : undefined,
    effects: l.effects ? { ...l.effects } : undefined
  }));

/**
 * Auto-split/trim any earlier stretched Cel that overlaps targetFrame:
 * e.g. Cel at F1 stretched 8f (1..8) -> creating a new Cel at F4 cleanly splits it into F1 (3f) + F4 (5f)!
 */
export function splitCelDurationsAt(
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

export function cloneStrokesWithNewIds(strokes: Stroke[], prefix = 'st-copy'): Stroke[] {
  const base = Date.now();
  return strokes.map((st, idx) => {
    const cloned: Stroke =
      typeof structuredClone === 'function' ? structuredClone(st) : JSON.parse(JSON.stringify(st));
    cloned.id = `${prefix}-${base}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    return cloned;
  });
}

export function makeSnapshot(s: HarmonyState): HistorySnapshot {
  return {
    layers: cloneLayers(s.layers),
    activeLayerId: s.activeLayerId,
    canvasWidth: s.canvasWidth,
    canvasHeight: s.canvasHeight
  };
}

export function syncActiveTabInList(s: HarmonyState): SceneTab[] {
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

export function findCoveringCelStart(layer: DrawingLayer, frame: number): number | null {
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

export function shiftRecordKeys<T>(rec: Record<number, T> | undefined, fromFrame: number, delta: number): Record<number, T> {
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

export const USER_PREFS_KEY = 'celsketch_user_prefs';

export function loadUserPrefs(): Record<string, any> {
  try {
    const raw = localStorage.getItem(USER_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const savedPrefs = loadUserPrefs();


export const PREF_KEYS = [
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
  'performanceMode',
  'showBrushSizeHud'
] as const;

