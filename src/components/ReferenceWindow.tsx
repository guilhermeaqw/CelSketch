import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ImagePlus,
  Pipette,
  Trash2,
  X,
  FlipHorizontal2,
  Type,
  ExternalLink,
  Pin,
  PinOff,
  Group,
  Ungroup,
  LayoutGrid,
  Maximize2,
  Contrast,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Minus,
  Square
} from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { isTextEditingTarget } from '../App';
import { decodeAnimatedGif, dataUrlToArrayBuffer, type DecodedGif } from '../utils/gifDecoder';

const REF_BOARD_STORAGE_KEY = 'celsketch_ref_board_v2';

type RefItemKind = 'image' | 'gif' | 'video' | 'text';

interface RefGroup {
  id: string;
  name: string;
  color: string;
}

interface RefItem {
  id: string;
  kind: RefItemKind;
  src?: string; // data URL or blob URL
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flipX?: boolean;
  groupId?: string | null;
  // Text sticky note fields
  text?: string;
  noteColor?: string;
  fontSize?: number;
}

interface PersistedBoardState {
  items: RefItem[];
  groups: RefGroup[];
  grayscale?: boolean;
}

const NOTE_PALETTE = [
  { id: 'slate', bg: '#252933', border: '#3e4556', text: '#eef2f7', label: 'Neutro' },
  { id: 'blue', bg: '#1c2b45', border: '#3a86ff', text: '#e0f2fe', label: 'Azul' },
  { id: 'amber', bg: '#3b3018', border: '#d97706', text: '#fef3c7', label: 'Amarelo' },
  { id: 'green', bg: '#183428', border: '#10b981', text: '#d1fae5', label: 'Verde' },
  { id: 'rose', bg: '#3b1d2a', border: '#ec4899', text: '#fce7f3', label: 'Rosa' }
];

