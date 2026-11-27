import type { Point, Stroke } from '../../types/harmony';

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export type TransformHandle = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l' | 'move' | 'rot';
export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export function isPointInPolygon(pt: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isDarkHexColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2) || '00', 16);
  const g = parseInt(clean.substring(2, 4) || '00', 16);
  const b = parseInt(clean.substring(4, 6) || '00', 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

export function cloneQuad(q: Quad): Quad {
  return { tl: { ...q.tl }, tr: { ...q.tr }, br: { ...q.br }, bl: { ...q.bl } };
}

export function hitTestTransformHandlePure(pt: Point, q: Quad, zoom: number): TransformHandle | null {
  const tol = 14 / zoom;
  const { tl, tr, br, bl } = q;
  const tMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  const rMid = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
  const bMid = { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 };
  const lMid = { x: (bl.x + tl.x) / 2, y: (bl.y + tl.y) / 2 };

  if (Math.hypot(pt.x - tl.x, pt.y - tl.y) <= tol) return 'tl';
  if (Math.hypot(pt.x - tr.x, pt.y - tr.y) <= tol) return 'tr';
  if (Math.hypot(pt.x - br.x, pt.y - br.y) <= tol) return 'br';
  if (Math.hypot(pt.x - bl.x, pt.y - bl.y) <= tol) return 'bl';
  if (Math.hypot(pt.x - tMid.x, pt.y - tMid.y) <= tol) return 't';
  if (Math.hypot(pt.x - rMid.x, pt.y - rMid.y) <= tol) return 'r';
  if (Math.hypot(pt.x - bMid.x, pt.y - bMid.y) <= tol) return 'b';
  if (Math.hypot(pt.x - lMid.x, pt.y - lMid.y) <= tol) return 'l';
  if (isPointInPolygon(pt, [tl, tr, br, bl])) return 'move';
  return 'rot';
}

export function mapStrokesToQuadPure(
  origStrokes: Stroke[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  quad: Quad,
  canvasWidth: number,
  canvasHeight: number
): Stroke[] {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const curW =
    (Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y) +
      Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y)) /
    2;
  const curH =
    (Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y) +
      Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y)) /
    2;
  const avgScale = Math.max(0.05, Math.min(20, (curW / bw + curH / bh) / 2));

  const mapPt = (px: number, py: number) => {
    const u = (px - bounds.minX) / bw;
    const v = (py - bounds.minY) / bh;
    return {
      x:
        (1 - u) * (1 - v) * quad.tl.x +
        u * (1 - v) * quad.tr.x +
        u * v * quad.br.x +
        (1 - u) * v * quad.bl.x,
      y:
        (1 - u) * (1 - v) * quad.tl.y +
        u * (1 - v) * quad.tr.y +
        u * v * quad.br.y +
        (1 - u) * v * quad.bl.y
    };
  };

  return origStrokes.map((st) => {
    if (st.tool === 'image') {
      const srcQuad = st.imageQuad || {
        tl: { x: st.imageX ?? 0, y: st.imageY ?? 0 },
        tr: { x: (st.imageX ?? 0) + (st.imageW ?? canvasWidth), y: st.imageY ?? 0 },
        br: {
          x: (st.imageX ?? 0) + (st.imageW ?? canvasWidth),
          y: (st.imageY ?? 0) + (st.imageH ?? canvasHeight)
        },
        bl: { x: st.imageX ?? 0, y: (st.imageY ?? 0) + (st.imageH ?? canvasHeight) }
      };
      const newQuad = {
        tl: mapPt(srcQuad.tl.x, srcQuad.tl.y),
        tr: mapPt(srcQuad.tr.x, srcQuad.tr.y),
        br: mapPt(srcQuad.br.x, srcQuad.br.y),
        bl: mapPt(srcQuad.bl.x, srcQuad.bl.y)
      };
      const xs = [newQuad.tl.x, newQuad.tr.x, newQuad.br.x, newQuad.bl.x];
      const ys = [newQuad.tl.y, newQuad.tr.y, newQuad.br.y, newQuad.bl.y];
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        ...st,
        imageX: minX,
        imageY: minY,
        imageW: Math.max(2, Math.max(...xs) - minX),
        imageH: Math.max(2, Math.max(...ys) - minY),
        imageQuad: newQuad
      };
    }
    if (st.tool === 'text') {
      return {
        ...st,
        fontSize: Math.max(8, Math.min(400, Math.round((st.fontSize || 48) * avgScale))),
        points: st.points.map((pt) => {
          const m = mapPt(pt.x, pt.y);
          return { ...pt, x: m.x, y: m.y };
        })
      };
    }
    return {
      ...st,
      size: Math.max(0.5, Math.min(400, st.size * avgScale)),
      points: st.points.map((pt) => {
        const m = mapPt(pt.x, pt.y);
        return { ...pt, x: m.x, y: m.y };
      })
    };
  });
}

export function getCropCursor(h: CropHandle | null): string {
  if (h === 'nw' || h === 'se') return 'nwse-resize';
  if (h === 'ne' || h === 'sw') return 'nesw-resize';
  if (h === 'n' || h === 's') return 'ns-resize';
  if (h === 'e' || h === 'w') return 'ew-resize';
  if (h === 'move') return 'move';
  return 'default';
}

export function getTransformCursor(h: TransformHandle | null): string {
  if (h === 'tl' || h === 'br') return 'nwse-resize';
  if (h === 'tr' || h === 'bl') return 'nesw-resize';
  if (h === 't' || h === 'b') return 'ns-resize';
  if (h === 'l' || h === 'r') return 'ew-resize';
  if (h === 'move') return 'move';
  if (h === 'rot') return 'grab';
  return 'default';
}
