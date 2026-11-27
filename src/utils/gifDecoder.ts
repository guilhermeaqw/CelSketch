export interface DecodedGif {
  width: number;
  height: number;
  frames: HTMLCanvasElement[];
  durationsMs: number[];
}

export async function decodeAnimatedGif(arrayBuffer: ArrayBuffer): Promise<DecodedGif | null> {
  const ImageDecoderCtor = (window as any).ImageDecoder;
  if (typeof ImageDecoderCtor !== 'function') return null;

  let decoder: any = null;
  try {
    decoder = new ImageDecoderCtor({
      data: new Uint8Array(arrayBuffer.slice(0)),
      type: 'image/gif'
    });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const rawCount = Number(track?.frameCount || 0);
    if (rawCount <= 1) return null;

    const maxFrames = Math.min(rawCount, 300);
    const frames: HTMLCanvasElement[] = [];
    const durationsMs: number[] = [];
    let w = 0;
    let h = 0;

    for (let i = 0; i < maxFrames; i++) {
      const result = await decoder.decode({ frameIndex: i });
      const vf = result.image;
      w = vf.displayWidth || vf.codedWidth || w || 256;
      h = vf.displayHeight || vf.codedHeight || h || 256;

      // Cap huge GIF dimensions gently so RAM stays light
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(1, w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(vf, 0, 0, cw, ch);
      }
      const durMicros = typeof vf.duration === 'number' && vf.duration > 0 ? vf.duration : 80_000;
      const durMs = Math.max(20, Math.round(durMicros / 1000));
      vf.close();
      frames.push(canvas);
      durationsMs.push(durMs);
    }

    return { width: w, height: h, frames, durationsMs };
  } catch (err) {
    console.warn('Animated GIF ImageDecoder fallback:', err);
    return null;
  } finally {
    try {
      decoder?.close?.();
    } catch {
      // ignore
    }
  }
}

export async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return await res.arrayBuffer();
}
