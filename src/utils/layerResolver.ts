import type { DrawingLayer, LayerTransformKeyframe, Stroke } from '../types/harmony';

export function getInterpolatedLayerTransform(
  layer: DrawingLayer,
  frame: number
): LayerTransformKeyframe {
  const base: LayerTransformKeyframe = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: layer.opacity
  };
  if (!layer.keyframes) return base;
  const keys = Object.keys(layer.keyframes)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) return base;
  if (layer.keyframes[frame]) return layer.keyframes[frame];
  if (frame <= keys[0]) return layer.keyframes[keys[0]];
  if (frame >= keys[keys.length - 1]) return layer.keyframes[keys[keys.length - 1]];

  // Smooth ease-in-out interpolation between surrounding keyframes
  let prevF = keys[0];
  let nextF = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i] <= frame && keys[i + 1] >= frame) {
      prevF = keys[i];
      nextF = keys[i + 1];
      break;
    }
  }
  const tRaw = (frame - prevF) / Math.max(1, nextF - prevF);
  const t = tRaw * tRaw * (3 - 2 * tRaw); // smoothstep ease
  const a = layer.keyframes[prevF];
  const b = layer.keyframes[nextF];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    rotation: a.rotation + (b.rotation - a.rotation) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t
  };
}

const MAX_IMAGE_CACHE = 480;
const imageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(dataUrl: string): HTMLImageElement {
  let img = imageCache.get(dataUrl);
  if (img) {
    // Refresh LRU order
    imageCache.delete(dataUrl);
    imageCache.set(dataUrl, img);
    return img;
  }
  img = new Image();
  img.onload = () => {
    window.dispatchEvent(new Event('celsketch:image-loaded'));
  };
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
  while (imageCache.size > MAX_IMAGE_CACHE) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) break;
    imageCache.delete(oldestKey);
  }
  return img;
}

/**
 * Preload and decode all image strokes in the requested frame range directly into imageCache
 * so exports, thumbnails, and previews never skip Paint Bucket fills or imported images.
 */
export async function preloadFrameImages(
  layers: DrawingLayer[],
  startFrame?: number,
  endFrame?: number
): Promise<void> {
  const urls = new Set<string>();
  for (const layer of layers) {
    if (layer.type === 'folder') continue;
    for (const [fKey, strokes] of Object.entries(layer.frames || {})) {
      const f = Number(fKey);
      // Include earlier frames too in case of holdFrames / celDurations carrying into startFrame..endFrame
      if (endFrame !== undefined && f > endFrame) continue;
      if (startFrame !== undefined && f < startFrame && !layer.holdFrames && !(layer.celDurations && (layer.celDurations[f] || 1) > 1)) {
        continue;
      }
      for (const st of strokes || []) {
        if (st.tool === 'image' && st.imageDataUrl) {
          urls.add(st.imageDataUrl);
        }
      }
    }
  }
  if (urls.size === 0) return;
  await Promise.all(
    Array.from(urls).map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = getCachedImage(url);
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const finish = () => {
            img.removeEventListener('load', finish);
            img.removeEventListener('error', finish);
            resolve();
          };
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        })
    )
  );
}

export function isLayerEffectivelyVisible(layer: DrawingLayer, allLayers: DrawingLayer[]): boolean {
  if (layer.type === 'folder') return false;
  if (!layer.visible) return false;
  // Walk full ancestor folder chain (supports nested folders)
  let curParentId = layer.parentId;
  let guard = 0;
  while (curParentId && guard < 16) {
    const parent = allLayers.find((l) => l.id === curParentId);
    if (!parent) break;
    if (!parent.visible) return false;
    curParentId = parent.parentId;
    guard++;
  }
  // If any layer is Soloed, only Soloed layers render!
  const anySolo = allLayers.some((l) => l.type !== 'folder' && l.solo);
  if (anySolo && !layer.solo) return false;
  return true;
}

export function getLayerEffectiveOpacity(layer: DrawingLayer, allLayers: DrawingLayer[], frame: number): number {
  const kf = getInterpolatedLayerTransform(layer, frame);
  let opacity = kf.opacity;
  let curParentId = layer.parentId;
  let guard = 0;
  while (curParentId && guard < 16) {
    const parent = allLayers.find((l) => l.id === curParentId);
    if (!parent) break;
    opacity *= parent.opacity;
    curParentId = parent.parentId;
    guard++;
  }
  return Math.max(0, Math.min(1, opacity));
}

/**
 * Returns the source start frame number whose strokes array is active on `frame`
 * (or 0 if empty). Allows bitmap caching to deduplicate held cels & holdFrames across frames!
 */
export function getEffectiveCelSourceFrame(layer: DrawingLayer, frame: number): number {
  if (layer.frames[frame] !== undefined) return frame;
  if (layer.celDurations) {
    for (let f = frame - 1; f >= 1; f--) {
      if (layer.frames[f] !== undefined) {
        const dur = layer.celDurations[f] || 1;
        if (dur > 1 && frame < f + dur) return f;
        break;
      }
    }
  }
  if (!layer.holdFrames) return 0;
  for (let f = frame - 1; f >= 1; f--) {
    if (layer.frames[f] !== undefined) return f;
  }
  return 0;
}

export function getEffectiveFrameStrokes(layer: DrawingLayer, frame: number): Stroke[] {
  const direct = layer.frames[frame];
  // Explicit frame entry (even `[]` blank Cel!) takes precedence and stops earlier hold/celDurations
  if (direct !== undefined) return direct;

  // Check explicit Cel Exposure blocks (e.g. celDurations[1] = 3 covers frames 1, 2, 3)
  if (layer.celDurations) {
    for (let f = frame - 1; f >= 1; f--) {
      if (layer.frames[f] !== undefined) {
        const dur = layer.celDurations[f] || 1;
        if (dur > 1 && frame < f + dur) {
          return layer.frames[f];
        }
        break;
      }
    }
  }

  if (!layer.holdFrames) return [];

  // Hold exposure: find the nearest previous frame entry (explicit blank `[]` stops hold!)
  for (let f = frame - 1; f >= 1; f--) {
    const prev = layer.frames[f];
    if (prev !== undefined) return prev;
  }
  return [];
}

/**
 * Zero-phase bidirectional Gaussian smoothing (Clip Studio / SAI style — eliminates hand tremor & digitizer waves
 * while preserving exact start/end points and zero lag/skew!)
 */
