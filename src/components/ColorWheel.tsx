import React, { useRef, useEffect, useState, useCallback } from 'react';

interface ColorWheelProps {
  hex: string;
  onChange: (hex: string) => void;
  onCommit?: (hex: string) => void;
}

function normalizeHex(raw: string): string {
  const clean = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean}`;
  }
  return '#141414';
}

function hexToHsv(hex: string, fallbackHue = 0): { h: number; s: number; v: number } {
  const norm = normalizeHex(hex).slice(1);
  const r = parseInt(norm.substring(0, 2), 16) / 255;
  const g = parseInt(norm.substring(2, 4), 16) / 255;
  const b = parseInt(norm.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  // Preserve current hue when picking black, white, or gray (d === 0)!
  let h = fallbackHue;
  if (d > 0.0001) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h: ((h % 360) + 360) % 360, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const nh = ((h % 360) + 360) % 360;
  const ns = Math.max(0, Math.min(1, s));
  const nv = Math.max(0, Math.min(1, v));
  const c = nv * ns;
  const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
  const m = nv - c;
  let r = 0, g = 0, b = 0;

  if (nh < 60) { r = c; g = x; b = 0; }
  else if (nh < 120) { r = x; g = c; b = 0; }
  else if (nh < 180) { r = 0; g = c; b = x; }
  else if (nh < 240) { r = 0; g = x; b = c; }
  else if (nh < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round((n + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Cached static Hue Ring offscreen canvas (eliminates 360 arc() strokes per frame on 240Hz tablets!)
const WHEEL_SIZE = 196;
const CX = WHEEL_SIZE / 2;
const CY = WHEEL_SIZE / 2;
const OUTER_R = 92;
const INNER_R = 72;
const SQ_HALF = Math.floor(INNER_R * 0.68);

let cachedRingCanvas: HTMLCanvasElement | null = null;
function getHueRingCanvas(): HTMLCanvasElement {
  if (cachedRingCanvas) return cachedRingCanvas;
  const c = document.createElement('canvas');
  c.width = WHEEL_SIZE;
  c.height = WHEEL_SIZE;
  const ctx = c.getContext('2d');
  if (ctx) {
    for (let deg = 0; deg < 360; deg += 1) {
      const startAngle = ((deg - 1) * Math.PI) / 180;
      const endAngle = ((deg + 1) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(CX, CY, (OUTER_R + INNER_R) / 2, startAngle, endAngle);
      ctx.strokeStyle = `hsl(${deg}, 100%, 50%)`;
      ctx.lineWidth = OUTER_R - INNER_R;
      ctx.stroke();
    }
  }
  cachedRingCanvas = c;
  return c;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({ hex, onChange, onCommit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState(() => hexToHsv(hex, 210));
  const [dragMode, setDragMode] = useState<'none' | 'ring' | 'square'>('none');
  const [hexDraft, setHexDraft] = useState(hex.toUpperCase());
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // Only resync internal HSV when prop `hex` changed EXTERNALLY (preserves exact Hue on white/black/gray!)
  useEffect(() => {
    setHexDraft(hex.toUpperCase());
    const currentHex = hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v).toLowerCase();
    if (normalizeHex(hex).toLowerCase() !== currentHex) {
      setHsv((prev) => hexToHsv(hex, prev.h));
    }
  }, [hex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

    // 1. Blit cached Hue Ring (O(1))
    ctx.drawImage(getHueRingCanvas(), 0, 0);

    // 2. Draw Inner SV Square
    const sqX = CX - SQ_HALF;
    const sqY = CY - SQ_HALF;
    const sqSize = SQ_HALF * 2;

    ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    const whiteGrad = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    const blackGrad = ctx.createLinearGradient(sqX, sqY, sqX, sqY + sqSize);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sqX, sqY, sqSize, sqSize);

    // 3. Hue Ring Indicator
    const rad = (hsv.h * Math.PI) / 180;
    const ringMid = (OUTER_R + INNER_R) / 2;
    const hx = CX + Math.cos(rad) * ringMid;
    const hy = CY + Math.sin(rad) * ringMid;
    ctx.beginPath();
    ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. SV Square Indicator
    const sx = sqX + hsv.s * sqSize;
    const sy = sqY + (1 - hsv.v) * sqSize;
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv]);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number, mode: 'ring' | 'square') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = WHEEL_SIZE / Math.max(1, rect.width);
      const scaleY = WHEEL_SIZE / Math.max(1, rect.height);
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      if (mode === 'ring') {
        const angle = Math.atan2(y - CY, x - CX);
        let deg = (angle * 180) / Math.PI;
        if (deg < 0) deg += 360;
        const next = { ...hsvRef.current, h: deg };
        setHsv(next);
        onChange(hsvToHex(next.h, next.s, next.v));
      } else if (mode === 'square') {
        const sqX = CX - SQ_HALF;
        const sqY = CY - SQ_HALF;
        const sqSize = SQ_HALF * 2;
        const s = Math.max(0, Math.min(1, (x - sqX) / sqSize));
        const v = Math.max(0, Math.min(1, 1 - (y - sqY) / sqSize));
        const next = { ...hsvRef.current, s, v };
        setHsv(next);
        onChange(hsvToHex(next.h, next.s, next.v));
      }
    },
    [onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * WHEEL_SIZE) / Math.max(1, rect.width);
    const y = ((e.clientY - rect.top) * WHEEL_SIZE) / Math.max(1, rect.height);
    const dist = Math.hypot(x - CX, y - CY);

    if (dist >= INNER_R - 4 && dist <= OUTER_R + 6) {
      setDragMode('ring');
      updateFromPointer(e.clientX, e.clientY, 'ring');
    } else if (
      x >= CX - SQ_HALF - 4 &&
      x <= CX + SQ_HALF + 4 &&
      y >= CY - SQ_HALF - 4 &&
      y <= CY + SQ_HALF + 4
    ) {
      setDragMode('square');
      updateFromPointer(e.clientX, e.clientY, 'square');
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragMode === 'none') return;
    updateFromPointer(e.clientX, e.clientY, dragMode);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragMode !== 'none') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setDragMode('none');
      onCommit?.(hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v));
    }
  };

  const commitHexInput = () => {
    const clean = hexDraft.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(clean) || /^[0-9a-fA-F]{6}$/.test(clean)) {
      const normalized = normalizeHex(clean);
      setHsv((prev) => hexToHsv(normalized, prev.h));
      onChange(normalized);
      onCommit?.(normalized);
      setHexDraft(normalized.toUpperCase());
    } else {
      setHexDraft(hex.toUpperCase());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
      <canvas
        ref={canvasRef}
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: 'crosshair', touchAction: 'none', maxWidth: '100%', height: 'auto' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '0 10px' }}>
        <div
          style={{
            width: 28,
            height: 22,
            borderRadius: 3,
            background: hex,
            border: '1px solid #555',
            flexShrink: 0
          }}
        />
        <input
          type="text"
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={commitHexInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitHexInput();
              e.currentTarget.blur();
            }
          }}
          title="Digite um código HEX (ex: #3A86FF)"
          className="harmony-input"
          style={{ width: 68, height: 22, fontSize: 10.5, fontFamily: 'monospace', padding: '0 4px' }}
        />
        <span style={{ fontSize: 9.5, color: '#888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          H:{Math.round(hsv.h)}° S:{Math.round(hsv.s * 100)} V:{Math.round(hsv.v * 100)}
        </span>
      </div>
    </div>
  );
};
