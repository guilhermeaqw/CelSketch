import { renderFrameToCanvas } from '../../utils/canvasRenderer';
import { CAMERA_EFFECT_PRESETS, getInterpolatedCamera } from '../../utils/cameraUtils';
import type { CameraEffect, CameraKeyframe, DrawingLayer, KeyframeEasing, Stroke } from '../../types/harmony';
import type { HarmonyGet, HarmonySet, HarmonyState } from '../types';
import { cloneLayers, cloneStrokesWithNewIds, makeSnapshot, resolveEffectiveStrokes } from '../storeHelpers';

export const createLayerSlice = (set: HarmonySet, _get: HarmonyGet): Partial<HarmonyState> => ({
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
});
