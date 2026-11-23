import React, { useRef, useEffect, useState, useCallback } from 'react';

interface ColorWheelProps {
  hex: string;
  onChange: (hex: string) => void;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2) || '00', 16) / 255;
  const g = parseInt(clean.substring(2, 4) || '00', 16) / 255;
  const b = parseInt(clean.substring(4, 6) || '00', 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({ hex, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState(() => hexToHsv(hex));
  const [dragMode, setDragMode] = useState<'none' | 'ring' | 'square'>('none');

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 102;
  const innerR = 80;
  const sqHalf = Math.floor(innerR * 0.68); // inner SV square

  useEffect(() => {
    setHsv(hexToHsv(hex));
  }, [hex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    // 1. Draw Hue Ring
    for (let deg = 0; deg < 360; deg += 1) {
      const startAngle = ((deg - 1) * Math.PI) / 180;
      const endAngle = ((deg + 1) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, startAngle, endAngle);
      ctx.strokeStyle = `hsl(${deg}, 100%, 50%)`;
      ctx.lineWidth = outerR - innerR;
      ctx.stroke();
    }

    // 2. Draw Inner SV Square
    const sqX = cx - sqHalf;
    const sqY = cy - sqHalf;
    const sqSize = sqHalf * 2;

    // Base Hue fill
    ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    // White horizontal gradient (Saturation)
    const whiteGrad = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    // Black vertical gradient (Value)
    const blackGrad = ctx.createLinearGradient(sqX, sqY, sqX, sqY + sqSize);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    // Border around square
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sqX, sqY, sqSize, sqSize);

    // 3. Hue Ring Indicator
    const rad = (hsv.h * Math.PI) / 180;
    const ringMid = (outerR + innerR) / 2;
    const hx = cx + Math.cos(rad) * ringMid;
    const hy = cy + Math.sin(rad) * ringMid;
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. SV Square Indicator
    const sx = sqX + hsv.s * sqSize;
    const sy = sqY + (1 - hsv.v) * sqSize;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv, cx, cy, outerR, innerR, sqHalf]);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number, mode: 'ring' | 'square') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      if (mode === 'ring') {
        const angle = Math.atan2(y - cy, x - cx);
        let deg = (angle * 180) / Math.PI;
        if (deg < 0) deg += 360;
        const next = { ...hsv, h: deg };
        setHsv(next);
        onChange(hsvToHex(next.h, next.s, next.v));
      } else if (mode === 'square') {
        const sqX = cx - sqHalf;
        const sqY = cy - sqHalf;
        const sqSize = sqHalf * 2;
        const s = Math.max(0, Math.min(1, (x - sqX) / sqSize));
        const v = Math.max(0, Math.min(1, 1 - (y - sqY) / sqSize));
        const next = { ...hsv, s, v };
        setHsv(next);
        onChange(hsvToHex(next.h, next.s, next.v));
      }
    },
    [cx, cy, sqHalf, hsv, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dist = Math.hypot(x - cx, y - cy);

    if (dist >= innerR - 4 && dist <= outerR + 6) {
      setDragMode('ring');
      updateFromPointer(e.clientX, e.clientY, 'ring');
    } else if (
      x >= cx - sqHalf - 4 &&
      x <= cx + sqHalf + 4 &&
      y >= cy - sqHalf - 4 &&
      y <= cy + sqHalf + 4
    ) {
      setDragMode('square');
      updateFromPointer(e.clientX, e.clientY, 'square');
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragMode === 'none') return;
    updateFromPointer(e.clientX, e.clientY, dragMode);
  };

  const handlePointerUp = () => {
    setDragMode('none');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0' }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: 'crosshair', touchAction: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0 12px' }}>
        <div
          style={{
            width: 32,
            height: 24,
            borderRadius: 3,
            background: hex,
            border: '1px solid #555'
          }}
        />
        <span style={{ fontSize: 11, color: '#bbb', fontFamily: 'monospace', flex: 1 }}>
          {hex.toUpperCase()}
        </span>
        <span style={{ fontSize: 10, color: '#777' }}>
          H:{Math.round(hsv.h)}° S:{Math.round(hsv.s * 100)}% V:{Math.round(hsv.v * 100)}%
        </span>
      </div>
    </div>
  );
};
