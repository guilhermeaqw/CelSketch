import type { DrawingLayer, LayerTransformKeyframe, PoseTag, Stroke } from '../../types/harmony';
import type { HarmonyGet, HarmonySet, HarmonyState } from '../types';
import {
  cloneLayers,
  cloneStrokesWithNewIds,
  findCoveringCelStart,
  makeSnapshot,
  resolveEffectiveStrokes,
  shiftRecordKeys,
  splitCelDurationsAt
} from '../storeHelpers';

export const createCelAndStrokeSlice = (set: HarmonySet, _get: HarmonyGet): Partial<HarmonyState> => ({
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

});
