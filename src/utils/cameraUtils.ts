import { CameraEffect, CameraEffectType, CameraKeyframe, DrawingLayer, KeyframeEasing } from '../types/harmony';

export interface CameraEffectPresetMeta {
  type: CameraEffectType;
  label: string;
  shortDesc: string;
  color: string;
  defaultDuration: number;
  defaultWholeScene: boolean;
  defaultIntensity: number;
  defaultSpeed: number;
}

export const CAMERA_EFFECT_PRESETS: CameraEffectPresetMeta[] = [
  {
    type: 'impact_shake',
    label: 'Shake de Impacto',
    shortDesc: 'Tranco forte de soco/explosão que amortece rápido',
    color: '#f59e0b',
    defaultDuration: 10,
    defaultWholeScene: false,
    defaultIntensity: 45,
    defaultSpeed: 1.4
  },
  {
    type: 'wind_sway',
    label: 'Vento Leve / Respiração',
    shortDesc: 'Balanço suave e orgânico dando vida à cena',
    color: '#34d399',
    defaultDuration: 48,
    defaultWholeScene: true,
    defaultIntensity: 25,
    defaultSpeed: 0.9
  },
  {
    type: 'handheld',
    label: 'Câmera na Mão',
    shortDesc: 'Micro-movimento realista estilo cinema/documentário',
    color: '#60a5fa',
    defaultDuration: 48,
    defaultWholeScene: true,
    defaultIntensity: 30,
    defaultSpeed: 1.0
  },
  {
    type: 'earthquake',
    label: 'Terremoto / Power-Up',
    shortDesc: 'Vibração contínua intensa (trem, motor, aura)',
    color: '#ef4444',
    defaultDuration: 24,
    defaultWholeScene: false,
    defaultIntensity: 55,
    defaultSpeed: 1.8
  },
  {
    type: 'punch_zoom',
    label: 'Zoom de Impacto',
    shortDesc: 'Tranco rápido de aproximação com retorno elástico',
    color: '#a855f7',
    defaultDuration: 12,
    defaultWholeScene: false,
    defaultIntensity: 40,
    defaultSpeed: 1.0
  },
  {
    type: 'heartbeat',
    label: 'Pulso / Batida',
    shortDesc: 'Dois pulsos rítmicos de tensão ou batida musical',
    color: '#ec4899',
    defaultDuration: 48,
    defaultWholeScene: true,
    defaultIntensity: 35,
    defaultSpeed: 1.0
  },
  {
    type: 'float_drift',
    label: 'Flutuar / Barco / Sonho',
    shortDesc: 'Movimento lento ondulante em figura-8',
    color: '#22d3ee',
    defaultDuration: 60,
    defaultWholeScene: true,
    defaultIntensity: 35,
    defaultSpeed: 0.75
  }
];

function deterministicNoise(t: number, seed: number): number {
  const s = seed * 13.37;
  return (
    Math.sin(t * 1.13 + s) * 0.48 +
    Math.sin(t * 2.71 + s * 1.9 + 1.4) * 0.32 +
    Math.cos(t * 5.17 - s * 0.7 + 2.8) * 0.2
  );
}

/**
 * Evaluates all active non-destructive camera effects at a given frame and returns
 * additive offsets (dx, dy, dRot) and multiplicative zoom factor (zoomMult).
 */
