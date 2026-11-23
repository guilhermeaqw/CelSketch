import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { BrushPresetId, Stroke } from '../types/harmony';
import { ColorWheel } from './ColorWheel';
import { renderStroke } from '../utils/canvasRenderer';

const DEFAULT_BRUSHES: { id: BrushPresetId; label: string; previewSize: number; minRatio: number; opacity: number }[] = [
  { id: 'sai_pen', label: 'Pen', previewSize: 10, minRatio: 0.05, opacity: 1 },
  { id: 'sai_pencil', label: 'Pencil', previewSize: 9, minRatio: 0.18, opacity: 0.78 },
  { id: 'sai_airbrush', label: 'AirBrush', previewSize: 22, minRatio: 0.25, opacity: 0.4 },
  { id: 'sai_brush', label: 'Brush', previewSize: 15, minRatio: 0.15, opacity: 0.88 },
  { id: 'sai_water', label: 'Water', previewSize: 16, minRatio: 0.2, opacity: 0.52 },
  { id: 'sai_marker', label: 'Marker', previewSize: 14, minRatio: 0.65, opacity: 0.62 },
  { id: 'sai_inkpen', label: 'InkPen', previewSize: 14, minRatio: 0.03, opacity: 1 },
  { id: 'sai_binary', label: 'Binary', previewSize: 6, minRatio: 1, opacity: 1 }
];

const BLUR_BRUSHES: { id: BrushPresetId; label: string; previewSize: number; minRatio: number; opacity: number }[] = [
  { id: 'blur_soft', label: 'Blur Suave', previewSize: 24, minRatio: 0.3, opacity: 0.35 },
  { id: 'blur_smudge', label: 'Borrar / Misturar', previewSize: 20, minRatio: 0.2, opacity: 0.5 }
];

const BrushStrokeThumbnail: React.FC<{
  preset: BrushPresetId;
  size: number;
  minRatio: number;
  opacity: number;
}> = ({ preset, size, minRatio, opacity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Generate a classic S-curve with smooth pressure ramp (0.1 -> 1.0 -> 0.1)
    const points = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = 16 + t * (canvas.width - 32);
      const y = canvas.height / 2 + Math.sin(t * Math.PI * 2) * 10;
      const pressure = Math.sin(t * Math.PI);
      points.push({ x, y, pressure: Math.max(0.08, pressure) });
    }

    const demoStroke: Stroke = {
      id: `preview-${preset}`,
      tool: 'brush',
      preset,
      artLayer: 'LA',
      swatchId: 'preview',
      color: '#f0f0f0',
      size,
      minSizeRatio: minRatio,
      opacity,
      smoothing: 40,
      points
    };
    renderStroke(ctx, demoStroke);
  }, [preset, size, minRatio, opacity]);

  return <canvas ref={canvasRef} width={220} height={38} style={{ display: 'block', width: '100%', height: 38 }} />;
};

