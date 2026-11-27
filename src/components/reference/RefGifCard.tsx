import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { decodeAnimatedGif, dataUrlToArrayBuffer, type DecodedGif } from '../../utils/gifDecoder';
import type { RefItem } from './types';

export interface GifCardProps {
  item: RefItem;
  isSelected: boolean;
  dropperMode: boolean;
  onSampleColor: (hex: string) => void;
  stepSignal: { id: string; delta: number; seq: number } | null;
  togglePlaySignal: { id: string; seq: number } | null;
}

export const RefGifCard: React.FC<GifCardProps> = ({
  item,
  isSelected,
  dropperMode,
  onSampleColor,
  stepSignal,
  togglePlaySignal
}) => {
  const [decoded, setDecoded] = useState<DecodedGif | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(1);
  const [hovered, setHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!item.src) return;
    (async () => {
      try {
        const buf = await dataUrlToArrayBuffer(item.src!);
        const res = await decodeAnimatedGif(buf);
        if (!cancelled) {
          setDecoded(res);
          setFrameIdx(0);
        }
      } catch {
        if (!cancelled) setDecoded(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.src]);

  useEffect(() => {
    if (!decoded || decoded.frames.length <= 1 || !playing) return;
    const dur = Math.max(16, Math.round((decoded.durationsMs[frameIdx] || 80) / speed));
    const t = window.setTimeout(() => {
      setFrameIdx((prev) => (prev + 1) % decoded.frames.length);
    }, dur);
    return () => window.clearTimeout(t);
  }, [decoded, frameIdx, playing, speed]);

  useEffect(() => {
    if (!decoded || !canvasRef.current) return;
    const frameCanvas = decoded.frames[frameIdx];
    if (!frameCanvas) return;
    const dst = canvasRef.current;
    if (dst.width !== frameCanvas.width || dst.height !== frameCanvas.height) {
      dst.width = frameCanvas.width;
      dst.height = frameCanvas.height;
    }
    const ctx = dst.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.drawImage(frameCanvas, 0, 0);
  }, [decoded, frameIdx]);

  useEffect(() => {
    if (!stepSignal || stepSignal.id !== item.id || !decoded) return;
    setPlaying(false);
    setFrameIdx((prev) => (prev + stepSignal.delta + decoded.frames.length) % decoded.frames.length);
  }, [stepSignal, item.id, decoded]);

  useEffect(() => {
    if (!togglePlaySignal || togglePlaySignal.id !== item.id || !decoded) return;
    setPlaying((p) => !p);
  }, [togglePlaySignal, item.id, decoded]);

  const sampleCanvasPixel = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    if (!c || !c.width || !c.height) return;
    const rect = c.getBoundingClientRect();
    const u = (e.clientX - rect.left) / Math.max(1, rect.width);
    const v = (e.clientY - rect.top) / Math.max(1, rect.height);
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const px = Math.max(0, Math.min(c.width - 1, Math.floor((item.flipX ? 1 - u : u) * c.width)));
    const py = Math.max(0, Math.min(c.height - 1, Math.floor(v * c.height)));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const d = ctx.getImageData(px, py, 1, 1).data;
    if (d[3] < 10) return;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    onSampleColor(`#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`);
  };

  if (!decoded) {
    return (
      <img
        src={item.src}
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'contain',
          transform: item.flipX ? 'scaleX(-1)' : 'none',
          pointerEvents: 'none'
        }}
      />
    );
  }

  const total = decoded.frames.length;
  const showControls = (hovered || isSelected) && !dropperMode;

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        if (dropperMode || e.altKey) {
          e.stopPropagation();
          sampleCanvasPixel(e);
        }
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'contain',
          transform: item.flipX ? 'scaleX(-1)' : 'none',
          pointerEvents: 'none'
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 5,
          left: 5,
          background: 'rgba(16,18,24,0.78)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: 9.5,
          fontWeight: 700,
          color: '#93c5fd',
          pointerEvents: 'none'
        }}
      >
        GIF • Q{frameIdx + 1}/{total}
      </div>

      {showControls && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            bottom: 4,
            background: 'rgba(16, 18, 24, 0.9)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 6,
            padding: '4px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            backdropFilter: 'blur(4px)'
          }}
        >
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={frameIdx}
            onChange={(e) => {
              setPlaying(false);
              setFrameIdx(Number(e.target.value));
            }}
            style={{ width: '100%', height: 10, accentColor: '#3a86ff', cursor: 'pointer', margin: 0 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                className="icon-btn"
                onClick={() => setPlaying((p) => !p)}
                title={playing ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
                style={{ height: 20, minWidth: 20, padding: '0 4px' }}
              >
                {playing ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  setPlaying(false);
                  setFrameIdx((prev) => (prev - 1 + total) % total);
                }}
                title="Quadro anterior (,)"
                style={{ height: 20, minWidth: 20, padding: '0 3px' }}
              >
                <ChevronLeft size={12} />
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  setPlaying(false);
                  setFrameIdx((prev) => (prev + 1) % total);
                }}
                title="Próximo quadro (.)"
                style={{ height: 20, minWidth: 20, padding: '0 3px' }}
              >
                <ChevronRight size={12} />
              </button>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#cbd5e1' }}>
              {frameIdx + 1}/{total}
            </span>
            <button
              className="icon-btn"
              onClick={() => setSpeed((s) => (s === 1 ? 0.5 : s === 0.5 ? 0.25 : 1))}
              title="Velocidade de reprodução"
              style={{ height: 19, padding: '0 5px', fontSize: 9.5, fontFamily: 'monospace' }}
            >
              {speed}×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