export function evaluateCameraEffects(
  effects: CameraEffect[] | undefined,
  frame: number
): { dx: number; dy: number; dRot: number; zoomMult: number } {
  if (!effects || effects.length === 0) {
    return { dx: 0, dy: 0, dRot: 0, zoomMult: 1 };
  }

  let dx = 0;
  let dy = 0;
  let dRot = 0;
  let zoomMult = 1;

  for (const fx of effects) {
    if (!fx.enabled) continue;
    const dur = Math.max(1, fx.duration || 1);
    if (!fx.wholeScene) {
      if (frame < fx.startFrame || frame > fx.startFrame + dur) continue;
    }

    const rel = fx.wholeScene ? frame - 1 : frame - fx.startFrame;
    const progress = fx.wholeScene ? 0 : Math.max(0, Math.min(1, rel / dur));
    const amp = Math.max(0, fx.intensity) / 100; // 0 .. 1
    const spd = Math.max(0.2, fx.speed || 1);
    const seed = fx.seed || 1;

    switch (fx.type) {
      case 'impact_shake': {
        // Sharp exponential decay impact hit (snaps to 0 at end)
        const decay = fx.wholeScene ? 1 : Math.pow(1 - progress, 1.85);
        const pxAmp = 75 * amp * decay;
        const phase = rel * 2.4 * spd + seed;
        const alt = rel % 2 === 0 ? 1 : -1;
        dx += alt * pxAmp * (0.65 + 0.35 * Math.sin(phase * 1.7));
        dy += -alt * pxAmp * 0.72 * (0.55 + 0.45 * Math.cos(phase * 2.1));
        dRot += alt * 4.2 * amp * decay;
        break;
      }
      case 'wind_sway': {
        // Gentle organic breeze / breathing camera
        const t = rel * 0.14 * spd;
        const env = fx.wholeScene
          ? 1
          : Math.sin(progress * Math.PI); // smooth fade in/out if bounded
        const pxAmp = 26 * amp * env;
        dx += (Math.sin(t + seed) * 0.7 + Math.sin(t * 0.47 + seed * 2) * 0.3) * pxAmp;
        dy += (Math.cos(t * 0.82 + seed * 1.3) * 0.65 + Math.sin(t * 1.55) * 0.35) * pxAmp * 0.65;
        dRot += Math.sin(t * 0.65 + seed) * 1.4 * amp * env;
        break;
      }
      case 'handheld': {
        // Natural multi-frequency handheld camera operator micro-drift
        const t = rel * 0.32 * spd;
        const env = fx.wholeScene ? 1 : Math.min(1, progress * 5, (1 - progress) * 5);
        const pxAmp = 34 * amp * env;
        dx += deterministicNoise(t, seed) * pxAmp;
        dy += deterministicNoise(t + 17.3, seed + 5) * pxAmp * 0.85;
        dRot += deterministicNoise(t * 0.6 + 3.1, seed + 11) * 1.8 * amp * env;
        break;
      }
      case 'earthquake': {
        // Heavy continuous rumble (fades in/out briefly on first & last 15% when bounded)
        const env = fx.wholeScene
          ? 1
          : Math.min(1, progress / 0.12, (1 - progress) / 0.15);
        const pxAmp = 52 * amp * Math.max(0, env);
        const f1 = rel * 3.1 * spd;
        dx += Math.sin(f1 * 1.9 + seed) * pxAmp;
        dy += Math.cos(f1 * 2.7 + seed * 1.5) * pxAmp * 0.85;
        dRot += Math.sin(f1 * 2.3 + seed * 0.8) * 2.6 * amp * Math.max(0, env);
        break;
      }
      case 'punch_zoom': {
        // Fast anime hit punch-in with smooth elastic settle back to 1.0x
        const t = fx.wholeScene ? ((rel * spd) % 24) / 24 : progress;
        const peak = t < 0.2 ? t / 0.2 : Math.pow(1 - (t - 0.2) / 0.8, 1.9);
        zoomMult *= 1 + 0.45 * amp * Math.max(0, peak);
        dRot += Math.sin(t * Math.PI * 2) * 1.6 * amp * Math.max(0, peak);
        break;
      }
      case 'heartbeat': {
        // Lub-dub rhythmic double pulse (24 frames per beat cycle at speed 1.0)
        const cycle = ((rel * spd) % 24) / 24;
        const pulse1 = Math.exp(-Math.pow((cycle - 0.12) / 0.055, 2));
        const pulse2 = 0.65 * Math.exp(-Math.pow((cycle - 0.28) / 0.06, 2));
        const pulse = Math.max(pulse1, pulse2);
        const env = fx.wholeScene ? 1 : Math.min(1, progress * 6, (1 - progress) * 6);
        zoomMult *= 1 + 0.16 * amp * pulse * env;
        dy += -8 * amp * pulse * env;
        break;
      }
      case 'float_drift': {
        // Slow dreamy figure-8 floating / boat sway
        const t = rel * 0.095 * spd;
        const env = fx.wholeScene ? 1 : Math.sin(progress * Math.PI);
        const pxAmp = 44 * amp * env;
        dx += Math.sin(t + seed) * pxAmp;
        dy += Math.sin(t * 2 + seed) * pxAmp * 0.55;
        dRot += Math.cos(t + seed) * 2.8 * amp * env;
        break;
      }
    }
  }

  return { dx, dy, dRot, zoomMult };
}

