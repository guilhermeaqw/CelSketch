import { readPsd } from 'ag-psd';
import JSZip from 'jszip';

export interface ImportedLayerItem {
  name: string;
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1920, h: img.naturalHeight || 1080 });
    img.onerror = () => resolve({ w: 1920, h: 1080 });
    img.src = dataUrl;
  });
}

function extractEmbeddedPngFromBinary(bytes: Uint8Array): Uint8Array | null {
  // Find PNG header: 89 50 4E 47 0D 0A 1A 0A
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const iend = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

  let bestPng: Uint8Array | null = null;
  for (let i = 0; i < bytes.length - 16; i++) {
    let match = true;
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    // Find IEND chunk
    for (let k = i + 8; k < bytes.length - 8; k++) {
      let endMatch = true;
      for (let j = 0; j < iend.length; j++) {
        if (bytes[k + j] !== iend[j]) {
          endMatch = false;
          break;
        }
      }
      if (endMatch) {
        const candidate = bytes.slice(i, k + 8);
        if (!bestPng || candidate.length > bestPng.length) {
          bestPng = candidate;
        }
        i = k + 8;
        break;
      }
    }
  }
  return bestPng;
}

export async function parseExternalArtwork(
  fileName: string,
  ext: string,
  bytes: Uint8Array
): Promise<ImportedLayerItem[]> {
  const baseName = fileName.replace(/\.[^.]+$/, '');

  // 1. PSD (Layered)
  if (ext === 'psd') {
    const psd = readPsd(bytes.buffer as ArrayBuffer);
    const results: ImportedLayerItem[] = [];

    if (psd.children && psd.children.length > 0) {
      for (const child of psd.children) {
        if (child.hidden) continue;
        if (child.canvas) {
          const dataUrl = child.canvas.toDataURL('image/png');
          results.push({
            name: child.name || `${baseName}_Layer`,
            dataUrl,
            x: child.left || 0,
            y: child.top || 0,
            w: child.canvas.width,
            h: child.canvas.height,
            opacity: child.opacity !== undefined ? child.opacity : 1
          });
        }
      }
    }

    if (results.length === 0 && psd.canvas) {
      results.push({
        name: baseName,
        dataUrl: psd.canvas.toDataURL('image/png'),
        x: 0,
        y: 0,
        w: psd.canvas.width,
        h: psd.canvas.height,
        opacity: 1
      });
    }
    return results;
  }

  // 2. KRA (Krita ZIP archive)
  if (ext === 'kra') {
    const zip = await JSZip.loadAsync(bytes);
    const merged = zip.file('mergedimage.png') || zip.file('preview.png');
    if (merged) {
      const pngBytes = await merged.async('uint8array');
      const dataUrl = `data:image/png;base64,${uint8ToBase64(pngBytes)}`;
      const { w, h } = await loadImageSize(dataUrl);
      return [{ name: baseName, dataUrl, x: 0, y: 0, w, h, opacity: 1 }];
    }
    return [];
  }

  // 3. CLIP (Extract largest embedded PNG preview from container)
  if (ext === 'clip') {
    const pngBytes = extractEmbeddedPngFromBinary(bytes);
    if (pngBytes) {
      const dataUrl = `data:image/png;base64,${uint8ToBase64(pngBytes)}`;
      const { w, h } = await loadImageSize(dataUrl);
      return [{ name: baseName, dataUrl, x: 0, y: 0, w, h, opacity: 1 }];
    }
    return [];
  }

  // 4. Standard Images (PNG, JPG, WEBP, BMP, SVG)
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml'
  };
  const mime = mimeMap[ext] || 'image/png';
  const dataUrl = `data:${mime};base64,${uint8ToBase64(bytes)}`;
  const { w, h } = await loadImageSize(dataUrl);
  return [{ name: baseName, dataUrl, x: 0, y: 0, w, h, opacity: 1 }];
}
