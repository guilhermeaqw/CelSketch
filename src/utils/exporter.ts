import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { DrawingLayer } from '../types/harmony';
import { renderFrameToCanvas } from './canvasRenderer';

function getLastUsedFrame(layers: DrawingLayer[], totalFrames: number): number {
  let maxFrame = 1;
  for (const layer of layers) {
    for (const [fKey, strokes] of Object.entries(layer.frames)) {
      if (strokes && strokes.length > 0) {
        maxFrame = Math.max(maxFrame, Number(fKey));
      }
    }
  }
  return Math.min(totalFrames, Math.max(1, maxFrame));
}

export async function exportPngSequence(
  layers: DrawingLayer[],
  startFrame: number,
  endFrame: number,
  width: number,
  height: number,
  projectName: string,
  onProgress?: (msg: string) => void
): Promise<{ canceled?: boolean; dirPath?: string; count?: number }> {
  if (!window.harmonyAPI) return { canceled: true };
  const pick = await window.harmonyAPI.pickDirectory();
  if (pick.canceled || !pick.dirPath) return { canceled: true };

  const offscreen = document.createElement('canvas');
  let count = 0;

  for (let f = startFrame; f <= endFrame; f++) {
    onProgress?.(`Exporting PNG ${f}/${endFrame}...`);
    renderFrameToCanvas(offscreen, layers, f, width, height, '#ffffff');
    const dataUrl = offscreen.toDataURL('image/png');
    const pad = String(f).padStart(4, '0');
    await window.harmonyAPI.writeFrameToDir(pick.dirPath, `${projectName}_${pad}.png`, dataUrl);
    count++;
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.('');
  await window.harmonyAPI.openPath(pick.dirPath);
  return { canceled: false, dirPath: pick.dirPath, count };
}

export async function exportGifAnimation(
  layers: DrawingLayer[],
  startFrame: number,
  endFrame: number,
  fps: number,
  width: number,
  height: number,
  projectName: string,
  onProgress?: (msg: string) => void
): Promise<{ canceled?: boolean; filePath?: string }> {
  if (!window.harmonyAPI) return { canceled: true };

  // Scale down to 960x540 max for fast, crisp GIF encoding
  const scale = Math.min(1, 960 / width);
  const gifW = Math.round(width * scale);
  const gifH = Math.round(height * scale);

  const srcCanvas = document.createElement('canvas');
  const gifCanvas = document.createElement('canvas');
  gifCanvas.width = gifW;
  gifCanvas.height = gifH;
  const gctx = gifCanvas.getContext('2d', { willReadFrequently: true });
  if (!gctx) return { canceled: true };

  const gif = GIFEncoder();
  const delayMs = Math.max(20, Math.round(1000 / fps));

  for (let f = startFrame; f <= endFrame; f++) {
    onProgress?.(`Encoding GIF frame ${f}/${endFrame}...`);
    renderFrameToCanvas(srcCanvas, layers, f, width, height, '#ffffff');
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

  const res = await window.harmonyAPI.saveBinaryFile(
    `${projectName}.gif`,
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
  onProgress?: (msg: string) => void
): Promise<{ canceled?: boolean; filePath?: string }> {
  if (!window.harmonyAPI) return { canceled: true };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const mp4Supported = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E') || MediaRecorder.isTypeSupported('video/mp4');
  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')
    ? 'video/mp4;codecs=avc1.42E01E'
    : MediaRecorder.isTypeSupported('video/mp4')
    ? 'video/mp4'
    : 'video/webm;codecs=vp9';

  const ext = mp4Supported ? 'mp4' : 'webm';
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const donePromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start();
  const frameDuration = 1000 / fps;

  for (let f = startFrame; f <= endFrame; f++) {
    onProgress?.(`Rendering Video frame ${f}/${endFrame}...`);
    renderFrameToCanvas(canvas, layers, f, width, height, '#ffffff');
    await new Promise((r) => setTimeout(r, frameDuration));
  }

  recorder.stop();
  const blob = await donePromise;
  const buffer = await blob.arrayBuffer();
  onProgress?.('');

  const res = await window.harmonyAPI.saveBinaryFile(
    `${projectName}.${ext}`,
    mp4Supported ? 'MP4 Video' : 'WebM Video',
    [ext],
    new Uint8Array(buffer)
  );
  return res;
}
