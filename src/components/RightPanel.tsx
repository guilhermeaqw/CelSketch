import React, { useEffect, useState } from 'react';
import { Plus, Video, Eye, EyeOff, RotateCcw, Trash2, Sparkles, Grid } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { BrushPresetId, KeyframeEasing } from '../types/harmony';
import { CAMERA_EFFECT_PRESETS, getInterpolatedCamera } from '../utils/cameraUtils';
import { BrushGalleryTab } from './rightpanel/BrushGalleryTab';
import { ColorPanelTab } from './rightpanel/ColorPanelTab';

export const RightPanel: React.FC = () => {
  const [showEffectPicker, setShowEffectPicker] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>(['Segoe UI', 'Arial', 'Georgia', 'Impact', 'Times New Roman', 'Verdana']);
  const [fontFilter, setFontFilter] = useState('');

  useEffect(() => {
    window.harmonyAPI?.listFonts?.().then((fonts) => {
      if (Array.isArray(fonts) && fonts.length > 0) setSystemFonts(fonts);
    }).catch(() => {});
  }, []);

  const {
    rightTab,
    activeTool,
    activeBrushPreset,
    activeColor,
    secondaryColor,
    brushSize,
    brushMinSize,
    usePressure,
    brushOpacity,
    eraserSize,
    eraserMinSize,
    eraserOpacity,
    eraserPreset,
    textFontFamily,
    textFontSize,
    textBold,
    textItalic,
    shapeFilled,
    gradientMode,
    gradientToTransparent,
    bucketReference,
    bucketTolerance,
    bucketExpand,
    bucketCloseGap,
    bucketBehind,
    liquifyMode,
    liquifySize,
    liquifyStrength,
    recentColors,
    hasActiveSelection,
    activeSelectionInverted,
    layers,
    activeLayerId,
    currentFrame,
    cameraViewMode,
    cameraGuides
  } = useHarmonyStore(
    useShallow((s) => ({
      rightTab: s.rightTab,
      activeTool: s.activeTool,
      activeBrushPreset: s.activeBrushPreset,
      activeColor: s.activeColor,
      secondaryColor: s.secondaryColor,
      brushSize: s.brushSize,
      brushMinSize: s.brushMinSize,
      usePressure: s.usePressure,
      brushOpacity: s.brushOpacity,
      eraserSize: s.eraserSize,
      eraserMinSize: s.eraserMinSize,
      eraserOpacity: s.eraserOpacity,
      eraserPreset: s.eraserPreset,
      textFontFamily: s.textFontFamily,
      textFontSize: s.textFontSize,
      textBold: s.textBold,
      textItalic: s.textItalic,
      shapeFilled: s.shapeFilled,
      gradientMode: s.gradientMode,
      gradientToTransparent: s.gradientToTransparent,
      bucketReference: s.bucketReference,
      bucketTolerance: s.bucketTolerance,
      bucketExpand: s.bucketExpand,
      bucketCloseGap: s.bucketCloseGap,
      bucketBehind: s.bucketBehind,
      liquifyMode: s.liquifyMode,
      liquifySize: s.liquifySize,
      liquifyStrength: s.liquifyStrength,
      recentColors: s.recentColors,
      hasActiveSelection: Boolean(s.activeSelectionPoly && s.activeSelectionPoly.length >= 3),
      activeSelectionInverted: s.activeSelectionInverted,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      // Only re-render RightPanel on frame change when paused on a Camera layer (ZERO re-renders during Play!)
      currentFrame:
        !s.isPlaying && s.layers.find((l) => l.id === s.activeLayerId)?.type === 'camera'
          ? s.currentFrame
          : 0,
      cameraViewMode: s.cameraViewMode,
      cameraGuides: s.cameraGuides
    }))
  );

  const activeLayerObj = layers.find((l) => l.id === activeLayerId);
  const isCameraLayerActive = activeLayerObj?.type === 'camera';
  // Read base keyframe values (without procedural effect offsets) so sliders edit clean keyframes!
  const activeCamera = isCameraLayerActive ? getInterpolatedCamera(activeLayerObj, currentFrame, false) : null;

  const {
    setRightTab,
    selectBrushPreset,
    setActiveColor,
    swapColors,
    pushRecentColor,
    setBrushSize,
    setBrushMinSize,
    setUsePressure,
    setBrushOpacity,
    setEraserSize,
    setEraserMinSize,
    setEraserOpacity,
    setEraserPreset,
    setTextFontFamily,
    setTextFontSize,
    setTextBold,
    setTextItalic,
    setShapeFilled,
    setGradientMode,
    setGradientToTransparent,
    setBucketReference,
    setBucketTolerance,
    setBucketExpand,
    setBucketCloseGap,
    setBucketBehind,
    setLiquifyMode,
    setLiquifySize,
    setLiquifyStrength,
    requestInvertSelection,
    toggleCameraViewMode,
    toggleCameraGuides,
    setCameraKeyframe,
    deleteCameraKeyframe,
    addCameraEffect,
    updateCameraEffect,
    removeCameraEffect,
    toggleCameraEffect
  } = useHarmonyStore.getState();

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
        <ColorPanelTab
          activeColor={activeColor}
          secondaryColor={secondaryColor}
          recentColors={recentColors}
          onChangeColor={setActiveColor}
          onPushRecentColor={pushRecentColor}
          onSwapColors={swapColors}
        />
      )}

      {/* TOOL PROPERTIES TAB (Contextual & Clean) */}
      {rightTab === 'properties' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isCameraLayerActive && activeLayerObj && activeCamera ? (
            <div className="prop-group" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                  <Video size={14} />
                  <span>Câmera 2D ({activeLayerObj.name})</span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: activeCamera.hasKeyframeAtFrame ? 'rgba(56,189,248,0.2)' : '#252525',
                    border: `1px solid ${activeCamera.hasKeyframeAtFrame ? '#38bdf8' : '#3d3d3d'}`,
                    color: activeCamera.hasKeyframeAtFrame ? '#7dd3fc' : '#9ca3af',
                    fontWeight: 600
                  }}
                >
                  {activeCamera.hasKeyframeAtFrame ? `◆ Key Q${currentFrame}` : `Interp. Q${currentFrame}`}
                </span>
              </div>

              {/* Camera View + Safe Guides */}
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  onClick={toggleCameraViewMode}
                  className={`icon-btn ${cameraViewMode ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    gap: 5,
                    background: cameraViewMode ? '#0284c7' : '#262930',
                    borderColor: cameraViewMode ? '#38bdf8' : '#3d4048',
                    color: cameraViewMode ? '#fff' : '#d1d5db'
                  }}
                  title="Ver exatamente o enquadramento que sairá na exportação"
                >
                  {cameraViewMode ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{cameraViewMode ? 'Sair da Câmera' : 'Ver pela Câmera'}</span>
                </button>
                <button
                  onClick={toggleCameraGuides}
                  className={`icon-btn ${cameraGuides ? 'active' : ''}`}
                  style={{ gap: 4, padding: '4px 8px' }}
                  title="Regra dos Terços + Margens Safe"
                >
                  <Grid size={12} />
                  <span>Guias</span>
                </button>
              </div>

              {/* Keyframe quick actions */}
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  className="icon-btn active"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}
                  onClick={() => setCameraKeyframe(activeLayerObj.id, currentFrame, {})}
                  title="Fixar Keyframe da Câmera no quadro atual"
                >
                  ◆ + Keyframe
                </button>
                <button
                  className="icon-btn"
                  disabled={!activeCamera.hasKeyframeAtFrame}
                  style={{ opacity: activeCamera.hasKeyframeAtFrame ? 1 : 0.45, padding: '4px 8px' }}
                  onClick={() => deleteCameraKeyframe(activeLayerObj.id, currentFrame)}
                  title="Remover Keyframe do quadro atual"
                >
                  <Trash2 size={12} />
                </button>
                <button
                  className="icon-btn"
                  style={{ padding: '4px 8px' }}
                  onClick={() =>
                    setCameraKeyframe(activeLayerObj.id, currentFrame, { x: 0, y: 0, zoom: 1, rotation: 0 })
                  }
                  title="Resetar Câmera para o centro (1.0x, 0°)"
                >
                  <RotateCcw size={12} />
                </button>
              </div>

              {/* Zoom */}
              <div>
                <div className="prop-label">
                  <span>Zoom</span>
                  <span style={{ fontFamily: 'monospace', color: '#7dd3fc' }}>{activeCamera.zoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={500}
                  step={1}
                  value={Math.round(activeCamera.zoom * 100)}
                  onChange={(e) =>
                    setCameraKeyframe(activeLayerObj.id, currentFrame, { zoom: Number(e.target.value) / 100 }, false)
                  }
                  onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  className="harmony-slider"
                />
              </div>

              {/* Position X / Y */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#bbb' }}>
                  <span>Posição X (px)</span>
                  <input
                    type="number"
                    value={Math.round(activeCamera.x)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) setCameraKeyframe(activeLayerObj.id, currentFrame, { x: n });
                    }}
                    className="harmony-input"
                    style={{ width: '100%', height: 24, fontSize: 11 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#bbb' }}>
                  <span>Posição Y (px)</span>
                  <input
                    type="number"
                    value={Math.round(activeCamera.y)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) setCameraKeyframe(activeLayerObj.id, currentFrame, { y: n });
                    }}
                    className="harmony-input"
                    style={{ width: '100%', height: 24, fontSize: 11 }}
                  />
                </label>
              </div>

              {/* Rotation */}
              <div>
                <div className="prop-label">
                  <span>Rotação</span>
                  <span style={{ fontFamily: 'monospace', color: '#7dd3fc' }}>{Math.round(activeCamera.rotation)}°</span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={Math.round(activeCamera.rotation)}
                  onChange={(e) =>
                    setCameraKeyframe(activeLayerObj.id, currentFrame, { rotation: Number(e.target.value) }, false)
                  }
                  onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  className="harmony-slider"
                />
              </div>

              {/* Interpolation / Easing */}
              <div>
                <div className="prop-label" style={{ marginBottom: 4 }}>
                  <span>Curva de Movimento (Easing)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {(
                    [
                      ['ease-in-out', 'Suave'],
                      ['linear', 'Linear'],
                      ['ease-in', 'Acelerar'],
                      ['ease-out', 'Frear'],
                      ['hold', 'Corte']
                    ] as [KeyframeEasing, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setCameraKeyframe(activeLayerObj.id, currentFrame, { easing: id })}
                      className={`icon-btn ${activeCamera.easing === id ? 'active' : ''}`}
                      style={{ justifyContent: 'center', fontSize: 10.5, padding: '4px 4px' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Non-Destructive Camera Effects Stack + Preset Picker */}
              <div
                style={{
                  marginTop: 4,
                  padding: 9,
                  borderRadius: 8,
                  background: '#1a1d23',
                  border: '1px solid #323642',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#fbbf24' }}>
                    <Sparkles size={13} />
                    <span>Efeitos de Câmera</span>
                  </div>
                  <button
                    className={`icon-btn ${showEffectPicker ? 'active' : ''}`}
                    onClick={() => setShowEffectPicker((v) => !v)}
                    style={{
                      padding: '3px 8px',
                      fontSize: 10.5,
                      fontWeight: 600,
                      gap: 4,
                      background: showEffectPicker ? '#2563eb' : 'rgba(245, 158, 11, 0.16)',
                      borderColor: showEffectPicker ? '#3b82f6' : '#d97706',
                      color: showEffectPicker ? '#fff' : '#fde68a'
                    }}
                  >
                    <Plus size={11} />
                    <span>{showEffectPicker ? 'Fechar' : 'Efeitos'}</span>
                  </button>
                </div>

                {/* Preset Catalog Grid */}
                {showEffectPicker && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: 6,
                      borderRadius: 6,
                      background: '#13151a',
                      border: '1px solid #2b2f3a'
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>
                      Clique para adicionar a partir do Q{currentFrame} (não-destrutivo):
                    </div>
                    {CAMERA_EFFECT_PRESETS.map((preset) => (
                      <button
                        key={preset.type}
                        onClick={() => {
                          addCameraEffect(activeLayerObj.id, preset.type, currentFrame);
                          setShowEffectPicker(false);
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: 2,
                          padding: '6px 8px',
                          borderRadius: 5,
                          background: '#1d2028',
                          border: '1px solid #2e3340',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: preset.color,
                              flexShrink: 0
                            }}
                          />
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#f3f4f6' }}>{preset.label}</span>
                        </div>
                        <span style={{ fontSize: 10, color: '#9ca3af', paddingLeft: 14 }}>{preset.shortDesc}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Active Effects Stack */}
                {(!activeLayerObj.cameraEffects || activeLayerObj.cameraEffects.length === 0) ? (
                  <div style={{ fontSize: 10.5, color: '#7c8290', lineHeight: 1.4 }}>
                    Nenhum efeito ativo. Clique em <strong>+ Efeitos</strong> para adicionar Shake de Impacto, Vento Leve, Câmera na Mão, Terremoto, Zoom de Impacto, Pulso ou Flutuar!
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {activeLayerObj.cameraEffects.map((fx) => {
                      const meta = CAMERA_EFFECT_PRESETS.find((p) => p.type === fx.type);
                      const accent = meta?.color || '#38bdf8';
                      return (
                        <div
                          key={fx.id}
                          style={{
                            padding: 7,
                            borderRadius: 6,
                            background: fx.enabled ? '#222630' : '#181a20',
                            border: `1px solid ${fx.enabled ? '#393f4f' : '#282b33'}`,
                            opacity: fx.enabled ? 1 : 0.6,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: '#f3f4f6',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {fx.name}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                              <span style={{ fontSize: 9.5, color: '#9ca3af', fontFamily: 'monospace' }}>
                                {fx.wholeScene ? 'Cena toda' : `Q${fx.startFrame}→${fx.startFrame + fx.duration}`}
                              </span>
                              <button
                                className="icon-btn"
                                onClick={() => toggleCameraEffect(activeLayerObj.id, fx.id)}
                                title={fx.enabled ? 'Desativar efeito' : 'Ativar efeito'}
                                style={{ padding: '2px 4px', height: 20 }}
                              >
                                {fx.enabled ? <Eye size={11} /> : <EyeOff size={11} />}
                              </button>
                              <button
                                className="icon-btn"
                                onClick={() => removeCameraEffect(activeLayerObj.id, fx.id)}
                                title="Remover efeito"
                                style={{ padding: '2px 4px', height: 20, color: '#fca5a5' }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>

                          {/* Intensity */}
                          <div>
                            <div className="prop-label" style={{ fontSize: 10 }}>
                              <span>Intensidade</span>
                              <span>{Math.round(fx.intensity)}%</span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={100}
                              value={Math.round(fx.intensity)}
                              onChange={(e) =>
                                updateCameraEffect(activeLayerObj.id, fx.id, { intensity: Number(e.target.value) })
                              }
                              onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                              className="harmony-slider"
                            />
                          </div>

                          {/* Speed */}
                          <div>
                            <div className="prop-label" style={{ fontSize: 10 }}>
                              <span>Velocidade</span>
                              <span>{fx.speed.toFixed(2)}x</span>
                            </div>
                            <input
                              type="range"
                              min={25}
                              max={300}
                              step={5}
                              value={Math.round(fx.speed * 100)}
                              onChange={(e) =>
                                updateCameraEffect(activeLayerObj.id, fx.id, { speed: Number(e.target.value) / 100 })
                              }
                              onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                              className="harmony-slider"
                            />
                          </div>

                          {/* Whole Scene vs Frame Range */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10.5 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#d1d5db' }}>
                              <input
                                type="checkbox"
                                checked={Boolean(fx.wholeScene)}
                                onChange={(e) =>
                                  updateCameraEffect(activeLayerObj.id, fx.id, { wholeScene: e.target.checked }, true)
                                }
                              />
                              <span>Cena toda</span>
                            </label>
                            {!fx.wholeScene && (
                              <button
                                className="icon-btn"
                                onClick={() =>
                                  updateCameraEffect(activeLayerObj.id, fx.id, { startFrame: currentFrame }, true)
                                }
                                style={{ fontSize: 9.5, padding: '1px 6px', height: 19 }}
                                title="Mover início deste efeito para o quadro atual"
                              >
                                Iniciar no Q{currentFrame}
                              </button>
                            )}
                          </div>

                          {!fx.wholeScene && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#9ca3af' }}>
                                <span>Início (Q)</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={fx.startFrame}
                                  onChange={(e) => {
                                    const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                                    updateCameraEffect(activeLayerObj.id, fx.id, { startFrame: n });
                                  }}
                                  className="harmony-input"
                                  style={{ width: '100%', height: 22, fontSize: 10.5 }}
                                />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#9ca3af' }}>
                                <span>Duração (Q)</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={500}
                                  value={fx.duration}
                                  onChange={(e) => {
                                    const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                                    updateCameraEffect(activeLayerObj.id, fx.id, { duration: n });
                                  }}
                                  className="harmony-input"
                                  style={{ width: '100%', height: 22, fontSize: 10.5 }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 10.5, color: '#8b92a1', lineHeight: 1.45 }}>
                Dica: arraste direto no canvas para mover a câmera, puxe os cantos para dar Zoom e a bolinha do topo para girar (Shift trava eixo/15°). Tudo já sai automaticamente na exportação!
              </div>
            </div>
          ) : activeTool === 'gradient' ? (
            <div className="prop-group" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#eee' }}>Degradê (Gradiente)</div>

              <div>
                <div className="prop-label">
                  <span>Tipo</span>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    onClick={() => setGradientMode('linear')}
                    className={`icon-btn ${gradientMode === 'linear' ? 'active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Linear
                  </button>
                  <button
                    onClick={() => setGradientMode('radial')}
                    className={`icon-btn ${gradientMode === 'radial' ? 'active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Radial
                  </button>
                </div>
              </div>

              <div>
                <div className="prop-label">
                  <span>Estilo de Cor</span>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    onClick={() => setGradientToTransparent(true)}
                    className={`icon-btn ${gradientToTransparent ? 'active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 10.5 }}
                  >
                    Cor → Transp.
                  </button>
                  <button
                    onClick={() => setGradientToTransparent(false)}
                    className={`icon-btn ${!gradientToTransparent ? 'active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 10.5 }}
                  >
                    Cor 1 → Cor 2
                  </button>
                </div>
              </div>

              {/* Live Gradient Preview Swatch */}
              <div
                style={{
                  height: 22,
                  borderRadius: 5,
                  border: '1px solid #444',
                  background: gradientToTransparent
                    ? `linear-gradient(to right, ${activeColor}, transparent), repeating-conic-gradient(#444 0% 25%, #2a2a2a 0% 50%) 50% / 10px 10px`
                    : `linear-gradient(to right, ${activeColor}, ${secondaryColor})`
                }}
              />

              <div>
                <div className="prop-label">
                  <span>Opacidade</span>
                  <span>{Math.round(brushOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round(brushOpacity * 100)}
                  onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                  onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  className="harmony-slider"
                />
              </div>

              <div style={{ fontSize: 10.5, color: '#8b92a1', lineHeight: 1.45 }}>
                Arraste no canvas para aplicar o degradê (Shift trava em 45°). Respeita Seleção Ativa e Alpha Lock!
              </div>
            </div>
          ) : activeTool === 'paint' || activeTool === 'magicwand' ? (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8 }}>
                {activeTool === 'magicwand' ? 'Varinha Mágica (W)' : 'Balde de Tinta (G)'}
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
                <span>{activeTool === 'magicwand' ? 'Expandir Seleção' : 'Expandir Borda'}</span>
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

              {activeTool === 'paint' ? (
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
              ) : (
                <>
                  <button
                    className={`icon-btn ${hasActiveSelection ? 'active' : ''}`}
                    disabled={!hasActiveSelection}
                    onClick={() => requestInvertSelection()}
                    style={{ width: '100%', justifyContent: 'center', marginTop: 10, height: 26, fontWeight: 600 }}
                    title="Inverter a área selecionada (Ctrl+Shift+I)"
                  >
                    ⇄ Inverter Seleção (Ctrl+Shift+I){activeSelectionInverted ? ' • Invertida' : ''}
                  </button>
                  <div style={{ marginTop: 8, fontSize: 10.5, color: '#9ca3af', lineHeight: 1.45 }}>
                    Dicas: <b>Ctrl+Shift+I</b> inverte • <b>Alt+Backspace</b> preenche • <b>Delete</b> apaga • <b>Ctrl+D</b> limpa
                  </div>
                </>
              )}
            </div>
          ) : activeTool === 'liquify' ? (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8 }}>
                Liquify / Deformar (J)
              </div>

              <div className="prop-label">
                <span>Modo</span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                <button
                  onClick={() => setLiquifyMode('push')}
                  className={`icon-btn ${liquifyMode === 'push' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Empurrar
                </button>
                <button
                  onClick={() => setLiquifyMode('expand')}
                  className={`icon-btn ${liquifyMode === 'expand' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Inflar
                </button>
                <button
                  onClick={() => setLiquifyMode('pinch')}
                  className={`icon-btn ${liquifyMode === 'pinch' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Comprimir
                </button>
              </div>

              <div className="prop-label">
                <span>Tamanho da Área</span>
                <span>{liquifySize} px</span>
              </div>
              <input
                type="range"
                min={20}
                max={300}
                value={liquifySize}
                onChange={(e) => setLiquifySize(Number(e.target.value))}
                className="harmony-slider"
              />

              <div className="prop-label" style={{ marginTop: 8 }}>
                <span>Força</span>
                <span>{liquifyStrength}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={liquifyStrength}
                onChange={(e) => setLiquifyStrength(Number(e.target.value))}
                className="harmony-slider"
              />
            </div>
          ) : activeTool === 'eraser' ? (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8 }}>
                Borracha Independente (E)
              </div>

              <div className="prop-label">
                <span>Ponta da Borracha</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {(
                  [
                    { id: 'sai_pen', label: 'Dura' },
                    { id: 'sai_airbrush', label: 'Suave' },
                    { id: 'csp_line', label: 'Line' },
                    { id: 'csp_sketch', label: 'Sketch' },
                    { id: 'sai_binary', label: 'Binária' }
                  ] as { id: BrushPresetId; label: string }[]
                ).map((ep) => (
                  <button
                    key={ep.id}
                    onClick={() => setEraserPreset(ep.id)}
                    className={`icon-btn ${eraserPreset === ep.id ? 'active' : ''}`}
                    style={{ fontSize: 10.5, padding: '2px 7px' }}
                  >
                    {ep.label}
                  </button>
                ))}
              </div>

              <div className="prop-label">
                <span>Tamanho da Borracha</span>
                <span>{eraserSize} px</span>
              </div>
              <input
                type="range"
                min={1}
                max={300}
                value={eraserSize}
                onChange={(e) => setEraserSize(Number(e.target.value))}
                onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                className="harmony-slider"
              />

              <div className="prop-label" style={{ marginTop: 8 }}>
                <span>Opacidade</span>
                <span>{Math.round(eraserOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(eraserOpacity * 100)}
                onChange={(e) => setEraserOpacity(Number(e.target.value) / 100)}
                onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                className="harmony-slider"
              />

              <div className="prop-label" style={{ marginTop: 8 }}>
                <span>Tamanho Mínimo (Pressão)</span>
                <span>{eraserMinSize}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={eraserMinSize}
                onChange={(e) => setEraserMinSize(Number(e.target.value))}
                onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                className="harmony-slider"
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#bbb' }}>Pressão da Caneta</span>
                <input
                  type="checkbox"
                  checked={usePressure}
                  onChange={(e) => {
                    setUsePressure(e.target.checked);
                    e.currentTarget.blur();
                  }}
                />
              </div>
            </div>
          ) : activeTool === 'text' ? (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8 }}>
                Texto — Fontes do PC ({systemFonts.length})
              </div>

              <input
                type="text"
                placeholder="Buscar fonte instalada..."
                value={fontFilter}
                onChange={(e) => setFontFilter(e.target.value)}
                className="harmony-input"
                style={{ width: '100%', marginBottom: 6, height: 24, fontSize: 11 }}
              />

              <select
                value={textFontFamily}
                onChange={(e) => setTextFontFamily(e.target.value)}
                className="harmony-input"
                size={6}
                style={{ width: '100%', fontSize: 11.5, marginBottom: 10, padding: 2 }}
              >
                {systemFonts
                  .filter((f) => !fontFilter.trim() || f.toLowerCase().includes(fontFilter.trim().toLowerCase()))
                  .map((font) => (
                    <option key={font} value={font} style={{ fontFamily: `"${font}", sans-serif` }}>
                      {font}
                    </option>
                  ))}
              </select>

              <div className="prop-label">
                <span>Tamanho da Fonte</span>
                <span>{textFontSize} px</span>
              </div>
              <input
                type="range"
                min={10}
                max={200}
                value={textFontSize}
                onChange={(e) => setTextFontSize(Number(e.target.value))}
                className="harmony-slider"
              />

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button
                  onClick={() => setTextBold(!textBold)}
                  className={`icon-btn ${textBold ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', fontWeight: 800 }}
                >
                  Negrito
                </button>
                <button
                  onClick={() => setTextItalic(!textItalic)}
                  className={`icon-btn ${textItalic ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', fontStyle: 'italic' }}
                >
                  Itálico
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 10.5, color: '#9ca3af' }}>
                Clique na tela para digitar • <b>Enter</b> aplica • <b>Shift+Enter</b> nova linha
              </div>
            </div>
          ) : activeTool === 'lasso' ||
            activeTool === 'polylasso' ||
            activeTool === 'rectselect' ||
            activeTool === 'ellipseselect' ||
            activeTool === 'eyedropper' ||
            activeTool === 'hand' ||
            activeTool === 'zoom' ? (
            <div className="prop-group">
              <div style={{ fontSize: 11, fontWeight: 600, color: '#eee', marginBottom: 8, textTransform: 'uppercase' }}>
                {activeTool}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.55 }}>
                {activeTool === 'eyedropper'
                  ? 'Clique ou arraste na tela para capturar cores. Você também pode segurar Alt com qualquer pincel.'
                  : activeTool === 'hand'
                  ? 'Arraste para mover a tela (ou segure Espaço com qualquer ferramenta). Aperte 5 para centralizar.'
                  : activeTool === 'zoom'
                  ? 'Clique para aproximar ou Alt+Clique para afastar. A roda do mouse dá zoom direto no cursor.'
                  : 'Dicas da Seleção: Ctrl+Shift+I inverte • Ctrl+T transforma • Ctrl+U ajusta cor (HSV) • Delete apaga • Alt+Backspace preenche • Ctrl+D limpa.'}
              </div>
              {(activeTool === 'lasso' ||
                activeTool === 'polylasso' ||
                activeTool === 'rectselect' ||
                activeTool === 'ellipseselect') && (
                <button
                  className={`icon-btn ${hasActiveSelection ? 'active' : ''}`}
                  disabled={!hasActiveSelection}
                  onClick={() => requestInvertSelection()}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 10, height: 26, fontWeight: 600 }}
                  title="Inverter a área selecionada (Ctrl+Shift+I)"
                >
                  ⇄ Inverter Seleção (Ctrl+Shift+I){activeSelectionInverted ? ' • Invertida' : ''}
                </button>
              )}
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
                max={200}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
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
                onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
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
                    onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    className="harmony-slider"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: '#bbb' }}>Pressão da Caneta</span>
                    <input
                      type="checkbox"
                      checked={usePressure}
                      onChange={(e) => {
                        setUsePressure(e.target.checked);
                        e.currentTarget.blur();
                      }}
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
        </div>
      )}

      {/* BRUSH PRESETS TAB (Categorias: Padrão / Borrar) */}
      {rightTab === 'brushes' && (
        <BrushGalleryTab
          activeTool={activeTool}
          activeBrushPreset={activeBrushPreset}
          eraserPreset={eraserPreset}
          onSelectBrush={selectBrushPreset}
          onSelectEraser={setEraserPreset}
        />
      )}
    </div>
  );
};