const GROUP_COLORS = ['#3a86ff', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899'];

function getNoteStyle(noteColor?: string) {
  return NOTE_PALETTE.find((p) => p.id === noteColor) || NOTE_PALETTE[0];
}

// =========================================================================
// Animated GIF Frame-by-Frame Analyzer Card
// =========================================================================
interface GifCardProps {
  item: RefItem;
  isSelected: boolean;
  dropperMode: boolean;
  onSampleColor: (hex: string) => void;
  stepSignal: { id: string; delta: number; seq: number } | null;
  togglePlaySignal: { id: string; seq: number } | null;
}

const RefGifCard: React.FC<GifCardProps> = ({
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

  // Playback timer respecting each GIF frame's native duration & chosen speed
  useEffect(() => {
    if (!decoded || decoded.frames.length <= 1 || !playing) return;
    const dur = Math.max(16, Math.round((decoded.durationsMs[frameIdx] || 80) / speed));
    const t = window.setTimeout(() => {
      setFrameIdx((prev) => (prev + 1) % decoded.frames.length);
    }, dur);
    return () => window.clearTimeout(t);
  }, [decoded, frameIdx, playing, speed]);

  // Paint active GIF frame to card canvas
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

  // Respond to external keyboard step (, / .) & play/pause (Space)
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

      {/* Tiny GIF Badge */}
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

      {/* Frame-by-Frame Animator Transport Bar */}
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

// =========================================================================
// MP4 / WebM Video Frame-by-Frame Analyzer Card
// =========================================================================
interface VideoCardProps {
  item: RefItem;
  isSelected: boolean;
  dropperMode: boolean;
  onSampleColor: (hex: string) => void;
  stepSignal: { id: string; delta: number; seq: number } | null;
  togglePlaySignal: { id: string; seq: number } | null;
}

const RefVideoCard: React.FC<VideoCardProps> = ({
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
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration || 0);
        }}
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

      {/* Video Frame Badge */}
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

      {/* Frame-by-Frame Animator Transport Bar */}
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

// =========================================================================
// Main PureRef-Style Reference Window (Docked OR Standalone Multi-Monitor!)
// =========================================================================
export const ReferenceWindow: React.FC<{ standalone?: boolean }> = ({ standalone = false }) => {
  const referenceWindowOpen = useHarmonyStore((s) => s.referenceWindowOpen);
  const toggleReferenceWindow = useHarmonyStore((s) => s.toggleReferenceWindow);
  const setActiveColor = useHarmonyStore((s) => s.setActiveColor);
  const pushRecentColor = useHarmonyStore((s) => s.pushRecentColor);

  const isVisible = standalone || referenceWindowOpen;

  const [winPos, setWinPos] = useState({ x: 86, y: 88 });
  const [winSize, setWinSize] = useState({ w: 460, h: 480 });
  const [winOpacity, setWinOpacity] = useState(1);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [grayscaleBoard, setGrayscaleBoard] = useState(false);

  const [boardZoom, setBoardZoom] = useState(1);
  const [boardPan, setBoardPan] = useState({ x: 0, y: 0 });
  const [items, setItems] = useState<RefItem[]>([]);
  const [groups, setGroups] = useState<RefGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [dropperMode, setDropperMode] = useState(false);
  const [pickedHex, setPickedHex] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDomFocused, setIsDomFocused] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [stepSignal, setStepSignal] = useState<{ id: string; delta: number; seq: number } | null>(null);
  const [togglePlaySignal, setTogglePlaySignal] = useState<{ id: string; seq: number } | null>(null);

  const isFocused = standalone || isHovered || isDomFocused;

  const boardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickedTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activeCleanupRef = useRef<(() => void) | null>(null);
  const internalClipboardRef = useRef<{ items: RefItem[]; groups: RefGroup[] } | null>(null);
  const hydratedRef = useRef(false);
  const boardZoomRef = useRef<number>(boardZoom);
  const boardPanRef = useRef(boardPan);
  boardZoomRef.current = boardZoom;
  boardPanRef.current = boardPan;

  const itemsRef = useRef(items);
  const groupsRef = useRef(groups);
  const selectedIdsRef = useRef(selectedIds);
  itemsRef.current = items;
  groupsRef.current = groups;
  selectedIdsRef.current = selectedIds;

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setStatusToast(null), 1600);
  }, []);

  const emitPickedColor = useCallback(
    (hex: string) => {
      if (standalone) {
        window.harmonyAPI?.refPickColor?.(hex);
      } else {
        setActiveColor(hex);
        pushRecentColor(hex);
      }
      setPickedHex(hex);
      if (pickedTimerRef.current) window.clearTimeout(pickedTimerRef.current);
      pickedTimerRef.current = window.setTimeout(() => setPickedHex(null), 1300);
    },
    [standalone, setActiveColor, pushRecentColor]
  );

  // Hydrate board state from Electron shared IPC or localStorage
  const hydrateBoard = useCallback(async () => {
    try {
      let raw = await window.harmonyAPI?.refGetBoardState?.();
      if (!raw) {
        raw = localStorage.getItem(REF_BOARD_STORAGE_KEY);
      }
      if (raw) {
        const parsed: PersistedBoardState = JSON.parse(raw);
        if (Array.isArray(parsed.items)) {
          // Drop expired blob: URLs across different window contexts
          const validItems = parsed.items.filter((it) => !it.src || !it.src.startsWith('blob:'));
          setItems(validItems);
        }
        if (Array.isArray(parsed.groups)) setGroups(parsed.groups);
        if (typeof parsed.grayscale === 'boolean') setGrayscaleBoard(parsed.grayscale);
      }
    } catch {
      // ignore corrupted storage
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (isVisible && !hydratedRef.current) {
      hydrateBoard();
    }
  }, [isVisible, hydrateBoard]);

  // If standalone pop-out closes, refresh docked board state next time user opens it
  useEffect(() => {
    if (standalone) return;
    const unsub = window.harmonyAPI?.onRefPopoutClosed?.(() => {
      hydratedRef.current = false;
    });
    return () => {
      unsub?.();
    };
  }, [standalone]);

  // Persist board changes cleanly (debounced) to Electron IPC memory + localStorage (when within quota)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = window.setTimeout(() => {
      const payload: PersistedBoardState = {
        items,
        groups,
        grayscale: grayscaleBoard
      };
      const json = JSON.stringify(payload);
      window.harmonyAPI?.refSetBoardState?.(json).catch(() => {});
      if (json.length < 3_800_000) {
        try {
          localStorage.setItem(REF_BOARD_STORAGE_KEY, json);
        } catch {
          // ignore localStorage quota overflow for large media
        }
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [items, groups, grayscaleBoard]);

  // Blur docked ReferenceWindow when clicking outside so shortcuts don't stay trapped
  useEffect(() => {
    if (standalone || !isVisible || !isDomFocused) return;
    const onOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target?.closest('[data-ref-window]')) {
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-ref-window]')) {
          document.activeElement.blur();
        }
        setIsDomFocused(false);
        setEditingNoteId(null);
        setEditingGroupId(null);
      }
    };
    window.addEventListener('pointerdown', onOutsidePointerDown, true);
    return () => window.removeEventListener('pointerdown', onOutsidePointerDown, true);
  }, [standalone, isVisible, isDomFocused]);

  useEffect(() => {
    return () => {
      if (pickedTimerRef.current) window.clearTimeout(pickedTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      activeCleanupRef.current?.();
    };
  }, []);

  // Native non-passive wheel zoom toward mouse cursor
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isVisible) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = board.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const prevZ = boardZoomRef.current;
      const nextZ = Math.max(0.15, Math.min(6, prevZ * factor));
      const ratio = nextZ / prevZ;
      boardZoomRef.current = nextZ;
      setBoardZoom(nextZ);
      setBoardPan((p) => ({
        x: mx - (mx - p.x) * ratio,
        y: my - (my - p.y) * ratio
      }));
    };
    board.addEventListener('wheel', onWheel, { passive: false });
    return () => board.removeEventListener('wheel', onWheel);
  }, [isVisible]);

  // Helper to get board center coordinates for newly created items
  const getSpawnPos = useCallback((offsetIdx = 0) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const z = boardZoomRef.current || 1;
    const p = boardPanRef.current;
    const cx = rect ? (rect.width / 2 - p.x) / z : 180;
    const cy = rect ? (rect.height / 2 - p.y) / z : 160;
    const off = (offsetIdx % 7) * 22;
    return { x: Math.round(cx - 110 + off), y: Math.round(cy - 90 + off) };
  }, []);

  const addMediaDataUrl = useCallback(
    (dataUrl: string, kind: 'image' | 'gif', name?: string) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 300;
        const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth, img.naturalHeight));
        const w = Math.max(64, Math.round(img.naturalWidth * scale));
        const h = Math.max(64, Math.round(img.naturalHeight * scale));
        setItems((prev) => {
          const pos = getSpawnPos(prev.length);
          const item: RefItem = {
            id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind,
            src: dataUrl,
            name,
            x: pos.x,
            y: pos.y,
            w,
            h
          };
          setSelectedIds([item.id]);
          return [...prev, item];
        });
      };
      img.src = dataUrl;
    },
    [getSpawnPos]
  );

  const addVideoSrc = useCallback(
    (src: string, name?: string) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        const vw = v.videoWidth || 320;
        const vh = v.videoHeight || 180;
        const maxDim = 340;
        const scale = Math.min(1, maxDim / Math.max(1, vw, vh));
        const w = Math.max(140, Math.round(vw * scale));
        const h = Math.max(96, Math.round(vh * scale));
        setItems((prev) => {
          const pos = getSpawnPos(prev.length);
          const item: RefItem = {
            id: `ref-vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: 'video',
            src,
            name,
            x: pos.x,
            y: pos.y,
            w,
            h
          };
          setSelectedIds([item.id]);
          return [...prev, item];
        });
      };
      v.onerror = () => {
        showToast('Formato de vídeo não suportado');
      };
      v.src = src;
    },
    [getSpawnPos, showToast]
  );

  const addTextNote = useCallback(
    (initialText = 'Nova nota de referência...\n(Duplo clique para editar)') => {
      setItems((prev) => {
        const pos = getSpawnPos(prev.length);
        const item: RefItem = {
          id: `ref-txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'text',
          text: initialText,
          noteColor: 'slate',
          fontSize: 13,
          x: pos.x,
          y: pos.y,
          w: 210,
          h: 110
        };
        setSelectedIds([item.id]);
        setEditingNoteId(item.id);
        return [...prev, item];
      });
    },
    [getSpawnPos]
  );

  const readFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const lower = (file.name || '').toLowerCase();
        const isVideo =
          file.type.startsWith('video/') ||
          lower.endsWith('.mp4') ||
          lower.endsWith('.webm') ||
          lower.endsWith('.mov') ||
          lower.endsWith('.m4v');
        const isGif = file.type === 'image/gif' || lower.endsWith('.gif');
        const isImage = file.type.startsWith('image/');

        if (isVideo) {
          // Small videos (<= 14 MB) encoded as data URL so they survive popping out to another monitor!
          if (file.size <= 14 * 1024 * 1024) {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') addVideoSrc(reader.result, file.name);
            };
            reader.readAsDataURL(file);
          } else {
            const url = URL.createObjectURL(file);
            addVideoSrc(url, file.name);
          }
        } else if (isGif) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') addMediaDataUrl(reader.result, 'gif', file.name);
          };
          reader.readAsDataURL(file);
        } else if (isImage) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') addMediaDataUrl(reader.result, 'image', file.name);
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [addMediaDataUrl, addVideoSrc]
  );

  // Group / Ungroup (PureRef Ctrl+G / Ctrl+Shift+G)
  const groupSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.length === 0) return;
    const newGroup: RefGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `Grupo ${groupsRef.current.length + 1}`,
      color: GROUP_COLORS[groupsRef.current.length % GROUP_COLORS.length]
    };
    const selSet = new Set(sel);
    setGroups((prev) => [...prev, newGroup]);
    setItems((prev) => prev.map((it) => (selSet.has(it.id) ? { ...it, groupId: newGroup.id } : it)));
    showToast(`Grupo criado (${sel.length} ${sel.length === 1 ? 'item' : 'itens'})`);
  }, [showToast]);

  const ungroupSelected = useCallback(() => {
    const selSet = new Set(selectedIdsRef.current);
    if (selSet.size === 0) return;
    const nextItems = itemsRef.current.map((it) => (selSet.has(it.id) ? { ...it, groupId: null } : it));
    const remainingGroupIds = new Set(nextItems.map((it) => it.groupId).filter(Boolean));
    setItems(nextItems);
    setGroups((prev) => prev.filter((g) => remainingGroupIds.has(g.id)));
    showToast('Itens desagrupados');
  }, [showToast]);

  // Copy / Paste internal board items (Ctrl+C / Ctrl+V)
  const copySelectedItems = useCallback(() => {
    const selSet = new Set(selectedIdsRef.current);
    const chosen = itemsRef.current.filter((it) => selSet.has(it.id));
    if (chosen.length === 0) return;
    const usedGroupIds = new Set(chosen.map((it) => it.groupId).filter(Boolean));
    const chosenGroups = groupsRef.current.filter((g) => usedGroupIds.has(g.id));
    internalClipboardRef.current = {
      items: chosen.map((it) => ({ ...it })),
      groups: chosenGroups.map((g) => ({ ...g }))
    };
    showToast(`Copiado (${chosen.length} ${chosen.length === 1 ? 'item' : 'itens'})`);
  }, [showToast]);

  const pasteInternalItems = useCallback(() => {
    const clip = internalClipboardRef.current;
    if (!clip || clip.items.length === 0) return false;
    const groupIdMap = new Map<string, string>();
    const clonedGroups: RefGroup[] = clip.groups.map((g, idx) => {
      const nid = `grp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
      groupIdMap.set(g.id, nid);
      return { ...g, id: nid, name: `${g.name} (cópia)` };
    });
    const clonedItems: RefItem[] = clip.items.map((it, idx) => ({
      ...it,
      id: `ref-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      x: Math.round(it.x + 26),
      y: Math.round(it.y + 26),
      groupId: it.groupId ? groupIdMap.get(it.groupId) || null : null
    }));
    // Advance clipboard offset so multiple Ctrl+V cascade nicely
    internalClipboardRef.current = {
      items: clonedItems.map((it) => ({ ...it })),
      groups: clonedGroups.map((g) => ({ ...g }))
    };
    if (clonedGroups.length > 0) setGroups((prev) => [...prev, ...clonedGroups]);
    setItems((prev) => [...prev, ...clonedItems]);
    setSelectedIds(clonedItems.map((it) => it.id));
    showToast(`Colado (${clonedItems.length} ${clonedItems.length === 1 ? 'item' : 'itens'})`);
    return true;
  }, [showToast]);

  // Fit All items cleanly into view (F)
  const fitAllItems = useCallback(() => {
    const cur = itemsRef.current;
    const board = boardRef.current;
    if (!board || cur.length === 0) {
      setBoardZoom(1);
      setBoardPan({ x: 0, y: 0 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const it of cur) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.w);
      maxY = Math.max(maxY, it.y + it.h);
    }
    const rect = board.getBoundingClientRect();
    const pad = 32;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const nextZ = Math.max(0.18, Math.min(2.5, Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh)));
    const nextPanX = (rect.width - bw * nextZ) / 2 - minX * nextZ;
    const nextPanY = (rect.height - bh * nextZ) / 2 - minY * nextZ;
    boardZoomRef.current = nextZ;
    setBoardZoom(nextZ);
    setBoardPan({ x: nextPanX, y: nextPanY });
  }, []);

  // Auto-Pack items neatly in a PureRef-style grid
  const autoPackGrid = useCallback(() => {
    const cur = itemsRef.current;
    if (cur.length === 0) return;
    const selSet = new Set(selectedIdsRef.current);
    const targets = selSet.size > 1 ? cur.filter((it) => selSet.has(it.id)) : cur;
    const cols = Math.max(1, Math.ceil(Math.sqrt(targets.length)));
    const gap = 16;
    const startX = Math.min(...targets.map((t) => t.x));
    const startY = Math.min(...targets.map((t) => t.y));
    const colHeights = new Array(cols).fill(startY);
    const colWidth = Math.max(180, Math.round(targets.reduce((a, b) => a + b.w, 0) / targets.length));
    const placement = new Map<string, { x: number; y: number }>();

    for (const it of targets) {
      let bestCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[bestCol]) bestCol = c;
      }
      placement.set(it.id, {
        x: Math.round(startX + bestCol * (colWidth + gap)),
        y: Math.round(colHeights[bestCol])
      });
      colHeights[bestCol] += it.h + gap;
    }

    setItems((prev) =>
      prev.map((it) => {
        const p = placement.get(it.id);
        return p ? { ...it, x: p.x, y: p.y } : it;
      })
    );
    showToast('Referências organizadas em grade');
  }, [showToast]);

  // OS Clipboard Paste (images / GIFs / videos / text sticky note) + internal Ctrl+V fallback
  useEffect(() => {
    if (!isVisible) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      if (!standalone && !isFocused && itemsRef.current.length > 0) return;

      const cbItems = e.clipboardData?.items;
      const mediaFiles: File[] = [];
      if (cbItems) {
        for (const it of Array.from(cbItems)) {
          if (it.type.startsWith('image/') || it.type.startsWith('video/')) {
            const f = it.getAsFile();
            if (f) mediaFiles.push(f);
          }
        }
      }
      if (mediaFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        readFiles(mediaFiles);
        return;
      }

      if (isFocused && internalClipboardRef.current && internalClipboardRef.current.items.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        pasteInternalItems();
        return;
      }

      const plainText = e.clipboardData?.getData('text/plain')?.trim();
      if (plainText && (standalone || isDomFocused)) {
        e.preventDefault();
        e.stopPropagation();
        addTextNote(plainText);
      }
    };
    window.addEventListener('paste', onPaste, { capture: true });
    return () => window.removeEventListener('paste', onPaste, { capture: true });
  }, [isVisible, standalone, isFocused, isDomFocused, readFiles, pasteInternalItems, addTextNote]);

  // Keyboard shortcuts inside Reference Window (Ctrl+C, Ctrl+V, Ctrl+G, Ctrl+Shift+G, Ctrl+A, Delete, H, F, Space, , / .)
  useEffect(() => {
    if (!isVisible || (!standalone && !isDomFocused)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'c') {
        if (selectedIdsRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          copySelectedItems();
        }
        return;
      }
      if (ctrl && key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (ctrl && key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIds(itemsRef.current.map((it) => it.id));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIdsRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const delSet = new Set(selectedIdsRef.current);
          const nextItems = itemsRef.current.filter((it) => !delSet.has(it.id));
          const remainingGroupIds = new Set(nextItems.map((it) => it.groupId).filter(Boolean));
          setItems(nextItems);
          setGroups((prev) => prev.filter((g) => remainingGroupIds.has(g.id)));
          setSelectedIds([]);
        }
        return;
      }
      if (!ctrl && key === 'h' && selectedIdsRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const selSet = new Set(selectedIdsRef.current);
        setItems((prev) => prev.map((it) => (selSet.has(it.id) ? { ...it, flipX: !it.flipX } : it)));
        return;
      }
      if (!ctrl && key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        fitAllItems();
        return;
      }
      if (!ctrl && (e.key === ',' || e.key === '.' || e.key === ' ') && selectedIdsRef.current.length === 1) {
        const active = itemsRef.current.find((it) => it.id === selectedIdsRef.current[0]);
        if (active && (active.kind === 'gif' || active.kind === 'video')) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === ' ') {
            setTogglePlaySignal({ id: active.id, seq: Date.now() });
          } else {
            setStepSignal({ id: active.id, delta: e.key === ',' ? -1 : 1, seq: Date.now() });
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [isVisible, standalone, isDomFocused, copySelectedItems, groupSelected, ungroupSelected, fitAllItems]);

  // Sample pixel color from standard image
  const sampleFromRefImage = (item: RefItem, imgEl: HTMLImageElement, clientX: number, clientY: number) => {
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
    const rect = imgEl.getBoundingClientRect();
    const natAspect = imgEl.naturalWidth / imgEl.naturalHeight;
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
    const u = (clientX - drawLeft) / Math.max(1, drawW);
    const v = (clientY - drawTop) / Math.max(1, drawH);
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const px = Math.max(0, Math.min(imgEl.naturalWidth - 1, Math.floor((item.flipX ? 1 - u : u) * imgEl.naturalWidth)));
    const py = Math.max(0, Math.min(imgEl.naturalHeight - 1, Math.floor(v * imgEl.naturalHeight)));
    const off = document.createElement('canvas');
    off.width = 1;
    off.height = 1;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgEl, px, py, 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] < 10) return;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    emitPickedColor(`#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`);
  };

  // Pop out docked window into native multi-monitor OS window
  const handlePopOutToMonitor = async () => {
    const payload: PersistedBoardState = {
      items,
      groups,
      grayscale: grayscaleBoard
    };
    const json = JSON.stringify(payload);
    await window.harmonyAPI?.refSetBoardState?.(json);
    try {
      if (json.length < 3_800_000) localStorage.setItem(REF_BOARD_STORAGE_KEY, json);
    } catch {
      // ignore
    }
    await window.harmonyAPI?.refOpenPopout?.();
    if (!standalone && referenceWindowOpen) {
      toggleReferenceWindow();
    }
  };

  // Drag docked overlay window (pulling pointer outside CelSketch edge automatically pops out to a free multi-monitor window!)
  const startWindowDrag = (e: React.PointerEvent) => {
    if (standalone || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...winPos };
    let poppedOut = false;
    const onMove = (ev: PointerEvent) => {
      if (
        !poppedOut &&
        window.harmonyAPI?.refOpenPopout &&
        (ev.clientX < -18 ||
          ev.clientX > window.innerWidth + 18 ||
          ev.clientY < -18 ||
          ev.clientY > window.innerHeight + 18)
      ) {
        poppedOut = true;
        onUp();
        handlePopOutToMonitor();
        return;
      }
      setWinPos({
        x: Math.max(0, Math.min(window.innerWidth - 120, orig.x + (ev.clientX - startX))),
        y: Math.max(30, Math.min(window.innerHeight - 80, orig.y + (ev.clientY - startY)))
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Resize docked overlay window
  const startWindowResize = (e: React.PointerEvent) => {
    if (standalone || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...winSize };
    const onMove = (ev: PointerEvent) => {
      setWinSize({
        w: Math.max(280, Math.min(window.innerWidth - 32, orig.w + (ev.clientX - startX))),
        h: Math.max(220, Math.min(window.innerHeight - 50, orig.h + (ev.clientY - startY)))
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Board pointer down: Right/Middle = Pan, Left on empty = Marquee Multi-Select!
  const handleBoardPointerDown = (e: React.PointerEvent) => {
    const refHost = (e.currentTarget as HTMLElement).closest('[data-ref-window]') as HTMLElement | null;
    refHost?.focus();
    setEditingNoteId(null);
    setEditingGroupId(null);

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { ...boardPanRef.current };
      const onMove = (ev: PointerEvent) => {
        setBoardPan({ x: orig.x + (ev.clientX - startX), y: orig.y + (ev.clientY - startY) });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        activeCleanupRef.current = null;
      };
      activeCleanupRef.current?.();
      activeCleanupRef.current = onUp;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return;
    }

    if (e.button === 0 && !dropperMode) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (!e.shiftKey) setSelectedIds([]);
      const startClientX = e.clientX - rect.left;
      const startClientY = e.clientY - rect.top;
      const initialSel = e.shiftKey ? [...selectedIdsRef.current] : [];

      const onMove = (ev: PointerEvent) => {
        const curX = ev.clientX - rect.left;
        const curY = ev.clientY - rect.top;
        const rx = Math.min(startClientX, curX);
        const ry = Math.min(startClientY, curY);
        const rw = Math.abs(curX - startClientX);
        const rh = Math.abs(curY - startClientY);
        if (rw < 4 && rh < 4) return;
        setMarqueeBox({ x: rx, y: ry, w: rw, h: rh });

        // Convert marquee screen box to board coordinates
        const z = boardZoomRef.current || 1;
        const p = boardPanRef.current;
        const bx1 = (rx - p.x) / z;
        const by1 = (ry - p.y) / z;
        const bx2 = (rx + rw - p.x) / z;
        const by2 = (ry + rh - p.y) / z;

        const hits = itemsRef.current
          .filter((it) => it.x < bx2 && it.x + it.w > bx1 && it.y < by2 && it.y + it.h > by1)
          .map((it) => it.id);
        setSelectedIds(Array.from(new Set([...initialSel, ...hits])));
      };
      const onUp = () => {
        setMarqueeBox(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        activeCleanupRef.current = null;
      };
      activeCleanupRef.current?.();
      activeCleanupRef.current = onUp;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
  };

  // Drag single item, multi-selection, or entire group smoothly together!
  const startItemsDrag = (targetIds: string[], e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const refHost = (e.currentTarget as HTMLElement).closest('[data-ref-window]') as HTMLElement | null;
    refHost?.focus();

    const startX = e.clientX;
    const startY = e.clientY;
    const dragSet = new Set(targetIds);
    const origMap = new Map<string, { x: number; y: number }>();
    for (const it of itemsRef.current) {
      if (dragSet.has(it.id)) origMap.set(it.id, { x: it.x, y: it.y });
    }

    const onMove = (ev: PointerEvent) => {
      const z = boardZoomRef.current || 1;
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      setItems((prev) =>
        prev.map((it) => {
          const orig = origMap.get(it.id);
          return orig ? { ...it, x: orig.x + dx, y: orig.y + dy } : it;
        })
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Resize an item (proportional for media, free W/H for text notes)
  const startItemResize = (item: RefItem, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = item.w;
    const origH = item.h;
    const ratio = origH / Math.max(1, origW);

    const onMove = (ev: PointerEvent) => {
      const z = boardZoomRef.current || 1;
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      if (item.kind === 'text') {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, w: Math.max(120, Math.round(origW + dx)), h: Math.max(54, Math.round(origH + dy)) } : it
          )
        );
      } else {
        const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy / Math.max(0.1, ratio);
        const nextW = Math.max(48, origW + delta);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, w: Math.round(nextW), h: Math.round(nextW * ratio) } : it
          )
        );
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  if (!isVisible) return null;

  const selectedSet = new Set(selectedIds);
  const selectedHasGrouped = items.some((it) => selectedSet.has(it.id) && it.groupId);
  const singleSelectedText =
    selectedIds.length === 1 ? items.find((it) => it.id === selectedIds[0] && it.kind === 'text') || null : null;

  return (
    <div
      tabIndex={0}
      data-ref-window={isFocused ? 'active' : 'idle'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsDomFocused(true)}
      onBlur={() => setIsDomFocused(false)}
      style={
        standalone
          ? {
              width: '100vw',
              height: '100vh',
              background: '#16181e',
              border: isDragOver ? '2px dashed #3a86ff' : '1px solid #2b303c',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              outline: 'none'
            }
          : {
              position: 'fixed',
              left: winPos.x,
              top: winPos.y,
              width: winSize.w,
              height: winSize.h,
              zIndex: 900,
              opacity: winOpacity,
              background: '#16181e',
              border: isDragOver ? '2px dashed #3a86ff' : '1px solid #3c4252',
              borderRadius: 8,
              boxShadow: '0 14px 38px rgba(0,0,0,0.68)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              outline: 'none'
            }
      }
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files?.length) {
          readFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* PureRef-style Slim Header (Native OS Drag Region when standalone!) */}
      <div
        className={standalone ? 'drag-region' : undefined}
        onPointerDown={startWindowDrag}
        style={{
          height: 30,
          background: '#1e212a',
          borderBottom: '1px solid #2d3240',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 6px',
          cursor: standalone ? 'default' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          gap: 4,
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 3 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e5e7eb' }}>Referência</span>
          {selectedIds.length > 1 && (
            <span style={{ fontSize: 10, color: '#93c5fd', background: 'rgba(58,134,255,0.18)', padding: '0 5px', borderRadius: 99 }}>
              {selectedIds.length} sel.
            </span>
          )}
        </div>

        <div
          className={standalone ? 'no-drag' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,.gif,.mp4,.webm,.mov"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) readFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Adicionar Imagem, GIF ou Vídeo MP4 (ou arraste / Ctrl+V)"
            style={{ height: 22, padding: '0 5px' }}
          >
            <ImagePlus size={12.5} />
          </button>
          <button
            className="icon-btn"
            onClick={() => addTextNote()}
            title="Adicionar Nota de Texto"
            style={{ height: 22, padding: '0 5px' }}
          >
            <Type size={12.5} />
          </button>
          <button
            className={`icon-btn ${dropperMode ? 'active' : ''}`}
            onClick={() => setDropperMode((d) => !d)}
            title="Conta-gotas (ou Alt+Clique em qualquer Imagem, GIF ou Vídeo)"
            style={{ height: 22, padding: '0 5px' }}
          >
            <Pipette size={12.5} />
          </button>
          <button
            className={`icon-btn ${grayscaleBoard ? 'active' : ''}`}
            onClick={() => setGrayscaleBoard((g) => !g)}
            title="Modo Preto & Branco (estudo de valores)"
            style={{ height: 22, padding: '0 5px' }}
          >
            <Contrast size={12.5} />
          </button>

          {selectedIds.length > 0 && (
            <>
              <div style={{ width: 1, height: 14, background: '#383e4f', margin: '0 2px' }} />
              <button
                className="icon-btn"
                onClick={groupSelected}
                title="Agrupar selecionados (Ctrl+G)"
                style={{ height: 22, padding: '0 5px' }}
              >
                <Group size={12.5} />
              </button>
              {selectedHasGrouped && (
                <button
                  className="icon-btn"
                  onClick={ungroupSelected}
                  title="Desagrupar (Ctrl+Shift+G)"
                  style={{ height: 22, padding: '0 5px' }}
                >
                  <Ungroup size={12.5} />
                </button>
              )}
              <button
                className="icon-btn"
                onClick={() => {
                  const sel = new Set(selectedIds);
                  setItems((prev) => prev.map((it) => (sel.has(it.id) ? { ...it, flipX: !it.flipX } : it)));
                }}
                title="Espelhar selecionados (H)"
                style={{ height: 22, padding: '0 5px' }}
              >
                <FlipHorizontal2 size={12.5} />
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  const del = new Set(selectedIds);
                  const next = items.filter((it) => !del.has(it.id));
                  const remGroups = new Set(next.map((it) => it.groupId).filter(Boolean));
                  setItems(next);
                  setGroups((prev) => prev.filter((g) => remGroups.has(g.id)));
                  setSelectedIds([]);
                }}
                title="Remover selecionados (Delete)"
                style={{ height: 22, padding: '0 5px' }}
              >
                <Trash2 size={12.5} />
              </button>
            </>
          )}

          <div style={{ width: 1, height: 14, background: '#383e4f', margin: '0 2px' }} />

          <button
            className="icon-btn"
            onClick={autoPackGrid}
            title="Organizar referências em grade"
            style={{ height: 22, padding: '0 5px' }}
          >
            <LayoutGrid size={12} />
          </button>
          <button
            className="icon-btn"
            onClick={fitAllItems}
            title="Enquadrar tudo (F)"
            style={{ height: 22, padding: '0 5px' }}
          >
            <Maximize2 size={11.5} />
          </button>

          <input
            type="range"
            min={25}
            max={100}
            value={Math.round(winOpacity * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setWinOpacity(v);
              if (standalone) window.harmonyAPI?.refSetWindowOpacity?.(v);
            }}
            title={`Opacidade da Janela: ${Math.round(winOpacity * 100)}%`}
            style={{ width: 42, accentColor: '#3a86ff' }}
          />

          {standalone ? (
            <>
              <button
                className={`icon-btn ${alwaysOnTop ? 'active' : ''}`}
                onClick={() => {
                  const next = !alwaysOnTop;
                  setAlwaysOnTop(next);
                  window.harmonyAPI?.refSetAlwaysOnTop?.(next);
                }}
                title={alwaysOnTop ? 'Sempre no topo: ATIVO' : 'Sempre no topo: OFF'}
                style={{ height: 22, padding: '0 5px' }}
              >
                {alwaysOnTop ? <Pin size={12} /> : <PinOff size={12} />}
              </button>
              <button
                className="icon-btn"
                onClick={() => window.harmonyAPI?.minimize()}
                title="Minimizar"
                style={{ height: 22, padding: '0 4px' }}
              >
                <Minus size={12} />
              </button>
              <button
                className="icon-btn"
                onClick={() => window.harmonyAPI?.maximize()}
                title="Maximizar"
                style={{ height: 22, padding: '0 4px' }}
              >
                <Square size={10} />
              </button>
              <button
                className="icon-btn"
                onClick={() => window.harmonyAPI?.close()}
                title="Fechar janela de referência"
                style={{ height: 22, padding: '0 4px' }}
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-btn"
                onClick={handlePopOutToMonitor}
                title="Destacar para janela livre (arraste até para outro monitor!)"
                style={{ height: 22, padding: '0 5px', color: '#93c5fd' }}
              >
                <ExternalLink size={12} />
              </button>
              <button
                className="icon-btn"
                onClick={toggleReferenceWindow}
                title="Fechar Janela de Referência"
                style={{ height: 22, padding: '0 4px' }}
              >
                <X size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Contextual Text Note Mini-Bar when a sticky note is selected */}
      {singleSelectedText && (
        <div
          style={{
            height: 28,
            background: '#1a1d25',
            borderBottom: '1px solid #2b303c',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 8px',
            fontSize: 10.5,
            color: '#9ca3af',
            flexShrink: 0
          }}
        >
          <span>Nota:</span>
          {NOTE_PALETTE.map((p) => (
            <button
              key={p.id}
              onClick={() =>
                setItems((prev) =>
                  prev.map((it) => (it.id === singleSelectedText.id ? { ...it, noteColor: p.id } : it))
                )
              }
              title={p.label}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: p.bg,
                border: `2px solid ${singleSelectedText.noteColor === p.id ? '#fff' : p.border}`,
                cursor: 'pointer',
                padding: 0
              }}
            />
          ))}
          <div style={{ width: 1, height: 12, background: '#333a4a', margin: '0 2px' }} />
          <button
            className="icon-btn"
            onClick={() =>
              setItems((prev) =>
                prev.map((it) =>
                  it.id === singleSelectedText.id ? { ...it, fontSize: Math.max(10, (it.fontSize || 13) - 2) } : it
                )
              )
            }
            style={{ height: 20, padding: '0 5px', fontSize: 10.5 }}
          >
            A-
          </button>
          <span style={{ fontFamily: 'monospace', color: '#d1d5db' }}>{singleSelectedText.fontSize || 13}px</span>
          <button
            className="icon-btn"
            onClick={() =>
              setItems((prev) =>
                prev.map((it) =>
                  it.id === singleSelectedText.id ? { ...it, fontSize: Math.min(36, (it.fontSize || 13) + 2) } : it
                )
              )
            }
            style={{ height: 20, padding: '0 5px', fontSize: 10.5 }}
          >
            A+
          </button>
        </div>
      )}

      {/* PureRef Infinite Canvas Board */}
      <div
        ref={boardRef}
        onPointerDown={handleBoardPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#16181e',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          cursor: dropperMode ? 'crosshair' : 'default',
          touchAction: 'none'
        }}
      >
        {items.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7e8799',
              fontSize: 11.5,
              textAlign: 'center',
              padding: 24,
              pointerEvents: 'none',
              gap: 8
            }}
          >
            <ImagePlus size={28} style={{ opacity: 0.4 }} />
            <div style={{ fontWeight: 600, color: '#cbd5e1', fontSize: 12.5 }}>
              Arraste Imagens, GIFs ou Vídeos MP4 — ou dê Ctrl + V
            </div>
            <div style={{ fontSize: 10.5, lineHeight: 1.5, maxWidth: 320 }}>
              Scroll: Zoom • Botão Direito: Mover quadro • Arraste no vazio: Selecionar vários
              <br />
              Ctrl+G: Agrupar • Ctrl+C/V: Copiar/Colar • Alt+Clique: Pegar cor • Vídeos/GIFs: , e . quadro a quadro
            </div>
          </div>
        )}

        {/* Zoomable / Pannable World Layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${boardPan.x}px, ${boardPan.y}px) scale(${boardZoom})`,
            transformOrigin: '0 0',
            filter: grayscaleBoard ? 'grayscale(100%)' : 'none'
          }}
        >
          {/* Group Bounding Frames (rendered underneath items) */}
          {groups.map((grp) => {
            const members = items.filter((it) => it.groupId === grp.id);
            if (members.length === 0) return null;
            const pad = 12;
            const headerH = 22;
            const minX = Math.min(...members.map((m) => m.x)) - pad;
            const minY = Math.min(...members.map((m) => m.y)) - pad - headerH;
            const maxX = Math.max(...members.map((m) => m.x + m.w)) + pad;
            const maxY = Math.max(...members.map((m) => m.y + m.h)) + pad;
            const memberIds = members.map((m) => m.id);
            const allSelected = memberIds.every((id) => selectedSet.has(id));

            return (
              <div
                key={grp.id}
                style={{
                  position: 'absolute',
                  left: minX,
                  top: minY,
                  width: maxX - minX,
                  height: maxY - minY,
                  background: `${grp.color}12`,
                  border: `1.5px dashed ${allSelected ? '#ffffff' : grp.color}`,
                  borderRadius: 8,
                  pointerEvents: 'none'
                }}
              >
                {/* Draggable Group Header Tab */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      setSelectedIds((prev) => Array.from(new Set([...prev, ...memberIds])));
                    } else {
                      setSelectedIds(memberIds);
                    }
                    startItemsDrag(memberIds, e);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingGroupId(grp.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    right: 0,
                    height: headerH,
                    background: `${grp.color}33`,
                    borderBottom: `1px solid ${grp.color}55`,
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'move',
                    pointerEvents: 'auto',
                    userSelect: 'none'
                  }}
                >
                  {editingGroupId === grp.id ? (
                    <input
                      autoFocus
                      value={grp.name}
                      onChange={(e) =>
                        setGroups((prev) => prev.map((g) => (g.id === grp.id ? { ...g, name: e.target.value } : g)))
                      }
                      onBlur={() => setEditingGroupId(null)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter' || e.key === 'Escape') setEditingGroupId(null);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        background: 'rgba(0,0,0,0.55)',
                        color: '#fff',
                        border: '1px solid #fff',
                        borderRadius: 3,
                        fontSize: 10.5,
                        padding: '0 4px',
                        width: 140,
                        outline: 'none'
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#f3f4f6' }}>
                      {grp.name} ({members.length})
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Board Items (Images, Animated GIFs, MP4 Videos, Text Notes) */}
          {items.map((item) => {
            const isSel = selectedSet.has(item.id);
            const isEditingText = editingNoteId === item.id;
            const noteTheme = getNoteStyle(item.noteColor);

            return (
              <div
                key={item.id}
                onPointerDown={(e) => {
                  if (item.kind === 'image' && (dropperMode || e.altKey)) {
                    e.stopPropagation();
                    const imgEl = e.currentTarget.querySelector('img');
                    if (imgEl) sampleFromRefImage(item, imgEl, e.clientX, e.clientY);
                    return;
                  }
                  if ((item.kind === 'gif' || item.kind === 'video') && (dropperMode || e.altKey)) {
                    // Handled by inner GIF/Video card pixel sampler
                    return;
                  }
                  if (isEditingText) {
                    e.stopPropagation();
                    return;
                  }

                  // Selection logic (respects Shift+Click multi-select & group drag!)
                  let nextDragIds: string[];
                  if (e.shiftKey) {
                    if (selectedSet.has(item.id)) {
                      const removed = selectedIds.filter((id) => id !== item.id);
                      setSelectedIds(removed);
                      return;
                    } else {
                      nextDragIds = [...selectedIds, item.id];
                      setSelectedIds(nextDragIds);
                    }
                  } else if (selectedSet.has(item.id)) {
                    nextDragIds = selectedIds;
                  } else if (item.groupId) {
                    // Clicking any member of a group selects & moves the whole group (PureRef style!)
                    nextDragIds = items.filter((it) => it.groupId === item.groupId).map((it) => it.id);
                    setSelectedIds(nextDragIds);
                  } else {
                    nextDragIds = [item.id];
                    setSelectedIds(nextDragIds);
                  }
                  startItemsDrag(nextDragIds, e);
                }}
                onDoubleClick={(e) => {
                  if (item.kind === 'text') {
                    e.stopPropagation();
                    setSelectedIds([item.id]);
                    setEditingNoteId(item.id);
                  }
                }}
                style={{
                  position: 'absolute',
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  height: item.h,
                  outline: isSel ? '2px solid #3a86ff' : 'none',
                  outlineOffset: 1,
                  borderRadius: item.kind === 'text' ? 7 : 3,
                  cursor: dropperMode ? 'crosshair' : isEditingText ? 'text' : 'move',
                  touchAction: 'none',
                  userSelect: isEditingText ? 'text' : 'none'
                }}
              >
                {item.kind === 'image' && (
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
                )}

                {item.kind === 'gif' && (
                  <RefGifCard
                    item={item}
                    isSelected={isSel}
                    dropperMode={dropperMode}
                    onSampleColor={emitPickedColor}
                    stepSignal={stepSignal}
                    togglePlaySignal={togglePlaySignal}
                  />
                )}

                {item.kind === 'video' && (
                  <RefVideoCard
                    item={item}
                    isSelected={isSel}
                    dropperMode={dropperMode}
                    onSampleColor={emitPickedColor}
                    stepSignal={stepSignal}
                    togglePlaySignal={togglePlaySignal}
                  />
                )}

                {item.kind === 'text' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: noteTheme.bg,
                      border: `1px solid ${noteTheme.border}`,
                      borderRadius: 7,
                      padding: '8px 10px',
                      boxSizing: 'border-box',
                      color: noteTheme.text,
                      fontSize: item.fontSize || 13,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.35)'
                    }}
                  >
                    {isEditingText ? (
                      <textarea
                        autoFocus
                        value={item.text || ''}
                        onChange={(e) =>
                          setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it)))
                        }
                        onBlur={() => setEditingNoteId(null)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') setEditingNoteId(null);
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'transparent',
                          border: 'none',
                          color: noteTheme.text,
                          fontSize: item.fontSize || 13,
                          lineHeight: 1.4,
                          fontFamily: 'inherit',
                          resize: 'none',
                          outline: 'none'
                        }}
                      />
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.text || ''}</div>
                    )}
                  </div>
                )}

                {/* Corner Resize Handle */}
                {isSel && !dropperMode && !isEditingText && (
                  <div
                    onPointerDown={(e) => startItemResize(item, e)}
                    title="Arraste para redimensionar"
                    style={{
                      position: 'absolute',
                      right: -5,
                      bottom: -5,
                      width: 11,
                      height: 11,
                      background: '#3a86ff',
                      border: '1.5px solid #fff',
                      borderRadius: 2,
                      cursor: 'nwse-resize',
                      touchAction: 'none',
                      zIndex: 5
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Marquee Multi-Selection Box */}
        {marqueeBox && (
          <div
            style={{
              position: 'absolute',
              left: marqueeBox.x,
              top: marqueeBox.y,
              width: marqueeBox.w,
              height: marqueeBox.h,
              background: 'rgba(58, 134, 255, 0.16)',
              border: '1px solid rgba(96, 165, 250, 0.9)',
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 40
            }}
          />
        )}

        {/* Picked Color Toast */}
        {pickedHex && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              background: 'rgba(20,22,28,0.94)',
              border: '1px solid #4b5563',
              borderRadius: 6,
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#f3f4f6',
              pointerEvents: 'none',
              zIndex: 50
            }}
          >
            <span
              style={{
                width: 13,
                height: 13,
                borderRadius: 3,
                background: pickedHex,
                border: '1px solid #fff'
              }}
            />
            {pickedHex.toUpperCase()}
          </div>
        )}

        {/* Subtle Action Toast */}
        {statusToast && (
          <div
            style={{
              position: 'absolute',
              right: 12,
              bottom: 10,
              background: 'rgba(20, 23, 30, 0.92)',
              border: '1px solid #3c4252',
              borderRadius: 6,
              padding: '4px 9px',
              fontSize: 10.5,
              color: '#cbd5e1',
              pointerEvents: 'none',
              zIndex: 50
            }}
          >
            {statusToast}
          </div>
        )}

        {/* Docked Window Resize Grip */}
        {!standalone && (
          <div
            onPointerDown={startWindowResize}
            title="Redimensionar janela"
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 14,
              height: 14,
              cursor: 'nwse-resize',
              background: 'linear-gradient(135deg, transparent 50%, #555c6e 50%)',
              touchAction: 'none'
            }}
          />
        )}
      </div>
    </div>
  );
};