export const RightPanel: React.FC = () => {
  const [brushCategory, setBrushCategory] = useState<'padrao' | 'borrar'>('padrao');
  const {
    rightTab,
    setRightTab,
    activeTool,
    activeBrushPreset,
    activeColor,
    brushSize,
    brushMinSize,
    usePressure,
    brushOpacity,
    brushSmoothing,
    shapeFilled,
    bucketReference,
    bucketTolerance,
    bucketExpand,
    bucketBehind,
    onionPrev,
    onionNext,
    swatches,
    activeSwatchId,
    selectBrushPreset,
    setActiveColor,
    setBrushSize,
    setBrushMinSize,
    setUsePressure,
    setBrushOpacity,
    setBrushSmoothing,
    setShapeFilled,
    setBucketReference,
    setBucketTolerance,
    setBucketExpand,
    setBucketBehind,
    setOnionRange,
    setActiveSwatch,
    addSwatch
  } = useHarmonyStore();

  const handleAddSwatch = () => {
    addSwatch(`Colour_${swatches.length + 1}`, activeColor);
  };

  return (
    <div className="right-pane">
      {/* Harmony Right Panel Tabs */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${rightTab === 'colour' ? 'active' : ''}`}
          onClick={() => setRightTab('colour')}
        >
          Colour
        </button>
        <button
          className={`panel-tab ${rightTab === 'properties' ? 'active' : ''}`}
          onClick={() => setRightTab('properties')}
        >
          Tool Properties
        </button>
        <button
          className={`panel-tab ${rightTab === 'brushes' ? 'active' : ''}`}
          onClick={() => setRightTab('brushes')}
        >
          Brushes
        </button>
      </div>

      {/* COLOUR WHEEL TAB */}
      {rightTab === 'colour' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <ColorWheel
            hex={activeColor}
            onChange={(newHex) => setActiveColor(newHex)}
          />

          {/* Compact Quick Swatches Bar */}
          <div className="prop-group" style={{ borderTop: '1px solid #383838', borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, color: '#999' }}>Quick Swatches</span>
              <button className="icon-btn" onClick={handleAddSwatch} title="Save Current Colour">
                <Plus size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {swatches.map((sw) => {
                const selected = sw.id === activeSwatchId;
                return (
                  <button
                    key={sw.id}
                    onClick={() => setActiveSwatch(sw.id)}
                    title={`${sw.name} (${sw.hex})`}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 3,
                      background: sw.hex,
                      border: selected ? '2px solid #ffffff' : '1px solid #555',
                      cursor: 'pointer',
                      boxShadow: selected ? '0 0 0 1px #3a86ff' : 'none'
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TOOL PROPERTIES TAB */}
      {rightTab === 'properties' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTool === 'paint' && (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8, textTransform: 'uppercase' }}>
                Balde de Tinta (Paint Bucket)
              </div>

              <div className="prop-label">
                <span>Referência de Contorno</span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                <button
                  onClick={() => setBucketReference('all')}
                  className={`icon-btn ${bucketReference === 'all' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Todas as Layers
                </button>
                <button
                  onClick={() => setBucketReference('active')}
                  className={`icon-btn ${bucketReference === 'active' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Layer Ativa
                </button>
              </div>

              <div className="prop-label">
                <span>Tolerância</span>
                <span>{bucketTolerance}</span>
              </div>
              <input
                type="range"
                min={0}
                max={150}
                value={bucketTolerance}
                onChange={(e) => setBucketTolerance(Number(e.target.value))}
                className="harmony-slider"
              />

              <div className="prop-label" style={{ marginTop: 8 }}>
                <span>Expandir Borda (Anti-Halo)</span>
                <span>{bucketExpand} px</span>
              </div>
              <input
                type="range"
                min={0}
                max={4}
                value={bucketExpand}
                onChange={(e) => setBucketExpand(Number(e.target.value))}
                className="harmony-slider"
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#bbb' }}>Pintar Atrás do Traço</span>
                <input
                  type="checkbox"
                  checked={bucketBehind}
                  onChange={(e) => setBucketBehind(e.target.checked)}
                />
              </div>
            </div>
          )}

          <div className="prop-group">
            <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8, textTransform: 'uppercase' }}>
              Active Tool: {activeTool}
            </div>

            <div className="prop-label">
              <span>Maximum Size</span>
              <span>{brushSize} px</span>
            </div>
            <input
              type="range"
              min={1}
              max={120}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="harmony-slider"
            />

            <div className="prop-label" style={{ marginTop: 8 }}>
              <span>Minimum Size (Pressure)</span>
              <span>{brushMinSize}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={brushMinSize}
              onChange={(e) => setBrushMinSize(Number(e.target.value))}
              className="harmony-slider"
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: '#bbb' }}>Pen Pressure Sensitivity</span>
              <input
                type="checkbox"
                checked={usePressure}
                onChange={(e) => setUsePressure(e.target.checked)}
              />
            </div>
          </div>

          <div className="prop-group">
            <div className="prop-label">
              <span>Opacity</span>
              <span>{Math.round(brushOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(brushOpacity * 100)}
              onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
              className="harmony-slider"
            />
          </div>

          <div className="prop-group">
            <div className="prop-label">
              <span>Smoothness</span>
              <span>{brushSmoothing}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={brushSmoothing}
              onChange={(e) => setBrushSmoothing(Number(e.target.value))}
              className="harmony-slider"
            />
          </div>

          <div className="prop-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#bbb' }}>Auto-Fill Shapes</span>
            <input
              type="checkbox"
              checked={shapeFilled}
              onChange={(e) => setShapeFilled(e.target.checked)}
            />
          </div>

          <div className="prop-group">
            <div style={{ fontSize: 11, fontWeight: 600, color: '#ccc', marginBottom: 8 }}>
              Onion Skin Range
            </div>
            <div className="prop-label">
              <span>Previous Frames (Red)</span>
              <span>{onionPrev}</span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              value={onionPrev}
              onChange={(e) => setOnionRange(Number(e.target.value), onionNext)}
              className="harmony-slider"
            />
            <div className="prop-label" style={{ marginTop: 8 }}>
              <span>Next Frames (Green)</span>
              <span>{onionNext}</span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              value={onionNext}
              onChange={(e) => setOnionRange(onionPrev, Number(e.target.value))}
              className="harmony-slider"
            />
          </div>
        </div>
      )}

      {/* BRUSH PRESETS TAB (Categorias: Padrão / Borrar) */}
      {rightTab === 'brushes' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 4, padding: '8px 8px 4px 8px' }}>
            <button
              onClick={() => setBrushCategory('padrao')}
              className={`icon-btn ${brushCategory === 'padrao' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', height: 24 }}
            >
              Padrão
            </button>
            <button
              onClick={() => setBrushCategory('borrar')}
              className={`icon-btn ${brushCategory === 'borrar' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', height: 24 }}
            >
              Borrar
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(brushCategory === 'padrao' ? DEFAULT_BRUSHES : BLUR_BRUSHES).map((brush) => {
              const active = activeBrushPreset === brush.id;
              return (
                <button
                  key={brush.id}
                  onClick={() => selectBrushPreset(brush.id)}
                  title={brush.label}
                  style={{
                    padding: '2px 4px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: active ? '#284a7a' : '#202020',
                    border: `1.5px solid ${active ? '#5b93e6' : '#353535'}`,
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <BrushStrokeThumbnail
                    preset={brush.id}
                    size={brush.previewSize}
                    minRatio={brush.minRatio}
                    opacity={brush.opacity}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
