import { DEFAULT_POST_PROCESS } from '../../utils/postProcessUtils';
import type { HarmonyGet, HarmonySet, HarmonyState, SceneTab } from '../types';
import {
  DEFAULT_SWATCHES,
  cloneLayers,
  createDefaultLayers,
  makeSnapshot,
  syncActiveTabInList
} from '../storeHelpers';

export const createProjectSlice = (set: HarmonySet, get: HarmonyGet): Partial<HarmonyState> => ({
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
});
