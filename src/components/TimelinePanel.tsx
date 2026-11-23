import React, { useEffect, useState, useRef } from 'react';
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
  Eraser
} from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { getEffectiveFrameStrokes } from '../utils/canvasRenderer';

export const TimelinePanel: React.FC = () => {
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    layers,
    activeLayerId,
    selectedLayerIds,
    audioTrack,
    currentFrame,
    totalFrames,
    playStart,
    playEnd,
    fps,
    isPlaying,
    loopPlayback,
    setCurrentFrame,
    nextFrame,
    prevFrame,
    setFps,
    setTotalFrames,
    setPlayRange,
    togglePlay,
    setIsPlaying,
    toggleLoop,
    addLayer,
    addFolderLayer,
    duplicateLayer,
    mergeLayerDown,
    deleteLayer,
    setActiveLayer,
    toggleSelectLayer,
    reorderLayer,
    renameLayer,
    setLayerBlendMode,
    toggleLayerVisibility,
    toggleLayerLock,
    toggleLayerHold,
    setSelectedLayersOpacity,
    setAudioTrack,
    duplicateFrameToNext,
    insertFrameAfterCurrent,
    clearCurrentFrame
  } = useHarmonyStore();

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

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      const state = useHarmonyStore.getState();
      if (state.currentFrame >= state.totalFrames && !state.loopPlayback) {
        setIsPlaying(false);
      } else {
        state.nextFrame();
      }
    }, 1000 / fps);
    return () => window.clearInterval(interval);
  }, [isPlaying, fps, setIsPlaying]);

  const framesArray = Array.from({ length: totalFrames }, (_, i) => i + 1);

  return (
    <div className="timeline-pane">
      {/* Timeline Top Control Bar */}
      <div
        style={{
          height: 30,
          background: '#313131',
          borderBottom: '1px solid #181818',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px'
        }}
      >
        {/* Left: Layer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#ccc', marginRight: 6 }}>Timeline</span>
          <button className="icon-btn" onClick={() => addLayer()} title="Add Drawing Layer">
            <Plus size={13} />
          </button>
          <button className="icon-btn" onClick={() => addFolderLayer()} title="Add Layer Folder">
            <FolderPlus size={13} />
          </button>
          <button className="icon-btn" onClick={() => duplicateLayer(activeLayerId)} title="Duplicate Layer">
            <Copy size={13} />
          </button>
          <button className="icon-btn" onClick={() => mergeLayerDown(activeLayerId)} title="Merge Layer Down">
            <Layers size={13} />
          </button>
          <button
            className="icon-btn"
            onClick={() => deleteLayer(activeLayerId)}
            title="Delete Selected Layer"
          >
            <Trash2 size={13} />
          </button>
          <div className="tb-sep" />
          <button
            className="icon-btn"
            onClick={insertFrameAfterCurrent}
            title="Inserir novo frame à frente (empurra os seguintes)"
          >
            <Plus size={13} />
            <span>+ Frame</span>
          </button>
          <button className="icon-btn" onClick={duplicateFrameToNext} title="Duplicate Frame to Next (F6)">
            <CopyPlus size={13} />
            <span>Dup Frame</span>
          </button>
          <button className="icon-btn" onClick={clearCurrentFrame} title="Clear Current Frame">
            <Eraser size={13} />
          </button>
        </div>

        {/* Center: Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" onClick={prevFrame} title="Previous Frame (,)">
            <SkipBack size={13} />
          </button>
          <button
            className={`icon-btn ${isPlaying ? 'active' : ''}`}
            onClick={togglePlay}
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button className="icon-btn" onClick={nextFrame} title="Next Frame (.)">
            <SkipForward size={13} />
          </button>
          <button
            className={`icon-btn ${loopPlayback ? 'active' : ''}`}
            onClick={toggleLoop}
            title="Loop Playback"
          >
            <Repeat size={13} />
          </button>
        </div>

        {/* Right: Blend Mode + Multi-Layer Opacity + Play Range (In/Out) + Total Frames + FPS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
          {activeLayer && (
            <>
              <select
                value={activeLayer.blendMode || 'source-over'}
                onChange={(e) =>
                  setLayerBlendMode(activeLayer.id, e.target.value as GlobalCompositeOperation)
                }
                className="harmony-input"
                title="Modo de Mesclagem da Layer (Blend Mode)"
                style={{ width: 92, padding: '2px 4px' }}
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

              <label
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                title={`Opacidade (${selectedLayerIds.length > 1 ? `${selectedLayerIds.length} layers selecionadas` : activeLayer.name})`}
              >
                Opac{selectedLayerIds.length > 1 ? ` (${selectedLayerIds.length})` : ''}:
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(activeLayer.opacity * 100)}
                  onChange={(e) => setSelectedLayersOpacity(Number(e.target.value) / 100)}
                  style={{ width: 60, accentColor: '#3a86ff' }}
                />
                <span style={{ width: 28, color: '#bbb' }}>{Math.round(activeLayer.opacity * 100)}%</span>
              </label>
            </>
          )}
          <div className="tb-sep" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Playback Start Frame">
            In:
            <input
              type="number"
              min={1}
              max={totalFrames}
              value={playStart}
              onChange={(e) => setPlayRange(Number(e.target.value), playEnd)}
              className="harmony-input"
              style={{ width: 42 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Playback End Frame">
            Out:
            <input
              type="number"
              min={playStart}
              max={totalFrames}
              value={playEnd}
              onChange={(e) => setPlayRange(playStart, Number(e.target.value))}
              className="harmony-input"
              style={{ width: 42 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Total Frames">
            Total:
            <input
              type="number"
              min={1}
              max={1000}
              value={totalFrames}
              onChange={(e) => setTotalFrames(Number(e.target.value))}
              className="harmony-input"
              style={{ width: 46 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            FPS:
            <input
              type="number"
              min={1}
              max={60}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="harmony-input"
              style={{ width: 42 }}
            />
          </label>
        </div>
      </div>

      {/* Timeline Body: Left Layer List + Right Frame Grid */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Layer Names Column */}
        <div
          style={{
            width: 220,
            borderRight: '1px solid #181818',
            background: '#262626',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}
        >
          {/* Ruler Header Spacer */}
          <div
            style={{
              height: 24,
              background: '#2c2c2c',
              borderBottom: '1px solid #181818',
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 10.5,
              color: '#888'
            }}
          >
            Layers ({layers.length})
          </div>

          {layers.map((layer, index) => {
            const isActive = layer.id === activeLayerId;
            const isSelected = selectedLayerIds.includes(layer.id);
            return (
              <div
                key={layer.id}
                draggable
                onDragStart={() => setDragLayerIdx(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragLayerIdx !== null && dragLayerIdx !== index) {
                    reorderLayer(dragLayerIdx, index);
                  }
                  setDragLayerIdx(null);
                }}
                onDragEnd={() => setDragLayerIdx(null)}
                onClick={(e) => toggleSelectLayer(layer.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                title="Arraste para reordenar • Ctrl+Clique para selecionar várias layers"
                style={{
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  gap: 6,
                  background: isActive ? '#2d4b75' : isSelected ? '#263b59' : 'transparent',
                  borderBottom: '1px solid #1f1f1f',
                  cursor: 'grab'
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayerVisibility(layer.id);
                  }}
                  style={{ background: 'none', border: 'none', color: layer.visible ? '#ddd' : '#555', cursor: 'pointer' }}
                  title="Toggle Visibility"
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayerLock(layer.id);
                  }}
                  style={{ background: 'none', border: 'none', color: layer.locked ? '#f59e0b' : '#666', cursor: 'pointer' }}
                  title="Toggle Lock"
                >
                  {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
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
                  title={layer.holdFrames ? 'Hold Exposure ON (appears on all frames)' : 'Hold Exposure OFF (per-frame only)'}
                >
                  <Pin size={12} />
                </button>
                <span
                  style={{
                    width: 8,
                    height: 8,
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
                      fontSize: 11.5,
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
            );
          })}
        </div>

        {/* Frames Grid */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative', background: '#212121' }}>
          {/* Frame Ruler */}
          <div
            style={{
              display: 'flex',
              height: 24,
              background: '#2c2c2c',
              borderBottom: '1px solid #181818',
              position: 'sticky',
              top: 0,
              zIndex: 5,
              width: totalFrames * 22
            }}
          >
            {framesArray.map((f) => {
              const isCurr = f === currentFrame;
              const inPlayRange = f >= playStart && f <= playEnd;
              return (
                <div
                  key={f}
                  onClick={() => setCurrentFrame(f)}
                  style={{
                    width: 22,
                    height: 24,
                    borderRight: '1px solid #383838',
                    borderTop: inPlayRange ? '2px solid #3a86ff' : '2px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    cursor: 'pointer',
                    background: isCurr ? '#e53935' : f % 5 === 0 ? '#343434' : 'transparent',
                    color: isCurr ? '#fff' : f % 5 === 0 ? '#ddd' : '#777',
                    fontWeight: isCurr || f % 5 === 0 ? 700 : 400
                  }}
                >
                  {f % 5 === 0 || f === 1 || isCurr ? f : '·'}
                </div>
              );
            })}
          </div>

          {/* Layer Frame Rows */}
          {layers.map((layer) => (
            <div
              key={`row-${layer.id}`}
              style={{
                display: 'flex',
                height: 26,
                borderBottom: '1px solid #1a1a1a',
                width: totalFrames * 22
              }}
            >
              {framesArray.map((f) => {
                const hasDirectDrawing = (layer.frames[f]?.length || 0) > 0;
                const isExplicitBlank = !hasDirectDrawing && layer.frames[f] !== undefined;
                const hasHeldDrawing = !hasDirectDrawing && !isExplicitBlank && getEffectiveFrameStrokes(layer, f).length > 0;
                const isCurr = f === currentFrame;
                return (
                  <div
                    key={f}
                    onClick={() => {
                      setActiveLayer(layer.id);
                      setCurrentFrame(f);
                    }}
                    style={{
                      width: 22,
                      height: 26,
                      borderRight: '1px solid #2c2c2c',
                      position: 'relative',
                      background: isCurr
                        ? 'rgba(229, 57, 53, 0.22)'
                        : hasDirectDrawing
                        ? '#3e4d63'
                        : isExplicitBlank
                        ? '#303845'
                        : hasHeldDrawing
                        ? 'rgba(16, 185, 129, 0.18)'
                        : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    {isExplicitBlank && (
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          border: '1.5px solid #93c5fd'
                        }}
                      />
                    )}
                    {hasDirectDrawing && (
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: '#93c5fd'
                        }}
                      />
                    )}
                    {layer.keyframes?.[f] && (
                      <div
                        title="Motion Keyframe"
                        style={{
                          width: 7,
                          height: 7,
                          background: '#f59e0b',
                          transform: 'rotate(45deg)',
                          position: 'absolute'
                        }}
                      />
                    )}
                    {hasHeldDrawing && (
                      <div
                        style={{
                          width: '100%',
                          height: 2,
                          background: 'rgba(16, 185, 129, 0.55)'
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Audio Track & Waveform Bar (when an audio file is imported) */}
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
          <div style={{ width: 204, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#93c5fd' }}>
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
    </div>
  );
};
