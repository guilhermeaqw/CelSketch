import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { BrushPresetId, Stroke } from '../types/harmony';
import { ColorWheel } from './ColorWheel';
import { renderStroke } from '../utils/canvasRenderer';

const DEFAULT_BRUSHES: { id: BrushPresetId; label: string; previewSize: number; minRatio: number; opacity: number }[] = [
  { id: 'csp_line', label: 'Line (Seu Brush)', previewSize: 13, minRatio: 0.05, opacity: 1 },
  { id: 'csp_sketch', label: 'Sketch (Seu Brush)', previewSize: 15, minRatio: 0.15, opacity: 0.85 },
  { id: 'sai_pen', label: 'G-Pen Lineart', previewSize: 10, minRatio: 0.04, opacity: 1 },
  { id: 'sai_inkpen', label: 'Nanquim Dinâmico', previewSize: 14, minRatio: 0.02, opacity: 1 },
  { id: 'sai_pencil', label: 'Lápis 2B', previewSize: 11, minRatio: 0.18, opacity: 0.88 },
  { id: 'sai_water', label: 'Aquarela', previewSize: 18, minRatio: 0.2, opacity: 0.72 },
  { id: 'sai_airbrush', label: 'Aerógrafo Suave', previewSize: 22, minRatio: 0.25, opacity: 0.75 },
  { id: 'sai_binary', label: 'Caneta Binária', previewSize: 5, minRatio: 1, opacity: 1 }
];

const BLUR_BRUSHES: { id: BrushPresetId; label: string; previewSize: number; minRatio: number; opacity: number }[] = [
  { id: 'blur_soft', label: 'Esfumar Suave', previewSize: 24, minRatio: 0.3, opacity: 0.7 },
  { id: 'blur_smudge', label: 'Borrar / Misturar', previewSize: 20, minRatio: 0.2, opacity: 0.8 }
];

