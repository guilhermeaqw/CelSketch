import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Plus,
  FolderPlus,
  Copy,
  Layers,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Pin,
  Volume2,
  CopyPlus,
  Eraser,
  ChevronDown,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Flag
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { getEffectiveFrameStrokes, renderStroke } from '../utils/canvasRenderer';
import { DrawingLayer, PoseTag } from '../types/harmony';

const CelHoverPreview: React.FC<{
  layer: DrawingLayer;
  frame: number;
  canvasWidth: number;
  canvasHeight: number;
  x: number;
  y: number;
}> = ({ layer, frame, canvasWidth, canvasHeight, x, y }) => {
  const thumbRef = useRef<HTMLCanvasElement>(null);

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
  }, [layer, frame, canvasWidth, canvasHeight]);

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

function formatTimecode(frame: number, fps: number): string {
  const zeroBased = Math.max(0, frame - 1);
  const totalSec = Math.floor(zeroBased / fps);
  const remFrames = zeroBased % fps;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}+${String(remFrames).padStart(2, '0')}`;
}

const TAG_COLORS: Record<PoseTag, string> = {
  key: '#3b82f6',
  breakdown: '#f59e0b',
  inbetween: '#10b981'
};

export const TimelinePanel: React.FC = () => {
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [frameMenu, setFrameMenu] = useState<{ x: number; y: number; layerId: string; frame: number } | null>(null);
  const [selRange, setSelRange] = useState<{ layerId: string; start: number; end: number } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ layerId: string; frame: number } | null>(null);
  const [timelineFocus, setTimelineFocus] = useState<'layers' | 'frames' | null>(null);
  const timelineRootRef = useRef<HTMLDivElement>(null);

  // Interactive ruler scrubbing, onion handle dragging, and cel exposure resizing/moving
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingOnion, setDraggingOnion] = useState<'prev' | 'next' | null>(null);
  const [resizingCel, setResizingCel] = useState<{ layerId: string; startFrame: number } | null>(null);
  const [movingCel, setMovingCel] = useState<{ layerId: string; fromFrame: number } | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ x: number; y: number; layerId: string; frame: number } | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrubTimeoutRef = useRef<number | null>(null);

  const {
    canvasWidth,
    canvasHeight,
    layers,
    activeLayerId,
    selectedLayerIds,
    audioTrack,
    timelineMarkers,
    timelineCellWidth,
    currentFrame,
    totalFrames,
    playStart,
    playEnd,
    fps,
    isPlaying,
    loopPlayback,
    onionSkin,
    onionPrev,
    onionNext
  } = useHarmonyStore(
    useShallow((s) => ({
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      selectedLayerIds: s.selectedLayerIds,
      audioTrack: s.audioTrack,
      timelineMarkers: s.timelineMarkers,
      timelineCellWidth: s.timelineCellWidth,
      currentFrame: s.currentFrame,
      totalFrames: s.totalFrames,
      playStart: s.playStart,
      playEnd: s.playEnd,
      fps: s.fps,
      isPlaying: s.isPlaying,
      loopPlayback: s.loopPlayback,
      onionSkin: s.onionSkin,
      onionPrev: s.onionPrev,
      onionNext: s.onionNext
    }))
  );

  // Actions are stable function references in Zustand — reading once via getState() avoids re-renders!
  const {
    setCurrentFrame,
    nextFrame,
    prevFrame,
    setFps,
    setTotalFrames,
    setPlayRange,
    togglePlay,
    setIsPlaying,
    toggleLoop,
    toggleOnionSkin,
    setOnionRange,
    addLayer,
    addFolderLayer,
    duplicateLayer,
    mergeLayerDown,
    deleteSelectedLayers,
    setActiveLayer,
    toggleSelectLayer,
    toggleLayerAlphaLock,
    reorderLayer,
    renameLayer,
    setLayerBlendMode,
    toggleLayerVisibility,
    toggleLayerLock,
    toggleLayerSolo,
    toggleLayerHold,
    toggleFolderCollapse,
    setLayerParent,
    setSelectedLayersOpacity,
    setCelDuration,
    moveCelFrame,
    substituteCel,
    setFrameTag,
    setTimelineMarker,
    setTimelineCellWidth,
    reverseFrameRange,
    deleteFrameRange,
    moveFrameRange,
    setAudioTrack,
    duplicateFrameToNext,
    insertFrameAfterCurrent,
    copyCurrentFrame,
    pasteToCurrentFrame,
    reduceExposureShiftF5,
    clearCurrentFrame
  } = useHarmonyStore.getState();

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  // Audio scrub snippet (plays 75ms slice when scrubbing the playhead)
  const triggerAudioScrub = useCallback(
    (frame: number) => {
      const audio = audioRef.current;
      if (!audio || !audioTrack || isPlaying) return;
      const t = Math.max(0, (frame - 1) / fps);
      if (t >= audioTrack.duration) return;
      audio.currentTime = t;
      audio.play().catch(() => {});
      if (scrubTimeoutRef.current) window.clearTimeout(scrubTimeoutRef.current);
      scrubTimeoutRef.current = window.setTimeout(() => {
        audio.pause();
      }, 75);
    },
    [audioTrack, isPlaying, fps]
  );

  // Sync Audio Track with Timeline Play / Pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioTrack) return;
    if (isPlaying) {
      audio.currentTime = Math.max(0, (currentFrame - 1) / fps);
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, audioTrack, fps]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      const state = useHarmonyStore.getState();
      if (state.currentFrame >= state.playEnd && !state.loopPlayback) {
        setIsPlaying(false);
      } else {
        state.nextFrame();
      }
    }, 1000 / fps);
    return () => window.clearInterval(interval);
  }, [isPlaying, fps, setIsPlaying]);

  // Global mouse move/up for Scrubbing, Onion Handles, and Cel Resize/Move
  const frameFromClientX = useCallback(
    (clientX: number) => {
      const el = rulerRef.current;
      if (!el) return currentFrame;
      const rect = el.getBoundingClientRect();
      const relX = clientX - rect.left;
      return Math.max(1, Math.min(totalFrames, Math.floor(relX / timelineCellWidth) + 1));
    },
    [currentFrame, totalFrames, timelineCellWidth]
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (isScrubbing) {
        const f = frameFromClientX(e.clientX);
        if (f !== currentFrame) {
          setCurrentFrame(f);
          triggerAudioScrub(f);
        }
      } else if (draggingOnion === 'prev') {
        const f = frameFromClientX(e.clientX);
        const nextPrev = Math.max(0, Math.min(8, currentFrame - f));
        setOnionRange(nextPrev, onionNext);
      } else if (draggingOnion === 'next') {
        const f = frameFromClientX(e.clientX);
        const nextNext = Math.max(0, Math.min(8, f - currentFrame));
        setOnionRange(onionPrev, nextNext);
      } else if (resizingCel) {
        const f = frameFromClientX(e.clientX);
        const newDur = Math.max(1, f - resizingCel.startFrame + 1);
        setCelDuration(resizingCel.layerId, resizingCel.startFrame, newDur);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (movingCel) {
        const targetF = frameFromClientX(e.clientX);
        if (targetF !== movingCel.fromFrame) {
          moveCelFrame(movingCel.layerId, movingCel.fromFrame, targetF);
        }
        setMovingCel(null);
      }
      setIsScrubbing(false);
      setDraggingOnion(null);
      setResizingCel(null);
    };

    if (isScrubbing || draggingOnion || resizingCel || movingCel) {
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      return () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };
    }
  }, [
    isScrubbing,
    draggingOnion,
    resizingCel,
    movingCel,
    currentFrame,
    onionPrev,
    onionNext,
    frameFromClientX,
    setCurrentFrame,
    triggerAudioScrub,
    setOnionRange,
    setCelDuration,
    moveCelFrame
  ]);

  // Clear timeline focus when user clicks outside the Timeline panel
  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (timelineRootRef.current && !timelineRootRef.current.contains(e.target as Node)) {
        setTimelineFocus(null);
      }
    };
    window.addEventListener('pointerdown', onDocPointerDown);
    return () => window.removeEventListener('pointerdown', onDocPointerDown);
  }, []);

  // Delete key: deletes hovered frame, OR selected layer(s) when layer list is focused, OR selected frame(s)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key !== 'Delete') return;

      if (hoveredCell) {
        e.preventDefault();
        deleteFrameRange(hoveredCell.layerId, hoveredCell.frame, hoveredCell.frame);
        setHoverPreview(null);
      } else if (timelineFocus === 'layers') {
        e.preventDefault();
        deleteSelectedLayers();
      } else if (selRange && timelineFocus === 'frames') {
        e.preventDefault();
        deleteFrameRange(selRange.layerId, selRange.start, selRange.end);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hoveredCell, timelineFocus, selRange, deleteFrameRange, deleteSelectedLayers]);

  // Filter out children of collapsed folders
  const collapsedFolders = new Set(layers.filter((l) => l.type === 'folder' && l.collapsed).map((l) => l.id));
  const visibleRows = layers.filter((l) => !l.parentId || !collapsedFolders.has(l.parentId));

  const framesArray = Array.from({ length: totalFrames }, (_, i) => i + 1);
  const gridWidth = totalFrames * timelineCellWidth;

  // Existing drawn frames on the menu layer (for Drawing Substitution)
  const menuLayer = frameMenu ? layers.find((l) => l.id === frameMenu.layerId) : null;
  const availableCels = menuLayer
    ? Object.entries(menuLayer.frames)
        .filter(([, strokes]) => strokes && strokes.length > 0)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b)
    : [];

  return (
    <div ref={timelineRootRef} className="timeline-pane">
      {/* Timeline Top Control Bar (Organized into 3 clean pill groups) */}
      <div
        style={{
          height: 34,
          background: '#2b2b2b',
          borderBottom: '1px solid #181818',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          gap: 8,
          overflowX: 'auto'
        }}
      >
        {/* Left: Layers & Frames Groups */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: '#222',
              border: '1px solid #363636',
              borderRadius: 5,
              padding: '2px 4px'
            }}
          >
            <button className="icon-btn" onClick={() => addLayer()} title="Nova Layer">
              <Plus size={13} />
            </button>
            <button className="icon-btn" onClick={() => addFolderLayer()} title="Nova Pasta de Layers">
              <FolderPlus size={13} />
            </button>
            <button className="icon-btn" onClick={() => duplicateLayer(activeLayerId)} title="Duplicar Layer">
              <Copy size={12} />
            </button>
            <button className="icon-btn" onClick={() => mergeLayerDown(activeLayerId)} title="Mesclar para Baixo">
              <Layers size={12} />
            </button>
            <button className="icon-btn" onClick={() => deleteSelectedLayers()} title="Apagar Layer(s) Selecionada(s) (Delete)">
              <Trash2 size={12} />
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: '#222',
              border: '1px solid #363636',
              borderRadius: 5,
              padding: '2px 4px'
            }}
          >
            <button className="icon-btn" onClick={insertFrameAfterCurrent} title="Inserir Frame (+ Frame)">
              <Plus size={12} />
              <span>Frame</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => {
                if (selRange && selRange.layerId === activeLayerId) {
                  deleteFrameRange(selRange.layerId, selRange.start, selRange.end);
                } else {
                  deleteFrameRange(activeLayerId, currentFrame, currentFrame);
                }
              }}
              title="Deletar Frame Selecionado (Delete)"
            >
              <Trash2 size={12} />
            </button>
            <button className="icon-btn" onClick={duplicateFrameToNext} title="Duplicar Frame para Próximo (F6)">
              <CopyPlus size={12} />
            </button>
            <button className="icon-btn" onClick={clearCurrentFrame} title="Limpar Frame Atual">
              <Eraser size={12} />
            </button>
            <button
              className="icon-btn"
              onClick={() => {
                const existing = timelineMarkers[currentFrame] || '';
                const txt = window.prompt(`Marcador no Frame ${currentFrame} (deixe vazio para remover):`, existing);
                if (txt !== null) setTimelineMarker(currentFrame, txt);
              }}
              title="Adicionar Marcador de Texto na Régua"
            >
              <Flag size={12} />
            </button>
          </div>
        </div>

        {/* Center: Playback + Onion Skin + Timecode */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: '#222',
            border: '1px solid #363636',
            borderRadius: 5,
            padding: '2px 6px'
          }}
        >
          <button className="icon-btn" onClick={prevFrame} title="Frame Anterior (←)">
            <SkipBack size={13} />
          </button>
          <button
            className={`icon-btn ${isPlaying ? 'active' : ''}`}
            onClick={togglePlay}
            title="Play / Pause (Shift+Space)"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button className="icon-btn" onClick={nextFrame} title="Próximo Frame (→)">
            <SkipForward size={13} />
          </button>
          <button
            className={`icon-btn ${loopPlayback ? 'active' : ''}`}
            onClick={toggleLoop}
            title="Loop"
          >
            <Repeat size={12} />
          </button>
          <div style={{ width: 1, height: 14, background: '#3a3a3a', margin: '0 2px' }} />
          <button
            className={`icon-btn ${onionSkin ? 'active' : ''}`}
            onClick={toggleOnionSkin}
            title={`Onion Skin: ${onionSkin ? 'ATIVO' : 'DESATIVADO'} (${onionPrev} ant / ${onionNext} post)`}
            style={
              onionSkin
                ? { background: '#26466d', borderColor: '#3a86ff', color: '#e0f2fe', gap: 4 }
                : { gap: 4 }
            }
          >
            <Layers size={12} />
            <span style={{ fontSize: 10.5 }}>Onion</span>
          </button>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#93c5fd',
              background: '#181818',
              padding: '2px 6px',
              borderRadius: 3,
              border: '1px solid #333',
              marginLeft: 2
            }}
            title="Tempo (MM:SS+Frame)"
          >
            {formatTimecode(currentFrame, fps)}
          </span>
        </div>

        {/* Right: Layer Blend/Opacity + Tempo/Range + Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          {activeLayer && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: '#222',
                border: '1px solid #363636',
                borderRadius: 5,
                padding: '2px 6px'
              }}
            >
              <select
                value={activeLayer.blendMode || 'source-over'}
                onChange={(e) =>
                  setLayerBlendMode(activeLayer.id, e.target.value as GlobalCompositeOperation)
                }
                className="harmony-input"
                title="Blend Mode"
                style={{ width: 78, padding: '1px 4px', height: 20 }}
              >
                <option value="source-over">Normal</option>
                <option value="multiply">Multiply</option>
                <option value="screen">Screen</option>
                <option value="overlay">Overlay</option>
                <option value="darken">Darken</option>
                <option value="lighten">Lighten</option>
                <option value="color-dodge">Color Dodge</option>
                <option value="color-burn">Color Burn</option>
                <option value="hard-light">Hard Light</option>
                <option value="soft-light">Soft Light</option>
                <option value="difference">Difference</option>
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#bbb' }}>
                Opac{selectedLayerIds.length > 1 ? `(${selectedLayerIds.length})` : ''}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(activeLayer.opacity * 100)}
                  onChange={(e) => setSelectedLayersOpacity(Number(e.target.value) / 100)}
                  style={{ width: 48, accentColor: '#3a86ff' }}
                />
              </label>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: '#222',
              border: '1px solid #363636',
              borderRadius: 5,
              padding: '2px 7px',
              color: '#a3a3a3',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Frame de Início do Playback">
              <span style={{ fontSize: 10.5, color: '#9ca3af' }}>Início</span>
              <input
                type="number"
                min={1}
                max={totalFrames}
                value={playStart}
                onChange={(e) => setPlayRange(Number(e.target.value), playEnd)}
                className="harmony-input timeline-num-input"
                style={{ width: 42, height: 20 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Frame de Fim do Playback">
              <span style={{ fontSize: 10.5, color: '#9ca3af' }}>Fim</span>
              <input
                type="number"
                min={playStart}
                max={totalFrames}
                value={playEnd}
                onChange={(e) => setPlayRange(playStart, Number(e.target.value))}
                className="harmony-input timeline-num-input"
                style={{ width: 42, height: 20 }}
              />
            </label>
            <div style={{ width: 1, height: 14, background: '#3a3a3a' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Total de Frames da Cena">
              <span style={{ fontSize: 10.5, color: '#9ca3af' }}>Frames</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={totalFrames}
                onChange={(e) => setTotalFrames(Number(e.target.value))}
                className="harmony-input timeline-num-input"
                style={{ width: 46, height: 20 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Quadros por Segundo (FPS)">
              <span style={{ fontSize: 10.5, color: '#9ca3af' }}>FPS</span>
              <input
                type="number"
                min={1}
                max={60}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="harmony-input timeline-num-input"
                style={{ width: 38, height: 20 }}
              />
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              background: '#222',
              border: '1px solid #363636',
              borderRadius: 5,
              padding: '2px 3px'
            }}
          >
            <button
              className="icon-btn"
              onClick={() => setTimelineCellWidth(timelineCellWidth - 4)}
              title="Diminuir Zoom da Timeline"
            >
              <ZoomOut size={12} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setTimelineCellWidth(timelineCellWidth + 4)}
              title="Aumentar Zoom da Timeline"
            >
              <ZoomIn size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Unified Timeline Body: Single Synchronized Scroll Container (Sticky Left Layer Column + Sticky Top Ruler) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
          background: '#212121'
        }}
      >
        <div style={{ width: 262 + gridWidth, minHeight: '100%', position: 'relative' }}>
          {/* Sticky Top Header Row (Layers Header + Frame Ruler) */}
          <div
            style={{
              display: 'flex',
              height: 28,
              width: 262 + gridWidth,
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: '#2c2c2c',
              borderBottom: '1px solid #181818'
            }}
          >
            {/* Sticky Top-Left Corner: Layers Count */}
            <div
              style={{
                width: 262,
                height: 28,
                flexShrink: 0,
                position: 'sticky',
                left: 0,
                zIndex: 25,
                background: '#2c2c2c',
                borderRight: '1px solid #181818',
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 10.5,
                color: '#888'
              }}
            >
              <span>Layers ({layers.length})</span>
              <span style={{ fontSize: 9.5, color: '#666' }}>Arraste p/ Pasta</span>
            </div>

            {/* Interactive Frame Ruler with Scrubbing, Markers & Draggable Onion Skin Brackets */}
            <div
              ref={rulerRef}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                setHoverPreview(null);
                const f = frameFromClientX(e.clientX);
                setCurrentFrame(f);
                triggerAudioScrub(f);
                setIsScrubbing(true);
              }}
              style={{
                display: 'flex',
                height: 28,
                width: gridWidth,
                position: 'relative',
                cursor: 'ew-resize',
                touchAction: 'none',
                userSelect: 'none'
              }}
            >
              {/* Draggable Onion Skin Brackets on the Ruler (Pen-friendly PointerEvents + Grab Handles) */}
              {onionSkin && currentFrame > 1 && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setHoverPreview(null);
                    setDraggingOnion('prev');
                  }}
                  title={`Onion Skin Anterior: ${onionPrev} frames (arraste na régua!)`}
                  style={{
                    position: 'absolute',
                    left: Math.max(0, (currentFrame - 1 - onionPrev) * timelineCellWidth - (onionPrev === 0 ? 8 : 0)),
                    width: Math.max(10, Math.min(currentFrame - 1, onionPrev) * timelineCellWidth),
                    bottom: 0,
                    height: 11,
                    background: onionPrev > 0 ? 'rgba(239, 68, 68, 0.78)' : 'transparent',
                    borderLeft: '4px solid #ff6b6b',
                    borderRadius: '3px 0 0 0',
                    cursor: 'ew-resize',
                    zIndex: 14,
                    touchAction: 'none',
                    userSelect: 'none'
                  }}
                />
              )}
              {onionSkin && currentFrame < totalFrames && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setHoverPreview(null);
                    setDraggingOnion('next');
                  }}
                  title={`Onion Skin Posterior: ${onionNext} frames (arraste na régua!)`}
                  style={{
                    position: 'absolute',
                    left: currentFrame * timelineCellWidth,
                    width: Math.max(10, Math.min(totalFrames - currentFrame, onionNext) * timelineCellWidth),
                    bottom: 0,
                    height: 11,
                    background: onionNext > 0 ? 'rgba(34, 197, 94, 0.78)' : 'transparent',
                    borderRight: '4px solid #4ade80',
                    borderRadius: '0 3px 0 0',
                    cursor: 'ew-resize',
                    zIndex: 14,
                    touchAction: 'none',
                    userSelect: 'none'
                  }}
                />
              )}

              {framesArray.map((f) => {
                const isCurr = f === currentFrame;
                const inPlayRange = f >= playStart && f <= playEnd;
                const marker = timelineMarkers[f];
                return (
                  <div
                    key={f}
                    title={marker ? `Frame ${f}: ${marker}` : `Frame ${f}`}
                    style={{
                      width: timelineCellWidth,
                      height: 28,
                      borderRight: '1px solid #383838',
                      borderTop: inPlayRange ? '2px solid #3a86ff' : '2px solid transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9.5,
                      position: 'relative',
                      background: isCurr ? '#e53935' : f % 5 === 0 ? '#343434' : 'transparent',
                      color: isCurr ? '#fff' : f % 5 === 0 ? '#ddd' : '#777',
                      fontWeight: isCurr || f % 5 === 0 ? 700 : 400
                    }}
                  >
                    <span>{f % 5 === 0 || f === 1 || isCurr ? f : '·'}</span>
                    {marker && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 1,
                          left: 2,
                          fontSize: 8.5,
                          color: '#facc15',
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                          zIndex: 15
                        }}
                      >
                        ⚑ {marker}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Continuous Vertical Red Playhead Line across all layers (slides cleanly under sticky left column!) */}
          <div
            style={{
              position: 'absolute',
              top: 28,
              bottom: 0,
              left: 262 + (currentFrame - 1) * timelineCellWidth + timelineCellWidth / 2 - 1,
              width: 2,
              background: '#ef4444',
              boxShadow: '0 0 4px rgba(239, 68, 68, 0.55)',
              pointerEvents: 'none',
              zIndex: 10
            }}
          />

          {/* Synchronized Layer + Frames Rows (100% locked together on scroll!) */}
          {visibleRows.map((layer) => {
            const origIndex = layers.findIndex((l) => l.id === layer.id);
            const isActive = layer.id === activeLayerId;
            const isSelected = selectedLayerIds.includes(layer.id);
            const isChild = Boolean(layer.parentId);

            // Compute Cel Exposure blocks for this layer
            const celBlocks: { start: number; dur: number; hasStrokes: boolean }[] = [];
            for (const [fKey, strokes] of Object.entries(layer.frames)) {
              const start = Number(fKey);
              const dur = layer.celDurations?.[start] || 1;
              celBlocks.push({ start, dur, hasStrokes: strokes.length > 0 });
            }

            return (
              <div
                key={`row-${layer.id}`}
                style={{
                  display: 'flex',
                  height: 26,
                  width: 262 + gridWidth,
                  borderBottom: '1px solid #1a1a1a',
                  background: layer.type === 'folder' ? '#252525' : 'transparent'
                }}
              >
                {/* Sticky Left Layer Info Cell */}
                <div
                  draggable
                  onDragStart={() => setDragLayerIdx(origIndex)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragLayerIdx !== null && dragLayerIdx !== origIndex) {
                      const dragged = layers[dragLayerIdx];
                      if (layer.type === 'folder' && dragged.type !== 'folder') {
                        setLayerParent(dragged.id, layer.id);
                        reorderLayer(dragLayerIdx, origIndex + 1);
                      } else {
                        if (dragged.parentId && !layer.parentId) {
                          setLayerParent(dragged.id, null);
                        }
                        reorderLayer(dragLayerIdx, origIndex);
                      }
                    }
                    setDragLayerIdx(null);
                  }}
                  onDragEnd={() => setDragLayerIdx(null)}
                  onClick={(e) => {
                    setTimelineFocus('layers');
                    toggleSelectLayer(layer.id, e.ctrlKey || e.metaKey, e.shiftKey);
                  }}
                  title="Arraste para reordenar ou soltar em uma Pasta • Shift+Clique para intervalo • Ctrl+Clique para várias • Delete para apagar"
                  style={{
                    width: 262,
                    height: 26,
                    flexShrink: 0,
                    position: 'sticky',
                    left: 0,
                    zIndex: 15,
                    display: 'flex',
                    alignItems: 'center',
                    padding: `0 6px 0 ${isChild ? 20 : 6}px`,
                    gap: 5,
                    background: isActive ? '#2d4b75' : isSelected ? '#263b59' : '#262626',
                    borderRight: '1px solid #181818',
                    cursor: 'grab'
                  }}
                >
                  {layer.type === 'folder' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolderCollapse(layer.id);
                      }}
                      style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', padding: 0 }}
                    >
                      {layer.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerVisibility(layer.id);
                    }}
                    style={{ background: 'none', border: 'none', color: layer.visible ? '#ddd' : '#555', cursor: 'pointer' }}
                    title="Visibilidade"
                  >
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>

                  {layer.type !== 'folder' && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerSolo(layer.id);
                        }}
                        style={{
                          background: layer.solo ? '#eab308' : 'transparent',
                          border: `1px solid ${layer.solo ? '#facc15' : '#444'}`,
                          borderRadius: 2,
                          color: layer.solo ? '#111' : '#777',
                          fontSize: 9,
                          fontWeight: 800,
                          width: 15,
                          height: 15,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Solo (Isolar esta layer)"
                      >
                        S
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerLock(layer.id);
                        }}
                        style={{ background: 'none', border: 'none', color: layer.locked ? '#f59e0b' : '#666', cursor: 'pointer' }}
                        title="Bloquear Layer"
                      >
                        {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerAlphaLock(layer.id);
                        }}
                        style={{
                          background: layer.alphaLock ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
                          border: `1px solid ${layer.alphaLock ? '#38bdf8' : '#444'}`,
                          borderRadius: 2,
                          width: 15,
                          height: 15,
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        title={layer.alphaLock ? 'Bloquear Pixels Transparentes: ATIVO' : 'Bloquear Pixels Transparentes (Alpha Lock)'}
                      >
                        <svg width="9" height="9" viewBox="0 0 8 8">
                          <rect x="0" y="0" width="4" height="4" fill={layer.alphaLock ? '#38bdf8' : '#777'} />
                          <rect x="4" y="4" width="4" height="4" fill={layer.alphaLock ? '#38bdf8' : '#777'} />
                          <rect x="4" y="0" width="4" height="4" fill={layer.alphaLock ? '#0f172a' : '#333'} />
                          <rect x="0" y="4" width="4" height="4" fill={layer.alphaLock ? '#0f172a' : '#333'} />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerHold(layer.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: layer.holdFrames ? '#10b981' : '#555',
                          cursor: 'pointer'
                        }}
                        title={layer.holdFrames ? 'Hold Exposure ON' : 'Hold Exposure OFF'}
                      >
                        <Pin size={11} />
                      </button>
                    </>
                  )}

                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: layer.tagColor,
                      flexShrink: 0
                    }}
                  />

                  {editingLayerId === layer.id ? (
                    <input
                      autoFocus
                      className="harmony-input"
                      value={editingName}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => {
                        if (editingName.trim()) renameLayer(layer.id, editingName.trim());
                        setEditingLayerId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingName.trim()) renameLayer(layer.id, editingName.trim());
                          setEditingLayerId(null);
                        } else if (e.key === 'Escape') {
                          setEditingLayerId(null);
                        }
                      }}
                      style={{ flex: 1, height: 20, fontSize: 11 }}
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingLayerId(layer.id);
                        setEditingName(layer.name);
                      }}
                      title="Duplo-clique para renomear"
                      style={{
                        fontSize: 11,
                        color: isActive ? '#fff' : '#ccc',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}
                    >
                      {layer.type === 'folder' ? `📁 ${layer.name}` : layer.name}
                    </span>
                  )}
                </div>

                {/* Right Frames Track for this Layer */}
                <div
                  style={{
                    display: 'flex',
                    width: gridWidth,
                    height: 26,
                    position: 'relative'
                  }}
                >
                  {/* Background Grid Cells */}
                  {framesArray.map((f) => {
                    const hasDirectDrawing = (layer.frames[f]?.length || 0) > 0;
                    const isExplicitBlank = !hasDirectDrawing && layer.frames[f] !== undefined;
                    const hasHeldDrawing =
                      !hasDirectDrawing && !isExplicitBlank && getEffectiveFrameStrokes(layer, f).length > 0;
                    const isCurr = f === currentFrame;
                    const isInSel =
                      selRange &&
                      selRange.layerId === layer.id &&
                      f >= Math.min(selRange.start, selRange.end) &&
                      f <= Math.max(selRange.start, selRange.end);

                    return (
                      <div
                        key={f}
                        onPointerEnter={() => setHoveredCell({ layerId: layer.id, frame: f })}
                        onPointerLeave={() =>
                          setHoveredCell((prev) =>
                            prev && prev.layerId === layer.id && prev.frame === f ? null : prev
                          )
                        }
                        onClick={(e) => {
                          setFrameMenu(null);
                          setTimelineFocus('frames');
                          setActiveLayer(layer.id);
                          if (e.shiftKey) {
                            setSelRange((prev) =>
                              prev && prev.layerId === layer.id
                                ? { layerId: layer.id, start: prev.start, end: f }
                                : { layerId: layer.id, start: currentFrame, end: f }
                            );
                          } else {
                            setSelRange({ layerId: layer.id, start: f, end: f });
                          }
                          setCurrentFrame(f);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setActiveLayer(layer.id);
                          setCurrentFrame(f);
                          setFrameMenu({ x: e.clientX, y: e.clientY, layerId: layer.id, frame: f });
                        }}
                        style={{
                          width: timelineCellWidth,
                          height: 26,
                          borderRight: '1px solid #2c2c2c',
                          position: 'relative',
                          background: isCurr
                            ? 'rgba(229, 57, 53, 0.22)'
                            : hasHeldDrawing
                            ? 'rgba(16, 185, 129, 0.16)'
                            : 'transparent',
                          outline: isInSel ? '1.5px solid #f59e0b' : 'none',
                          outlineOffset: -1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        {hasHeldDrawing && (
                          <div style={{ width: '100%', height: 2, background: 'rgba(16, 185, 129, 0.5)' }} />
                        )}
                        {layer.keyframes?.[f] && (
                          <div
                            title="Motion Keyframe"
                            style={{
                              width: 7,
                              height: 7,
                              background: '#f59e0b',
                              transform: 'rotate(45deg)',
                              position: 'absolute',
                              zIndex: 6
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Draggable & Resizable Cel Exposure Blocks */}
                  {layer.type !== 'folder' &&
                    celBlocks.map((cel) => {
                      const tag = layer.frameTags?.[cel.start];
                      const blockColor = tag
                        ? TAG_COLORS[tag]
                        : cel.hasStrokes
                        ? '#3b5984'
                        : '#2f3742';

                      return (
                        <div
                          key={`cel-${layer.id}-${cel.start}`}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            setHoverPreview(null);
                            setTimelineFocus('frames');
                            setSelRange({ layerId: layer.id, start: cel.start, end: cel.start });
                            setActiveLayer(layer.id);
                            setCurrentFrame(cel.start);
                            setMovingCel({ layerId: layer.id, fromFrame: cel.start });
                          }}
                          onPointerEnter={(e) => {
                            setHoveredCell({ layerId: layer.id, frame: cel.start });
                            if (!cel.hasStrokes || isScrubbing || draggingOnion || resizingCel || movingCel) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoverPreview({
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                              layerId: layer.id,
                              frame: cel.start
                            });
                          }}
                          onPointerLeave={() => {
                            setHoveredCell((prev) =>
                              prev && prev.layerId === layer.id && prev.frame === cel.start ? null : prev
                            );
                            setHoverPreview((prev) =>
                              prev && prev.layerId === layer.id && prev.frame === cel.start ? null : prev
                            );
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setHoverPreview(null);
                            setActiveLayer(layer.id);
                            setCurrentFrame(cel.start);
                            setFrameMenu({ x: e.clientX, y: e.clientY, layerId: layer.id, frame: cel.start });
                          }}
                          title={`Cel F${cel.start} (${cel.dur}f) — Arraste para mover ou puxe a borda direita para estender exposição`}
                          style={{
                            position: 'absolute',
                            left: (cel.start - 1) * timelineCellWidth + 1,
                            top: 2,
                            width: cel.dur * timelineCellWidth - 2,
                            height: 22,
                            background: blockColor,
                            border: '1px solid rgba(255,255,255,0.22)',
                            borderRadius: 3,
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: 5,
                            cursor: 'grab',
                            zIndex: 3,
                            pointerEvents: 'auto',
                            touchAction: 'none',
                            userSelect: 'none'
                          }}
                        >
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: cel.hasStrokes ? '#e0f2fe' : 'transparent',
                              border: cel.hasStrokes ? 'none' : '1.5px solid #93c5fd',
                              flexShrink: 0
                            }}
                          />
                          {cel.dur > 1 && (
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', marginLeft: 4 }}>
                              {cel.dur}f
                            </span>
                          )}

                          {/* Right-edge Exposure Resize Handle */}
                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setHoverPreview(null);
                              setResizingCel({ layerId: layer.id, startFrame: cel.start });
                            }}
                            title="Arraste para estender ou encurtar exposição (1s, 2s, 3s...)"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: 8,
                              cursor: 'ew-resize',
                              background: 'rgba(255,255,255,0.22)',
                              borderRadius: '0 2px 2px 0',
                              touchAction: 'none',
                              userSelect: 'none'
                            }}
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audio Track & Waveform Bar */}
      {audioTrack && (
        <div
          style={{
            height: 36,
            background: '#1c242b',
            borderTop: '1px solid #2e4052',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            gap: 10
          }}
        >
          <audio ref={audioRef} src={audioTrack.objectUrl} />
          <div style={{ width: 228, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#93c5fd' }}>
            <Volume2 size={13} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {audioTrack.name}
            </span>
            <button
              className="icon-btn"
              onClick={() => setAudioTrack(null)}
              title="Remover Áudio"
              style={{ height: 18, minWidth: 18 }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, height: 26, display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
            {audioTrack.peaks.map((pk, idx) => (
              <div
                key={idx}
                style={{
                  flex: 1,
                  height: `${Math.max(8, Math.round(pk * 100))}%`,
                  background: '#38bdf8',
                  borderRadius: 1
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pro Frame Right-Click Context Menu */}
      {frameMenu && (
        <div
          className="dropdown-menu"
          style={{
            position: 'fixed',
            left: Math.min(frameMenu.x, window.innerWidth - 220),
            top: Math.min(frameMenu.y, window.innerHeight - 320),
            zIndex: 1200,
            minWidth: 210
          }}
          onMouseLeave={() => setFrameMenu(null)}
        >
          <button className="dropdown-item" onClick={() => { copyCurrentFrame(); setFrameMenu(null); }}>
            <span>Copiar Frame</span><span style={{ color: '#888' }}>Ctrl+C</span>
          </button>
          <button className="dropdown-item" onClick={() => { pasteToCurrentFrame(); setFrameMenu(null); }}>
            <span>Colar Frame</span><span style={{ color: '#888' }}>Ctrl+V</span>
          </button>
          <div className="dropdown-sep" />
          <button className="dropdown-item" onClick={() => { insertFrameAfterCurrent(); setFrameMenu(null); }}>
            <span>Inserir Frame (+ Frame)</span>
          </button>
          <button className="dropdown-item" onClick={() => { duplicateFrameToNext(); setFrameMenu(null); }}>
            <span>Duplicar para Próximo</span><span style={{ color: '#888' }}>F6</span>
          </button>

          {/* Batch operations when a multi-frame range is selected */}
          {selRange && selRange.layerId === frameMenu.layerId && selRange.start !== selRange.end && (
            <>
              <div className="dropdown-sep" />
              <button
                className="dropdown-item"
                onClick={() => {
                  moveFrameRange(selRange.layerId, selRange.start, selRange.end, 1);
                  setFrameMenu(null);
                }}
              >
                <span>Mover Seleção (+1 frame)</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  reverseFrameRange(selRange.layerId, selRange.start, selRange.end);
                  setFrameMenu(null);
                }}
              >
                <span>Inverter Ordem (Reverse)</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  deleteFrameRange(selRange.layerId, selRange.start, selRange.end);
                  setSelRange(null);
                  setFrameMenu(null);
                }}
              >
                <span>Apagar Frames Selecionados</span>
              </button>
            </>
          )}

          <div className="dropdown-sep" />
          <div style={{ padding: '2px 12px', fontSize: 10, color: '#888' }}>ETIQUETA DE POSE</div>
          <div style={{ display: 'flex', gap: 4, padding: '4px 10px' }}>
            <button
              className="icon-btn"
              style={{ flex: 1, background: '#3b82f6', color: '#fff', fontSize: 10 }}
              onClick={() => { setFrameTag(frameMenu.layerId, frameMenu.frame, 'key'); setFrameMenu(null); }}
            >
              Key
            </button>
            <button
              className="icon-btn"
              style={{ flex: 1, background: '#f59e0b', color: '#111', fontSize: 10 }}
              onClick={() => { setFrameTag(frameMenu.layerId, frameMenu.frame, 'breakdown'); setFrameMenu(null); }}
            >
              Brk
            </button>
            <button
              className="icon-btn"
              style={{ flex: 1, background: '#10b981', color: '#111', fontSize: 10 }}
              onClick={() => { setFrameTag(frameMenu.layerId, frameMenu.frame, 'inbetween'); setFrameMenu(null); }}
            >
              Inb
            </button>
            <button
              className="icon-btn"
              style={{ fontSize: 10 }}
              onClick={() => { setFrameTag(frameMenu.layerId, frameMenu.frame, null); setFrameMenu(null); }}
              title="Limpar Etiqueta"
            >
              ×
            </button>
          </div>

          {availableCels.length > 0 && (
            <>
              <div className="dropdown-sep" />
              <div style={{ padding: '2px 12px', fontSize: 10, color: '#888' }}>REUTILIZAR CEL (SUBSTITUTION)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 10px', maxHeight: 64, overflowY: 'auto' }}>
                {availableCels.slice(0, 12).map((srcF) => (
                  <button
                    key={srcF}
                    className="icon-btn"
                    style={{ fontSize: 10, height: 20, background: '#3a3a3a' }}
                    onClick={() => {
                      substituteCel(frameMenu.layerId, frameMenu.frame, srcF);
                      setFrameMenu(null);
                    }}
                  >
                    Cel F{srcF}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="dropdown-sep" />
          <button className="dropdown-item" onClick={() => { clearCurrentFrame(); setFrameMenu(null); }}>
            <span>Limpar Frame</span>
          </button>
          <button className="dropdown-item" onClick={() => { reduceExposureShiftF5(); setFrameMenu(null); }}>
            <span>Remover Frame</span><span style={{ color: '#888' }}>Shift+F5</span>
          </button>
        </div>
      )}

      {/* Floating Cel Hover Thumbnail Preview */}
      {hoverPreview && !isScrubbing && !draggingOnion && !resizingCel && !movingCel && (() => {
        const previewLayer = layers.find((l) => l.id === hoverPreview.layerId);
        if (!previewLayer) return null;
        return (
          <CelHoverPreview
            layer={previewLayer}
            frame={hoverPreview.frame}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            x={hoverPreview.x}
            y={hoverPreview.y}
          />
        );
      })()}
    </div>
  );
};
