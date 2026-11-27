import { DrawingLayer, PostProcessSettings } from '../types/harmony';
import { preloadFrameImages, renderFrameToCanvas } from './canvasRenderer';

function sanitizeExportName(name: string): string {
  const cleaned = (name || 'CelSketch').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return cleaned || 'CelSketch';
}

export function pickSupportedVideoCodec(): { mimeType: string; ext: 'mp4' | 'webm'; label: string } {
  const candidates: { mimeType: string; ext: 'mp4' | 'webm'; label: string }[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4', label: 'MP4 Video' },
    { mimeType: 'video/mp4', ext: 'mp4', label: 'MP4 Video' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm', label: 'WebM Video' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm', label: 'WebM Video' },
    { mimeType: 'video/webm', ext: 'webm', label: 'WebM Video' }
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: 'video/webm', ext: 'webm', label: 'WebM Video' };
}

export async function exportPngSequence(
  layers: DrawingLayer[],
  startFrame: number,
  endFrame: number,
  width: number,
  height: number,
  projectName: string,
  onProgress?: (msg: string) => void,
  transparentBg = false,
  postProcess?: PostProcessSettings | null
): Promise<{ canceled?: boolean; dirPath?: string; count?: number; error?: string }> {
  if (!window.harmonyAPI) return { canceled: true };
  const sFrame = Math.min(startFrame, endFrame);
  const eFrame = Math.max(startFrame, endFrame);
  const pick = await window.harmonyAPI.pickDirectory('Selecionar pasta para Sequência PNG');
  if (pick.canceled || !pick.dirPath) return { canceled: true };

  onProgress?.('Preparando imagens...');
  await preloadFrameImages(layers, sFrame, eFrame);

  const safeName = sanitizeExportName(projectName);
  const offscreen = document.createElement('canvas');
  let count = 0;

  try {
    for (let f = sFrame; f <= eFrame; f++) {
      onProgress?.(`Exportando PNG ${f}/${eFrame}...`);
      renderFrameToCanvas(offscreen, layers, f, width, height, transparentBg ? null : '#ffffff', true, postProcess);
      const dataUrl = offscreen.toDataURL('image/png');
      const pad = String(f).padStart(4, '0');
      const writeRes = await window.harmonyAPI.writeFrameToDir(pick.dirPath, `${safeName}_${pad}.png`, dataUrl);
      if (!writeRes?.ok) {
        return { canceled: false, error: writeRes?.error || 'Falha ao gravar PNG' };
      }
      count++;
      await new Promise((r) => setTimeout(r, 0));
    }

    await window.harmonyAPI.openPath(pick.dirPath);
    return { canceled: false, dirPath: pick.dirPath, count };
  } finally {
    onProgress?.('');
  }
}

export function computeGifDimensions(width: number, height: number): { gifW: number; gifH: number } {
  const scale = Math.min(1, 960 / width, 960 / height);
  return {
    gifW: Math.max(2, Math.round(width * scale)),
    gifH: Math.max(2, Math.round(height * scale))
  };
}

export async function exportGifAnimation(
  layers: DrawingLayer[],
  startFrame: number,
  endFrame: number,
  fps: number,
  width: number,
  height: number,
  projectName: string,
  onProgress?: (msg: string) => void,
  postProcess?: PostProcessSettings | null
): Promise<{ canceled?: boolean; filePath?: string; error?: string }> {
  if (!window.harmonyAPI) return { canceled: true };
  const sFrame = Math.min(startFrame, endFrame);
  const eFrame = Math.max(startFrame, endFrame);

  onProgress?.('Preparando imagens...');
  await preloadFrameImages(layers, sFrame, eFrame);

  const { gifW, gifH } = computeGifDimensions(width, height);
  const srcCanvas = document.createElement('canvas');
  const gifCanvas = document.createElement('canvas');
  gifCanvas.width = gifW;
  gifCanvas.height = gifH;
  const gctx = gifCanvas.getContext('2d', { willReadFrequently: true });
  if (!gctx) return { canceled: true };

  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  const delayMs = Math.max(20, Math.round(1000 / Math.max(1, fps)));

  for (let f = sFrame; f <= eFrame; f++) {
    onProgress?.(`Codificando GIF frame ${f}/${eFrame}...`);
    renderFrameToCanvas(srcCanvas, layers, f, width, height, '#ffffff', true, postProcess);
    gctx.clearRect(0, 0, gifW, gifH);
    gctx.drawImage(srcCanvas, 0, 0, gifW, gifH);
    const { data } = gctx.getImageData(0, 0, gifW, gifH);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, gifW, gifH, { palette, delay: delayMs });
    await new Promise((r) => setTimeout(r, 0));
  }

  gif.finish();
  const bytes = gif.bytes();
  onProgress?.('');

  const safeName = sanitizeExportName(projectName);
  const res = await window.harmonyAPI.saveBinaryFile(
    `${safeName}.gif`,
    'Animated GIF',
    ['gif'],
    bytes
  );
  return res;
}

export async function exportVideoAnimation(
  layers: DrawingLayer[],
  startFrame: number,
  endFrame: number,
  fps: number,
  width: number,
  height: number,
  projectName: string,
  onProgress?: (msg: string) => void,
  postProcess?: PostProcessSettings | null
): Promise<{ canceled?: boolean; filePath?: string; error?: string }> {
  if (!window.harmonyAPI) return { canceled: true };
  const sFrame = Math.min(startFrame, endFrame);
  const eFrame = Math.max(startFrame, endFrame);

  onProgress?.('Preparando imagens...');
  await preloadFrameImages(layers, sFrame, eFrame);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const codec = pickSupportedVideoCodec();
  const safeFps = Math.max(1, fps);
  // Use manual frame capture (0) when requestFrame() is available so heavy frames never cause duplicate-frame drift!
  let stream = canvas.captureStream(0);
  let videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  if (!videoTrack || typeof videoTrack.requestFrame !== 'function') {
    stream.getTracks().forEach((t) => t.stop());
    stream = canvas.captureStream(safeFps);
    videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  }
  const recorder = new MediaRecorder(stream, {
    mimeType: codec.mimeType,
    videoBitsPerSecond: 8_000_000
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const donePromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: codec.mimeType }));
    recorder.onerror = (ev) => reject(new Error(`Erro no MediaRecorder: ${(ev as ErrorEvent).message || 'falha na gravação'}`));
  });

  try {
    // Draw initial frame BEFORE starting recorder so frame 1 is never blank!
    renderFrameToCanvas(canvas, layers, sFrame, width, height, '#ffffff', true, postProcess);
    recorder.start();
    const frameDuration = 1000 / safeFps;
    let nextTick = performance.now();

    for (let f = sFrame; f <= eFrame; f++) {
      onProgress?.(`Renderizando Vídeo frame ${f}/${eFrame}...`);
      if (f > sFrame) {
        renderFrameToCanvas(canvas, layers, f, width, height, '#ffffff', true, postProcess);
      }
      videoTrack?.requestFrame?.();
      nextTick += frameDuration;
      const waitMs = Math.max(0, nextTick - performance.now());
      await new Promise((r) => setTimeout(r, waitMs));
    }

    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await donePromise;
    const buffer = await blob.arrayBuffer();

    const safeName = sanitizeExportName(projectName);
    const res = await window.harmonyAPI.saveBinaryFile(
      `${safeName}.${codec.ext}`,
      codec.label,
      [codec.ext],
      new Uint8Array(buffer)
    );
    return res;
  } finally {
    onProgress?.('');
    stream.getTracks().forEach((t) => t.stop());
  }
}