const BrushStrokeThumbnail: React.FC<{
  preset: BrushPresetId;
  size: number;
  minRatio: number;
  opacity: number;
}> = ({ preset, size, minRatio, opacity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgTick, setImgTick] = useState(0);

  useEffect(() => {
    const onImgLoaded = () => setImgTick((t) => t + 1);
    window.addEventListener('celsketch:image-loaded', onImgLoaded);
    return () => window.removeEventListener('celsketch:image-loaded', onImgLoaded);
  }, []);

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
  }, [preset, size, minRatio, opacity, imgTick]);

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
    secondaryColor,
    brushSize,
    brushMinSize,
    usePressure,
    brushOpacity,
    brushSmoothing,
    shapeFilled,
    bucketReference,
    bucketTolerance,
    bucketExpand,
    bucketCloseGap,
    bucketBehind,
    onionPrev,
    onionNext,
    recentColors,
    selectBrushPreset,
    setActiveColor,
    swapColors,
    pushRecentColor,
    setBrushSize,
    setBrushMinSize,
    setUsePressure,
    setBrushOpacity,
    setBrushSmoothing,
    setShapeFilled,
    setBucketReference,
    setBucketTolerance,
    setBucketExpand,
    setBucketCloseGap,
    setBucketBehind,
    setOnionRange,
    layers,
    activeLayerId,
    currentFrame,
    toggleLayerClippingMask,
    setLayerEffects,
    setLayerKeyframe,
    deleteLayerKeyframe
  } = useHarmonyStore();

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const currentKf = activeLayer?.keyframes?.[currentFrame];

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

          {/* Primary / Secondary Color Swapper (X) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '4px 12px 10px 12px'
            }}
          >
            <div style={{ position: 'relative', width: 42, height: 34 }}>
              <div
                onClick={swapColors}
                title={`Cor Secundária (${secondaryColor.toUpperCase()}) — Clique ou aperte X para alternar`}
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 24,
                  height: 24,
                  borderRadius: 3,
                  background: secondaryColor,
                  border: '1.5px solid #666',
                  cursor: 'pointer'
                }}
              />
              <div
                title={`Cor Principal (${activeColor.toUpperCase()})`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 24,
                  height: 24,
                  borderRadius: 3,
                  background: activeColor,
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)'
                }}
              />
            </div>
            <button
              className="icon-btn"
              onClick={swapColors}
              title="Alternar Cor Principal e Secundária (X)"
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              ⇄ Alternar (X)
            </button>
          </div>

          {/* Cores Recentes */}
          <div className="prop-group" style={{ borderTop: '1px solid #383838', borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, color: '#999' }}>Cores Recentes</span>
              <button
                className="icon-btn"
                onClick={() => pushRecentColor(activeColor)}
                title="Adicionar cor atual às recentes"
              >
                <Plus size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {recentColors.map((hex, idx) => {
                const selected = hex.toLowerCase() === activeColor.toLowerCase();
                return (
                  <button
                    key={`${hex}-${idx}`}
                    onClick={() => setActiveColor(hex)}
                    title={hex.toUpperCase()}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 3,
                      background: hex,
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

      {/* TOOL PROPERTIES TAB (Contextual & Clean) */}
      {rightTab === 'properties' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTool === 'paint' ? (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8 }}>
                Balde de Tinta
              </div>

              <div className="prop-label">
                <span>Referência</span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                <button
                  onClick={() => setBucketReference('active')}
                  className={`icon-btn ${bucketReference === 'active' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Layer Ativa
                </button>
                <button
                  onClick={() => setBucketReference('all')}
                  className={`icon-btn ${bucketReference === 'all' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Todas
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
                <span>Fechar Lacunas (Close Gap)</span>
                <span>{bucketCloseGap === 0 ? 'Off' : `${bucketCloseGap} px`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                value={bucketCloseGap}
                onChange={(e) => setBucketCloseGap(Number(e.target.value))}
                className="harmony-slider"
              />

              <div className="prop-label" style={{ marginTop: 8 }}>
                <span>Expandir Borda</span>
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

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 10,
                  fontSize: 11,
                  color: '#bbb',
                  cursor: 'pointer'
                }}
              >
                <span>Pintar por Trás da Linha</span>
                <input
                  type="checkbox"
                  checked={bucketBehind}
                  onChange={(e) => setBucketBehind(e.target.checked)}
                />
              </label>
            </div>
          ) : (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8, textTransform: 'uppercase' }}>
                {activeTool}
              </div>

              <div className="prop-label">
                <span>Tamanho</span>
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
                <span>Opacidade</span>
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

              {(activeTool === 'brush' || activeTool === 'pencil') && (
                <>
                  <div className="prop-label" style={{ marginTop: 8 }}>
                    <span>Tamanho Mínimo (Pressão)</span>
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
                    <span style={{ fontSize: 11, color: '#bbb' }}>Pressão da Caneta</span>
                    <input
                      type="checkbox"
                      checked={usePressure}
                      onChange={(e) => setUsePressure(e.target.checked)}
                    />
                  </div>
                </>
              )}

              {(activeTool === 'rectangle' || activeTool === 'ellipse') && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: '#bbb' }}>Preencher Forma</span>
                  <input
                    type="checkbox"
                    checked={shapeFilled}
                    onChange={(e) => setShapeFilled(e.target.checked)}
                  />
                </div>
              )}
            </div>
          )}

          {activeLayer && (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#ccc', marginBottom: 6 }}>
                Layer: {activeLayer.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#bbb' }}>Clipping Mask</span>
                <input
                  type="checkbox"
                  checked={Boolean(activeLayer.clippingMask)}
                  onChange={() => toggleLayerClippingMask(activeLayer.id)}
                />
              </div>
              <div className="prop-label">
                <span>Blur</span>
                <span>{activeLayer.effects?.blur ?? 0} px</span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                value={activeLayer.effects?.blur ?? 0}
                onChange={(e) => setLayerEffects(activeLayer.id, { blur: Number(e.target.value) })}
                className="harmony-slider"
              />
              <div className="prop-label" style={{ marginTop: 6 }}>
                <span>Glow</span>
                <span>{activeLayer.effects?.glow ?? 0} px</span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                value={activeLayer.effects?.glow ?? 0}
                onChange={(e) => setLayerEffects(activeLayer.id, { glow: Number(e.target.value) })}
                className="harmony-slider"
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#bbb' }}>Drop Shadow</span>
                <input
                  type="checkbox"
                  checked={Boolean(activeLayer.effects?.dropShadow)}
                  onChange={(e) => setLayerEffects(activeLayer.id, { dropShadow: e.target.checked })}
                />
              </div>
            </div>
          )}
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
                    padding: '4px 6px 2px 6px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    background: active ? '#284a7a' : '#202020',
                    border: `1.5px solid ${active ? '#5b93e6' : '#353535'}`,
                    position: 'relative',
                    overflow: 'hidden',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 600, color: active ? '#e0f2fe' : '#a8a8a8', marginBottom: 1 }}>
                    {brush.label}
                  </div>
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
