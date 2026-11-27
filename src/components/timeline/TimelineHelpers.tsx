import React, { useEffect, useRef, useState } from 'react';
import { getEffectiveFrameStrokes, renderStroke } from '../../utils/canvasRenderer';
import type { DrawingLayer, PoseTag } from '../../types/harmony';

export const CelHoverPreview: React.FC<{
  layer: DrawingLayer;
  frame: number;
  canvasWidth: number;
  canvasHeight: number;
  x: number;
  y: number;
}> = ({ layer, frame, canvasWidth, canvasHeight, x, y }) => {
  const thumbRef = useRef<HTMLCanvasElement>(null);
  const [imgTick, setImgTick] = useState(0);

  useEffect(() => {
    const onImgLoaded = () => setImgTick((t) => t + 1);
    window.addEventListener('celsketch:image-loaded', onImgLoaded);
    return () => window.removeEventListener('celsketch:image-loaded', onImgLoaded);
  }, []);

  useEffect(() => {
    const cvs = thumbRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const tw = cvs.width;
    const th = cvs.height;
    ctx.clearRect(0, 0, tw, th);

    const scale = Math.min(tw / canvasWidth, th / canvasHeight);
    const ox = (tw - canvasWidth * scale) / 2;
    const oy = (th - canvasHeight * scale) / 2;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    const strokes = getEffectiveFrameStrokes(layer, frame);
    for (const st of strokes) {
      renderStroke(ctx, st);
    }
    ctx.restore();
  }, [layer, frame, canvasWidth, canvasHeight, imgTick]);

  const left = Math.min(window.innerWidth - 182, Math.max(8, x - 84));
  const top = Math.max(8, y - 124);

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1500,
        pointerEvents: 'none',
        background: '#1e1e1e',
        border: '1px solid #4a4a4a',
        borderRadius: 6,
        padding: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.65)'
      }}
    >
      <canvas
        ref={thumbRef}
        width={160}
        height={90}
        style={{
          display: 'block',
          width: 160,
          height: 90,
          borderRadius: 3,
          background: '#fff'
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 10,
          color: '#cbd5e1',
          marginTop: 3,
          padding: '0 2px'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 112 }}>
          {layer.name}
        </span>
        <span style={{ color: '#93c5fd', fontWeight: 700 }}>F{frame}</span>
      </div>
    </div>
  );
};

export function formatTimecode(frame: number, fps: number): string {
  const zeroBased = Math.max(0, frame - 1);
  const totalSec = Math.floor(zeroBased / fps);
  const remFrames = zeroBased % fps;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}+${String(remFrames).padStart(2, '0')}`;
}

export const TAG_COLORS: Record<PoseTag, string> = {
  key: '#3b82f6',
  breakdown: '#f59e0b',
  inbetween: '#10b981'
};

export const SafeNumInput: React.FC<{
  value: number;
  min: number;
  max: number;
  width: number;
  onCommit: (val: number) => void;
}> = ({ value, min, max, width, onCommit }) => {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onCommit(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
      className="harmony-input timeline-num-input"
      style={{ width, height: 20 }}
    />
  );
};