export interface ResolvedCamera {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  easing: KeyframeEasing;
  hasKeyframeAtFrame: boolean;
}

export const DEFAULT_CAMERA: ResolvedCamera = {
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
  easing: 'ease-in-out',
  hasKeyframeAtFrame: false
};

export function applyEasing(t: number, easing: KeyframeEasing = 'ease-in-out'): number {
  const c = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'hold':
      return 0;
    case 'linear':
      return c;
    case 'ease-in':
      return c * c * c;
    case 'ease-out': {
      const inv = 1 - c;
      return 1 - inv * inv * inv;
    }
    case 'ease-in-out':
    default:
      // Smooth cubic ease-in-out (classic cinema camera feel)
      return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
  }
}

export function getActiveCameraLayer(layers: DrawingLayer[]): DrawingLayer | null {
  return layers.find((l) => l.type === 'camera' && l.visible) || null;
}

export function getAnyCameraLayer(layers: DrawingLayer[]): DrawingLayer | null {
  return layers.find((l) => l.type === 'camera') || null;
}

/**
 * Computes interpolated 2D Camera state at a given frame.
 * Uses logarithmic zoom interpolation (like Toon Boom Harmony / After Effects)
 * so zoom-ins and zoom-outs have uniform perceptual speed.
 */
export function getInterpolatedCamera(
  cameraLayer: DrawingLayer | null | undefined,
  frame: number,
  includeEffects = true
): ResolvedCamera {
  if (!cameraLayer || cameraLayer.type !== 'camera') {
    return { ...DEFAULT_CAMERA };
  }

  const withFx = (base: ResolvedCamera): ResolvedCamera => {
    if (!includeEffects || !cameraLayer.cameraEffects || cameraLayer.cameraEffects.length === 0) {
      return base;
    }
    const fx = evaluateCameraEffects(cameraLayer.cameraEffects, frame);
    return {
      ...base,
      x: base.x + fx.dx,
      y: base.y + fx.dy,
      zoom: Math.max(0.2, Math.min(8, base.zoom * fx.zoomMult)),
      rotation: base.rotation + fx.dRot
    };
  };

  const kfs = cameraLayer.cameraKeyframes;
  if (!kfs) return withFx({ ...DEFAULT_CAMERA });
  const keys = Object.keys(kfs)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (keys.length === 0) return withFx({ ...DEFAULT_CAMERA });

  if (kfs[frame]) {
    const k = kfs[frame];
    return withFx({
      x: k.x,
      y: k.y,
      zoom: Math.max(0.2, Math.min(8, k.zoom || 1)),
      rotation: k.rotation || 0,
      easing: k.easing || 'ease-in-out',
      hasKeyframeAtFrame: true
    });
  }

  let prevKey: number | null = null;
  let nextKey: number | null = null;
  for (const k of keys) {
    if (k < frame) prevKey = k;
    else if (k > frame && nextKey === null) {
      nextKey = k;
      break;
    }
  }

  if (prevKey !== null && nextKey !== null) {
    const a = kfs[prevKey];
    const b = kfs[nextKey];
    const easing: KeyframeEasing = a.easing || 'ease-in-out';
    const rawT = (frame - prevKey) / (nextKey - prevKey);
    const t = applyEasing(rawT, easing);
    const z0 = Math.max(0.2, a.zoom || 1);
    const z1 = Math.max(0.2, b.zoom || 1);
    // Logarithmic zoom interpolation for natural cinematic zoom speed
    const zoom = z0 * Math.pow(z1 / z0, t);
    return withFx({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      zoom,
      rotation: a.rotation + (b.rotation - a.rotation) * t,
      easing,
      hasKeyframeAtFrame: false
    });
  }

  const edge = prevKey !== null ? kfs[prevKey] : kfs[nextKey!];
  return withFx({
    x: edge.x,
    y: edge.y,
    zoom: Math.max(0.2, Math.min(8, edge.zoom || 1)),
    rotation: edge.rotation || 0,
    easing: edge.easing || 'ease-in-out',
    hasKeyframeAtFrame: false
  });
}

