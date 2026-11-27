import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Wind, X, Check, RotateCcw, Eye, EyeOff, Lock } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { getEffectiveFrameStrokes, renderStroke } from '../utils/canvasRenderer';
import {
  applyBlurToCanvas,
  BlurMode,
  DEFAULT_BLUR_SETTINGS,
  isNoopBlur,
  MotionDirection,
  RadialStyle
} from '../utils/blurUtils';
import { getSelectionBounds, traceSelectionPath } from '../utils/selectionUtils';

export const BlurModal: React.FC = () => {
  const {
    blurModalOpen,
    setBlurModalOpen,
    setBlurPreview,
    applyLayerBlur,
    layers,
    activeLayerId,
    currentFrame,
    canvasWidth,
    canvasHeight,
    activeSelectionPoly,
    activeSelectionPolys,
    activeSelectionInverted,
    addStrokesBatch
  } = useHarmonyStore(
    useShallow((s) => ({
      blurModalOpen: s.blurModalOpen,
      setBlurModalOpen: s.setBlurModalOpen,
      setBlurPreview: s.setBlurPreview,
      applyLayerBlur: s.applyLayerBlur,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      currentFrame: s.currentFrame,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      activeSelectionPoly: s.activeSelectionPoly,
      activeSelectionPolys: s.activeSelectionPolys,
      activeSelectionInverted: s.activeSelectionInverted,
      addStrokesBatch: s.addStrokesBatch
    }))
  );

  const [mode, setMode] = useState<BlurMode>(DEFAULT_BLUR_SETTINGS.mode);
  const [radius, setRadius] = useState<number>(DEFAULT_BLUR_SETTINGS.radius);
  const [angle, setAngle] = useState<number>(DEFAULT_BLUR_SETTINGS.angle);
  const [direction, setDirection] = useState<MotionDirection>(DEFAULT_BLUR_SETTINGS.direction);
  const [radialStyle, setRadialStyle] = useState<RadialStyle>(DEFAULT_BLUR_SETTINGS.radialStyle);
  const [centerX, setCenterX] = useState<number>(DEFAULT_BLUR_SETTINGS.centerX);
  const [centerY, setCenterY] = useState<number>(DEFAULT_BLUR_SETTINGS.centerY);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [allFrames, setAllFrames] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dialDragRef = useRef<boolean>(false);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isBlocked = !activeLayer || activeLayer.locked || activeLayer.type === 'folder' || activeLayer.type === 'camera';
  const hasSelection = Boolean(activeSelectionPoly && activeSelectionPoly.length >= 3 && !allFrames);
  const cfg = { mode, radius, angle, direction, radialStyle, centerX, centerY };
  const isNoop = isNoopBlur(cfg);

  useEffect(() => {
    if (blurModalOpen) {
      setPreviewEnabled(true);
      setAllFrames(false);
    } else {
      setBlurPreview(null);
    }
  }, [blurModalOpen, setBlurPreview]);

  useEffect(() => {
    if (!blurModalOpen) return;
    if (!previewEnabled || isBlocked || isNoop) {
      setBlurPreview(null);
    } else {
      setBlurPreview({ mode, radius, angle, direction, radialStyle, centerX, centerY, allFrames });
    }
  }, [blurModalOpen, mode, radius, angle, direction, radialStyle, centerX, centerY, allFrames, previewEnabled, isBlocked, isNoop, setBlurPreview]);

  const handleClose = useCallback(() => {
    setBlurPreview(null);
    setBlurModalOpen(false);
  }, [setBlurPreview, setBlurModalOpen]);

  const handleReset = useCallback(() => {
    setRadius(18);
    setAngle(0);
    setDirection('both');
    setRadialStyle('zoom');
    setCenterX(0.5);
    setCenterY(0.5);
  }, []);

  const handleApply = useCallback(() => {
    if (isBlocked || isNoop) {
      handleClose();
      return;
    }

    const selPolys =
      activeSelectionPolys && activeSelectionPolys.length > 0
        ? activeSelectionPolys
        : activeSelectionPoly && activeSelectionPoly.length >= 3
          ? [activeSelectionPoly]
          : [];

    if (hasSelection && selPolys.length > 0 && activeLayer) {
      const strokes = getEffectiveFrameStrokes(activeLayer, currentFrame);
      const full = document.createElement('canvas');
      full.width = canvasWidth;
      full.height = canvasHeight;
      const fctx = full.getContext('2d');
      if (fctx) {
        for (const st of strokes) renderStroke(fctx, st);
        const blurred = document.createElement('canvas');
        applyBlurToCanvas(full, blurred, { mode, radius, angle, direction, radialStyle, centerX, centerY });

        const bounds = getSelectionBounds(selPolys, activeSelectionInverted, canvasWidth, canvasHeight);
        if (bounds) {
          const bx = Math.max(0, Math.floor(bounds.minX) - 2);
          const by = Math.max(0, Math.floor(bounds.minY) - 2);
          const bw = Math.min(canvasWidth - bx, Math.ceil(bounds.maxX - bx) + 4);
          const bh = Math.min(canvasHeight - by, Math.ceil(bounds.maxY - by) + 4);
          if (bw > 0 && bh > 0) {
            const cut = document.createElement('canvas');
            cut.width = bw;
            cut.height = bh;
            const cctx = cut.getContext('2d');
            if (cctx) {
              cctx.save();
              traceSelectionPath(cctx, selPolys, activeSelectionInverted, canvasWidth, canvasHeight, bx, by);
              cctx.clip('evenodd');
              cctx.drawImage(blurred, -bx, -by);
              cctx.restore();
              const dataUrl = cut.toDataURL('image/png');
              const eraseMask = {
                id: `blur-erase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                tool: 'erase_poly' as const,
                artLayer: 'LA' as const,
                swatchId: 'sw-black',
                color: '#000000',
                size: 1,
                opacity: 1,
                smoothing: 0,
                points: selPolys[0].map((p) => ({ x: p.x, y: p.y })),
                extraPolys: selPolys.length > 1 ? selPolys.slice(1).map((poly) => poly.map((p) => ({ x: p.x, y: p.y }))) : undefined,
                inverted: activeSelectionInverted || undefined
              };
              const filteredImg = {
                id: `blur-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                tool: 'image' as const,
                artLayer: 'LA' as const,
                swatchId: 'sw-black',
                color: '#000000',
                size: 1,
                opacity: 1,
                smoothing: 0,
                points: [],
                imageDataUrl: dataUrl,
                imageX: bx,
                imageY: by,
                imageW: bw,
                imageH: bh
              };
              addStrokesBatch([eraseMask, filteredImg], true, true);
            }
          }
        }
      }
      setBlurPreview(null);
      setBlurModalOpen(false);
      return;
    }

    applyLayerBlur({ mode, radius, angle, direction, radialStyle, centerX, centerY }, allFrames);
    setBlurPreview(null);
    setBlurModalOpen(false);
  }, [
    isBlocked,
    isNoop,
    hasSelection,
    activeSelectionPoly,
    activeSelectionPolys,
    activeSelectionInverted,
    activeLayer,
    currentFrame,
    canvasWidth,
    canvasHeight,
    mode,
    radius,
    angle,
    direction,
    radialStyle,
    centerX,
    centerY,
    allFrames,
    addStrokesBatch,
    applyLayerBlur,
    setBlurPreview,
    setBlurModalOpen,
    handleClose
  ]);

  useEffect(() => {
    if (!blurModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleApply();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [blurModalOpen, handleClose, handleApply]);

  const updateAngleFromPointer = (clientX: number, clientY: number, snapShift: boolean) => {
    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let deg = Math.round(((Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 360) % 360);
    if (snapShift) deg = (Math.round(deg / 15) * 15) % 360;
    setAngle(deg);
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const nextX = Math.max(8, Math.min(window.innerWidth - 348, dragRef.current.origX + (e.clientX - dragRef.current.startX)));
    const nextY = Math.max(40, Math.min(window.innerHeight - 140, dragRef.current.origY + (e.clientY - dragRef.current.startY)));
    setPos({ x: nextX, y: nextY });
  };
  const handleHeaderPointerUp = () => {
    dragRef.current = null;
  };

  if (!blurModalOpen) return null;

  const angleRad = (angle * Math.PI) / 180;
  const dialR = 26;
  const dotX = 34 + Math.cos(angleRad) * dialR;
  const dotY = 34 + Math.sin(angleRad) * dialR;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        ...(pos ? { left: pos.x, top: pos.y } : { top: 74, right: 300 }),
        width: 340,
        background: '#202227',
        border: '1px solid #484c58',
        borderRadius: 10,
        boxShadow: '0 18px 46px rgba(0,0,0,0.68)',
        zIndex: 9999,
        color: '#e5e7eb',
        fontSize: 12,
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      {/* Draggable Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: '#181a1f',
          borderBottom: '1px solid #323540',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
          <Wind size={14} color="#38bdf8" />
          <span>Desfoque (Camada / Quadro)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setPreviewEnabled((p) => !p)}
            style={{
              background: previewEnabled ? 'rgba(56,189,248,0.18)' : 'transparent',
              border: '1px solid ' + (previewEnabled ? '#38bdf8' : '#3d4048'),
              borderRadius: 5,
              color: previewEnabled ? '#7dd3fc' : '#9ca3af',
              cursor: 'pointer',
              padding: '2px 6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10.5
            }}
          >
            {previewEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
            Prévia
          </button>
          <button
            onClick={handleClose}
            title="Fechar (Esc)"
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 3, display: 'inline-flex' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {/* Target scope badge */}
        <div
          style={{
            fontSize: 11,
            color: isBlocked ? '#fca5a5' : '#9ca3af',
            background: isBlocked ? 'rgba(239,68,68,0.12)' : '#17191d',
            border: '1px solid ' + (isBlocked ? 'rgba(239,68,68,0.35)' : '#2d3038'),
            borderRadius: 6,
            padding: '5px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {isBlocked && <Lock size={11} />}
            {isBlocked ? 'Selecione uma camada de desenho desbloqueada' : `Camada: ${activeLayer?.name || '—'}`}
          </span>
          {!isBlocked && (
            <span style={{ color: hasSelection ? '#38bdf8' : '#fbbf24', fontWeight: 600, flexShrink: 0 }}>
              {hasSelection ? (activeSelectionInverted ? 'Seleção Inv.' : 'Seleção') : allFrames ? 'Todos Quadros' : `Só Quadro ${currentFrame}`}
            </span>
          )}
        </div>

        {/* Blur Mode Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
          {(
            [
              ['motion', 'Movimento'],
              ['gaussian', 'Gaussiano'],
              ['radial', 'Radial']
            ] as [BlurMode, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                padding: '6px 4px',
                borderRadius: 6,
                border: '1px solid ' + (mode === id ? '#38bdf8' : '#3a3e4a'),
                background: mode === id ? 'rgba(2, 132, 199, 0.32)' : '#262932',
                color: mode === id ? '#e0f2fe' : '#cbd5e1',
                fontWeight: mode === id ? 700 : 500,
                fontSize: 11.5,
                cursor: 'pointer'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Distance / Radius / Strength */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontWeight: 500 }}>
              {mode === 'motion' ? 'Distância (Velocidade)' : mode === 'gaussian' ? 'Raio (Desfoque)' : 'Força Radial'}
            </span>
            <span style={{ fontFamily: 'monospace', color: '#7dd3fc' }}>{Math.round(radius)} px</span>
          </div>
          <input
            type="range"
            min={0}
            max={mode === 'gaussian' ? 60 : 80}
            value={Math.round(radius)}
            onChange={(e) => setRadius(Number(e.target.value))}
            onDoubleClick={() => setRadius(18)}
            style={{ width: '100%', accentColor: '#38bdf8' }}
          />
        </div>

        {/* MOTION BLUR DIRECTIONAL CONTROLS (360° Interactive Dial + Forward/Both/Backward) */}
        {mode === 'motion' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Interactive 360° Compass Dial */}
              <div
                ref={dialRef}
                onPointerDown={(e) => {
                  dialDragRef.current = true;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  updateAngleFromPointer(e.clientX, e.clientY, e.shiftKey);
                }}
                onPointerMove={(e) => {
                  if (!dialDragRef.current) return;
                  updateAngleFromPointer(e.clientX, e.clientY, e.shiftKey);
                }}
                onPointerUp={() => {
                  dialDragRef.current = false;
                }}
                title="Arraste para escolher a direção do movimento (Shift trava de 15° em 15°)"
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  background: '#16181d',
                  border: '1.5px solid #3c4250',
                  position: 'relative',
                  cursor: 'crosshair',
                  flexShrink: 0
                }}
              >
                <svg width={68} height={68} style={{ display: 'block', pointerEvents: 'none' }}>
                  <circle cx={34} cy={34} r={26} fill="none" stroke="#2c313d" strokeDasharray="3 3" />
                  <line x1={34} y1={34} x2={dotX} y2={dotY} stroke="#38bdf8" strokeWidth={2} />
                  {direction === 'both' && (
                    <line
                      x1={34}
                      y1={34}
                      x2={34 - Math.cos(angleRad) * dialR}
                      y2={34 - Math.sin(angleRad) * dialR}
                      stroke="rgba(56,189,248,0.45)"
                      strokeWidth={1.5}
                    />
                  )}
                  <circle cx={34} cy={34} r={2.5} fill="#94a3b8" />
                  <circle cx={dotX} cy={dotY} r={4.5} fill="#38bdf8" stroke="#0f172a" strokeWidth={1.2} />
                </svg>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>Ângulo</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={angle}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isNaN(n)) setAngle(((Math.round(n) % 360) + 360) % 360);
                      }}
                      style={{
                        width: 48,
                        background: '#15171b',
                        border: '1px solid #3c4049',
                        borderRadius: 4,
                        color: '#7dd3fc',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        textAlign: 'right',
                        padding: '2px 4px'
                      }}
                    />
                    <span style={{ color: '#9ca3af' }}>°</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 45, 90, 135].map((presetDeg) => (
                    <button
                      key={presetDeg}
                      onClick={() => setAngle(presetDeg)}
                      style={{
                        flex: 1,
                        padding: '2px 0',
                        fontSize: 10,
                        borderRadius: 4,
                        border: '1px solid ' + (angle === presetDeg ? '#38bdf8' : '#353944'),
                        background: angle === presetDeg ? 'rgba(56,189,248,0.2)' : '#252830',
                        color: angle === presetDeg ? '#e0f2fe' : '#9ca3af',
                        cursor: 'pointer'
                      }}
                    >
                      {presetDeg}°
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Direction mode: Both / Forward / Backward */}
            <div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Direção do Rastro</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {(
                  [
                    ['both', 'Ambos'],
                    ['forward', 'Frente →'],
                    ['backward', '← Trás']
                  ] as [MotionDirection, string][]
                ).map(([d, label]) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    style={{
                      padding: '4px 4px',
                      borderRadius: 5,
                      border: '1px solid ' + (direction === d ? '#38bdf8' : '#3a3e4a'),
                      background: direction === d ? 'rgba(56,189,248,0.2)' : '#252830',
                      color: direction === d ? '#e0f2fe' : '#cbd5e1',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* RADIAL BLUR CONTROLS */}
        {mode === 'radial' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <button
                onClick={() => setRadialStyle('zoom')}
                style={{
                  padding: '5px',
                  borderRadius: 5,
                  border: '1px solid ' + (radialStyle === 'zoom' ? '#38bdf8' : '#3a3e4a'),
                  background: radialStyle === 'zoom' ? 'rgba(56,189,248,0.2)' : '#252830',
                  color: radialStyle === 'zoom' ? '#e0f2fe' : '#cbd5e1',
                  cursor: 'pointer',
                  fontSize: 11.5
                }}
              >
                Zoom (Impacto)
              </button>
              <button
                onClick={() => setRadialStyle('spin')}
                style={{
                  padding: '5px',
                  borderRadius: 5,
                  border: '1px solid ' + (radialStyle === 'spin' ? '#38bdf8' : '#3a3e4a'),
                  background: radialStyle === 'spin' ? 'rgba(56,189,248,0.2)' : '#252830',
                  color: radialStyle === 'spin' ? '#e0f2fe' : '#cbd5e1',
                  cursor: 'pointer',
                  fontSize: 11.5
                }}
              >
                Giro (Rotação)
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#aaa' }}>
                  <span>Centro X</span>
                  <span>{Math.round(centerX * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(centerX * 100)}
                  onChange={(e) => setCenterX(Number(e.target.value) / 100)}
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#aaa' }}>
                  <span>Centro Y</span>
                  <span>{Math.round(centerY * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(centerY * 100)}
                  onChange={(e) => setCenterY(Number(e.target.value) / 100)}
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
              </div>
            </div>
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: '#d1d5db' }}>
          <input type="checkbox" checked={allFrames} onChange={(e) => setAllFrames(e.target.checked)} />
          <span>Aplicar em todos os quadros desta camada</span>
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <button
            onClick={handleReset}
            style={{
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px solid #3c4049',
              background: '#2a2d34',
              color: '#d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11.5
            }}
          >
            <RotateCcw size={12} />
            Zerar
          </button>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleClose}
              style={{
                padding: '6px 11px',
                borderRadius: 6,
                border: '1px solid #454954',
                background: '#2b2e35',
                color: '#d1d5db',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleApply}
              disabled={isBlocked || isNoop}
              style={{
                padding: '6px 13px',
                borderRadius: 6,
                border: 'none',
                background: isBlocked || isNoop ? '#374151' : '#0284c7',
                color: isBlocked || isNoop ? '#9ca3af' : '#fff',
                fontWeight: 600,
                cursor: isBlocked || isNoop ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Check size={14} />
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
