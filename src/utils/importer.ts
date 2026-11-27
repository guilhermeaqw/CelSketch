import type { Layer as PsdLayer } from 'ag-psd';

export interface ImportedLayerItem {
  name: string;
  type?: 'drawing' | 'folder';
  parentName?: string;
  folderKey?: string;
  parentKey?: string;
  dataUrl?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  opacity?: number;
  blendMode?: GlobalCompositeOperation;
  visible?: boolean;
}

const PSD_BLEND_MAP: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity'
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1920, h: img.naturalHeight || 1080 });
    img.onerror = () => reject(new Error('Imagem inválida ou corrompida'));
    img.src = dataUrl;
  });
}

/**
 * Fast O(N) PNG extractor for .clip containers using PNG chunk-length walking
 * (no quadratic scan, no UI freeze, handles IEND at exact EOF).
 */
function extractEmbeddedPngFromBinary(bytes: Uint8Array): Uint8Array | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let bestPng: Uint8Array | null = null;

  for (let i = 0; i <= bytes.length - 16; i++) {
    if (bytes[i] !== 0x89 || bytes[i + 1] !== 0x50) continue;
    let match = true;
    for (let j = 2; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    // Walk PNG chunks starting at i + 8: [4-byte BE length][4-byte type][data][4-byte CRC]
    let pos = i + 8;
    let validEnd = -1;
    while (pos + 12 <= bytes.length) {
      const chunkLen = view.getUint32(pos, false);
      const t0 = bytes[pos + 4];
      const t1 = bytes[pos + 5];
      const t2 = bytes[pos + 6];
      const t3 = bytes[pos + 7];
      const nextPos = pos + 12 + chunkLen;
      if (nextPos > bytes.length || chunkLen > 200_000_000) break;
      // Check 'IEND' (0x49, 0x45, 0x4E, 0x44)
      if (t0 === 0x49 && t1 === 0x45 && t2 === 0x4e && t3 === 0x44) {
        validEnd = nextPos;
        break;
      }
      pos = nextPos;
    }

    if (validEnd > i) {
      const candidate = bytes.slice(i, validEnd);
      if (!bestPng || candidate.length > bestPng.length) {
        bestPng = candidate;
      }
      i = validEnd - 1;
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
  const lowerExt = ext.toLowerCase();

  // 1. PSD (Layered, recursively preserving layer folders & blend modes — lazy-loaded on demand!)
  if (lowerExt === 'psd') {
    const { readPsd } = await import('ag-psd');
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const psd = readPsd(ab);
    const results: ImportedLayerItem[] = [];
    let folderCounter = 0;

    // PSD children are ordered bottom-to-top; CelSketch layers are top-to-bottom
    const walkChildren = (children: PsdLayer[], parentKey?: string, parentName?: string) => {
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        const blendMode = child.blendMode ? PSD_BLEND_MAP[child.blendMode.toLowerCase()] || 'source-over' : 'source-over';
        if (child.children && child.children.length > 0) {
          const folderName = child.name || `${baseName}_Group_${i + 1}`;
          const myKey = `psd-folder-${++folderCounter}`;
          results.push({
            name: folderName,
            type: 'folder',
            folderKey: myKey,
            parentKey,
            parentName,
            opacity: child.opacity !== undefined ? child.opacity : 1,
            visible: !child.hidden
          });
          walkChildren(child.children, myKey, folderName);
        } else if (child.canvas) {
          const dataUrl = child.canvas.toDataURL('image/png');
          results.push({
            name: child.name || `${baseName}_Layer`,
            type: 'drawing',
            parentKey,
            parentName,
            dataUrl,
            x: child.left || 0,
            y: child.top || 0,
            w: child.canvas.width,
            h: child.canvas.height,
            opacity: child.opacity !== undefined ? child.opacity : 1,
            blendMode,
            visible: !child.hidden
          });
        }
      }
    };

    if (psd.children && psd.children.length > 0) {
      walkChildren(psd.children);
    }

    if (results.length === 0 && psd.canvas) {
      results.push({
        name: baseName,
        type: 'drawing',
        dataUrl: psd.canvas.toDataURL('image/png'),
        x: 0,
        y: 0,
        w: psd.canvas.width,
        h: psd.canvas.height,
        opacity: 1,
        visible: true
      });
    }
    return results;
  }

  // 2. KRA (Krita ZIP archive — lazy-loaded on demand!)
  if (lowerExt === 'kra') {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const merged = zip.file('mergedimage.png') || zip.file('preview.png');
    if (merged) {
      const pngBytes = await merged.async('uint8array');
      const dataUrl = `data:image/png;base64,${uint8ToBase64(pngBytes)}`;
      const { w, h } = await loadImageSize(dataUrl);
      return [{ name: baseName, type: 'drawing', dataUrl, x: 0, y: 0, w, h, opacity: 1, visible: true }];
    }
    throw new Error('Nenhuma imagem encontrada dentro do arquivo .kra');
  }

  // 3. CLIP (Extract largest embedded PNG preview from container)
  if (lowerExt === 'clip') {
    const pngBytes = extractEmbeddedPngFromBinary(bytes);
    if (pngBytes) {
      const dataUrl = `data:image/png;base64,${uint8ToBase64(pngBytes)}`;
      const { w, h } = await loadImageSize(dataUrl);
      return [{ name: baseName, type: 'drawing', dataUrl, x: 0, y: 0, w, h, opacity: 1, visible: true }];
    }
    throw new Error('Nenhuma prévia PNG encontrada dentro do arquivo .clip');
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
  const mime = mimeMap[lowerExt] || 'image/png';
  const dataUrl = `data:${mime};base64,${uint8ToBase64(bytes)}`;
  const { w, h } = await loadImageSize(dataUrl);
  return [{ name: baseName, type: 'drawing', dataUrl, x: 0, y: 0, w, h, opacity: 1, visible: true }];
}