/**
 * Applies the 2D Camera view transform to a Canvas 2D context (mapping camera viewport -> canvas frame).
 * Note: Moving camera right (+x) shifts artwork left (-x); zooming in (>1) scales artwork up;
 * rotating camera CW (+deg) rotates artwork CCW (-deg).
 */
export function applyCameraTransformToCtx(
  ctx: CanvasRenderingContext2D,
  cam: Pick<CameraKeyframe, 'x' | 'y' | 'zoom' | 'rotation'>,
  canvasWidth: number,
  canvasHeight: number
): void {
  const z = Math.max(0.2, Math.min(8, cam.zoom || 1));
  const rotRad = -((cam.rotation || 0) * Math.PI) / 180;
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(z, z);
  ctx.rotate(rotRad);
  ctx.translate(-canvasWidth / 2 - (cam.x || 0), -canvasHeight / 2 - (cam.y || 0));
}

/**
 * Exact inverse of applyCameraTransformToCtx:
 * maps a point in camera-viewed output canvas space back into true artwork canvas space
 * so drawing, erasing, selecting, and transforming work accurately while in Camera View Mode.
 */
export function cameraViewToArtwork(
  x: number,
  y: number,
  cam: Pick<CameraKeyframe, 'x' | 'y' | 'zoom' | 'rotation'>,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const z = Math.max(0.2, Math.min(8, cam.zoom || 1));
  const sx = (x - canvasWidth / 2) / z;
  const sy = (y - canvasHeight / 2) / z;
  const invRad = ((cam.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(invRad);
  const sin = Math.sin(invRad);
  const rx = sx * cos - sy * sin;
  const ry = sx * sin + sy * cos;
  return {
    x: rx + canvasWidth / 2 + (cam.x || 0),
    y: ry + canvasHeight / 2 + (cam.y || 0)
  };
}

/**
 * Computes the 4 corners (in canvas coordinates) of the 2D Camera framing rectangle.
 */
export function getCameraFrameCorners(
  cam: Pick<CameraKeyframe, 'x' | 'y' | 'zoom' | 'rotation'>,
  canvasWidth: number,
  canvasHeight: number
): { tl: { x: number; y: number }; tr: { x: number; y: number }; br: { x: number; y: number }; bl: { x: number; y: number }; center: { x: number; y: number }; rotHandle: { x: number; y: number } } {
  const z = Math.max(0.2, Math.min(8, cam.zoom || 1));
  const hw = canvasWidth / (2 * z);
  const hh = canvasHeight / (2 * z);
  const cx = canvasWidth / 2 + (cam.x || 0);
  const cy = canvasHeight / 2 + (cam.y || 0);
  const rad = ((cam.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const toWorld = (lx: number, ly: number) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos
  });

  return {
    tl: toWorld(-hw, -hh),
    tr: toWorld(hw, -hh),
    br: toWorld(hw, hh),
    bl: toWorld(-hw, hh),
    center: { x: cx, y: cy },
    rotHandle: toWorld(0, -hh - Math.max(36, hh * 0.14))
  };
}

/**
 * Samples the camera center trajectory across frames for Motion Path visualization.
 */
export function sampleCameraMotionPath(
  cameraLayer: DrawingLayer,
  maxFrame: number
): Array<{ frame: number; x: number; y: number; isKey: boolean }> {
  const kfs = cameraLayer.cameraKeyframes;
  if (!kfs) return [];
  const keys = Object.keys(kfs)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (keys.length < 2) return [];

  const first = Math.max(1, keys[0]);
  const last = Math.min(maxFrame, keys[keys.length - 1]);
  const pts: Array<{ frame: number; x: number; y: number; isKey: boolean }> = [];
  for (let f = first; f <= last; f++) {
    const cam = getInterpolatedCamera(cameraLayer, f, false);
    pts.push({
      frame: f,
      x: cam.x,
      y: cam.y,
      isKey: Boolean(kfs[f])
    });
  }
  return pts;
}
