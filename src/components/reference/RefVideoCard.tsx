import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import type { RefItem } from './types';

export interface VideoCardProps {
  item: RefItem;
  isSelected: boolean;
  dropperMode: boolean;
  onSampleColor: (hex: string) => void;
  stepSignal: { id: string; delta: number; seq: number } | null;
  togglePlaySignal: { id: string; seq: number } | null;
}

export const RefVideoCard: React.FC<VideoCardProps> = ({
  item,
  isSelected,
  dropperMode,
  onSampleColor,
  stepSignal,
  togglePlaySignal
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [speed, setSpeed] = useState<number>(1);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hovered, setHovered] = useState(false);

  const stepFps = 24;
  const currentFrameNum = Math.max(1, Math.round(curTime * stepFps) + 1);
  const totalFrameNum = Math.max(1, Math.round(duration * stepFps));

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const stepByFrames = useCallback((deltaFrames: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    v.pause();
    setPlaying(false);
    const next = Math.max(0, Math.min(v.duration, v.currentTime + deltaFrames / stepFps));
    v.currentTime = next;
    setCurTime(next);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    if (!stepSignal || stepSignal.id !== item.id) return;
    stepByFrames(stepSignal.delta);
  }, [stepSignal, item.id, stepByFrames]);

  useEffect(() => {
    if (!togglePlaySignal || togglePlaySignal.id !== item.id) return;
    togglePlay();
  }, [togglePlaySignal, item.id, togglePlay]);

  const sampleVideoPixel = (e: React.PointerEvent) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const rect = v.getBoundingClientRect();
    const natAspect = v.videoWidth / v.videoHeight;
    const boxAspect = rect.width / Math.max(1, rect.height);
    let drawW = rect.width;
    let drawH = rect.height;
    let drawLeft = rect.left;
    let drawTop = rect.top;
    if (natAspect > boxAspect) {
      drawH = rect.width / natAspect;
      drawTop = rect.top + (rect.height - drawH) / 2;
    } else {
      drawW = rect.height * natAspect;
      drawLeft = rect.left + (rect.width - drawW) / 2;
    }
    const u = (e.clientX - drawLeft) / Math.max(1, drawW);
    const vCoord = (e.clientY - drawTop) / Math.max(1, drawH);
    if (u < 0 || u > 1 || vCoord < 0 || vCoord > 1) return;
    const px = Math.max(0, Math.min(v.videoWidth - 1, Math.floor((item.flipX ? 1 - u : u) * v.videoWidth)));
    const py = Math.max(0, Math.min(v.videoHeight - 1, Math.floor(vCoord * v.videoHeight)));
    const off = document.createElement('canvas');
    off.width = 1;
    off.height = 1;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, px, py, 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    onSampleColor(`#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`);
  };

  const showControls = (hovered || isSelected) && !dropperMode;

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#0e1015' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        if (dropperMode || e.altKey) {
          e.stopPropagation();
          sampleVideoPixel(e);
        }
      }}
    >
      <video
        ref={videoRef}
        src={item.src}
        muted={muted}
        loop
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
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
          color: '#6ee7b7',
          pointerEvents: 'none'
        }}
      >
        MP4 • Q{currentFrameNum}/{totalFrameNum}
      </div>

      {showControls && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            bottom: 4,
            background: 'rgba(16, 18, 24, 0.92)',
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
            max={Math.max(0.01, duration)}
            step={1 / stepFps}
            value={Math.min(curTime, duration || 0)}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = t;
              }
              setPlaying(false);
              setCurTime(t);
            }}
            style={{ width: '100%', height: 10, accentColor: '#3a86ff', cursor: 'pointer', margin: 0 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                className="icon-btn"
                onClick={togglePlay}
                title={playing ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
                style={{ height: 20, minWidth: 20, padding: '0 4px' }}
              >
                {playing ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button
                className="icon-btn"
                onClick={() => stepByFrames(-1)}
                title="Voltar 1 frame (,)"
                style={{ height: 20, minWidth: 20, padding: '0 3px' }}
              >
                <ChevronLeft size={12} />
              </button>
              <button
                className="icon-btn"
                onClick={() => stepByFrames(1)}
                title="Avançar 1 frame (.)"
                style={{ height: 20, minWidth: 20, padding: '0 3px' }}
              >
                <ChevronRight size={12} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Ativar áudio' : 'Silenciar áudio'}
                style={{ height: 20, minWidth: 20, padding: '0 3px' }}
              >
                {muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
              </button>
            </div>
            <span style={{ fontSize: 9.5, fontFamily: 'monospace', color: '#cbd5e1' }}>
              {curTime.toFixed(2)}s
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
