const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'email', 'password', 'url', 'tel']);

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has((target.type || 'text').toLowerCase());
  }
  return false;
}

export async function decodeAudioBufferTrack(
  bytes: Uint8Array,
  name: string,
  filePath?: string
): Promise<{ name: string; filePath?: string; objectUrl: string; peaks: number[]; duration: number } | null> {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4'
  };
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type: mimeMap[ext] || 'audio/mpeg' });
  const objectUrl = URL.createObjectURL(blob);
  const audioCtx = new AudioContext();
  try {
    const ab = copy.buffer.slice(0);
    const decoded = await audioCtx.decodeAudioData(ab);
    const raw = decoded.getChannelData(0);
    const numBars = 220;
    const blockSize = Math.max(1, Math.floor(raw.length / numBars));
    const peaks: number[] = [];
    for (let i = 0; i < numBars; i++) {
      let max = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize && start + j < raw.length; j += 8) {
        const v = Math.abs(raw[start + j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    return { name, filePath, objectUrl, peaks, duration: decoded.duration };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    console.error('Failed to decode audio:', err);
    return null;
  } finally {
    await audioCtx.close().catch(() => {});
  }
}
