import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SlidersHorizontal, X, Check, RotateCcw, Eye, EyeOff, Lock } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { getEffectiveFrameStrokes, renderStroke } from '../utils/canvasRenderer';
import { applyLevelsToCanvas, DEFAULT_LEVELS, isNoopLevels } from '../utils/levelsUtils';
import { getSelectionBounds, traceSelectionPath } from '../utils/selectionUtils';

export const LevelsModal: React.FC = () => {
  const {
    levelsModalOpen,
    setLevelsModalOpen,
    setLevelsPreview,
    applyLayerLevels,
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
      levelsModalOpen: s.levelsModalOpen,
      setLevelsModalOpen: s.setLevelsModalOpen,
      setLevelsPreview: s.setLevelsPreview,
      applyLayerLevels: s.applyLayerLevels,
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

  const [blackPoint, setBlackPoint] = useState(DEFAULT_LEVELS.blackPoint);
  const [gamma, setGamma] = useState(DEFAULT_LEVELS.gamma);
  const [whitePoint, setWhitePoint] = useState(DEFAULT_LEVELS.whitePoint);
  const [brightness, setBrightness] = useState(DEFAULT_LEVELS.brightness);
  const [contrast, setContrast] = useState(DEFAULT_LEVELS.contrast);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [allFrames, setAllFrames] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isBlocked = !activeLayer || activeLayer.locked || activeLayer.type === 'folder' || activeLayer.type === 'camera';
  const hasSelection = Boolean(activeSelectionPoly && activeSelectionPoly.length >= 3 && !allFrames);
  const adj = { blackPoint, gamma, whitePoint, brightness, contrast };
  const isNoop = isNoopLevels(adj);

  useEffect(() => {
    if (levelsModalOpen) {
      setBlackPoint(0);
      setGamma(1);
      setWhitePoint(255);
      setBrightness(0);
      setContrast(0);
      setPreviewEnabled(true);
      setAllFrames(false);
    } else {
      setLevelsPreview(null);
    }
  }, [levelsModalOpen, setLevelsPreview]);

  useEffect(() => {
    if (!levelsModalOpen) return;
    if (!previewEnabled || isBlocked || isNoop) {
      setLevelsPreview(null);
    } else {
      setLevelsPreview({ blackPoint, gamma, whitePoint, brightness, contrast, allFrames });
    }
  }, [levelsModalOpen, blackPoint, gamma, whitePoint, brightness, contrast, allFrames, previewEnabled, isBlocked, isNoop, setLevelsPreview]);

  const handleClose = useCallback(() => {
    setLevelsPreview(null);
    setLevelsModalOpen(false);
  }, [setLevelsPreview, setLevelsModalOpen]);

  const handleReset = useCallback(() => {
    setBlackPoint(0);
    setGamma(1);
    setWhitePoint(255);
    setBrightness(0);
    setContrast(0);
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
        const filtered = document.createElement('canvas');
        applyLevelsToCanvas(full, filtered, { blackPoint, gamma, whitePoint, brightness, contrast });

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
              cctx.drawImage(filtered, -bx, -by);
              cctx.restore();
              const dataUrl = cut.toDataURL('image/png');
              const eraseMask = {
                id: `lvl-erase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
                id: `lvl-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      setLevelsPreview(null);
      setLevelsModalOpen(false);
      return;
    }

    applyLayerLevels({ blackPoint, gamma, whitePoint, brightness, contrast }, allFrames);
    setLevelsPreview(null);
    setLevelsModalOpen(false);
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
    blackPoint,
    gamma,
    whitePoint,
    brightness,
    contrast,
    allFrames,
    addStrokesBatch,
    applyLayerLevels,
    setLevelsPreview,
    setLevelsModalOpen,
    handleClose
  ]);

  useEffect(() => {
    if (!levelsModalOpen) return;
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
  }, [levelsModalOpen, handleClose, handleApply]);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const nextX = Math.max(8, Math.min(window.innerWidth - 332, dragRef.current.origX + (e.clientX - dragRef.current.startX)));
    const nextY = Math.max(40, Math.min(window.innerHeight - 120, dragRef.current.origY + (e.clientY - dragRef.current.startY)));
    setPos({ x: nextX, y: nextY });
  };
  const handleHeaderPointerUp = () => {
    dragRef.current = null;
  };

  if (!levelsModalOpen) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        ...(pos ? { left: pos.x, top: pos.y } : { top: 74, right: 300 }),
        width: 324,
        background: '#222428',
        border: '1px solid #484c56',
        borderRadius: 10,
        boxShadow: '0 16px 42px rgba(0,0,0,0.65)',
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
          background: '#1b1d21',
          borderBottom: '1px solid #353840',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
          <SlidersHorizontal size={14} color="#f59e0b" />
          <span>Níveis / Brilho & Contraste</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setPreviewEnabled((p) => !p)}
            style={{
              background: previewEnabled ? 'rgba(96,165,250,0.18)' : 'transparent',
              border: '1px solid ' + (previewEnabled ? '#3b82f6' : '#3d4048'),
              borderRadius: 5,
              color: previewEnabled ? '#93c5fd' : '#9ca3af',
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
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            fontSize: 11,
            color: isBlocked ? '#fca5a5' : '#9ca3af',
            background: isBlocked ? 'rgba(239,68,68,0.12)' : '#1a1c20',
            border: '1px solid ' + (isBlocked ? 'rgba(239,68,68,0.35)' : '#2e3138'),
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
            <span style={{ color: hasSelection ? '#60a5fa' : '#a1a1aa', fontWeight: 600, flexShrink: 0 }}>
              {hasSelection ? (activeSelectionInverted ? 'Seleção Inv.' : 'Seleção') : allFrames ? 'Todos Quadros' : `Q${currentFrame}`}
            </span>
          )}
        </div>

        {/* Sombras (Black Point) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Sombras (Preto)</span>
            <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{blackPoint}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, whitePoint - 5)}
            value={blackPoint}
            onChange={(e) => setBlackPoint(Number(e.target.value))}
            onDoubleClick={() => setBlackPoint(0)}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
        </div>

        {/* Meios-tons (Gamma) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Meios-tons (Gamma)</span>
            <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{gamma.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={25}
            max={300}
            value={Math.round(gamma * 100)}
            onChange={(e) => setGamma(Number(e.target.value) / 100)}
            onDoubleClick={() => setGamma(1)}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
        </div>

        {/* Altas Luzes (White Point) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Altas Luzes (Branco)</span>
            <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{whitePoint}</span>
          </div>
          <input
            type="range"
            min={Math.min(255, blackPoint + 5)}
            max={255}
            value={whitePoint}
            onChange={(e) => setWhitePoint(Number(e.target.value))}
            onDoubleClick={() => setWhitePoint(255)}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
        </div>

        <div style={{ height: 1, background: '#323640', margin: '2px 0' }} />

        {/* Brilho */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Brilho</span>
            <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{brightness > 0 ? `+${brightness}` : brightness}</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            onDoubleClick={() => setBrightness(0)}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
        </div>

        {/* Contraste */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>Contraste</span>
            <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{contrast > 0 ? `+${contrast}` : contrast}</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
            onDoubleClick={() => setContrast(0)}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: '#d1d5db' }}>
          <input type="checkbox" checked={allFrames} onChange={(e) => setAllFrames(e.target.checked)} />
          <span>Aplicar em todos os quadros da camada</span>
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleReset}
            disabled={isNoop}
            style={{
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px solid #3c4049',
              background: '#2a2d34',
              color: isNoop ? '#6b7280' : '#d1d5db',
              cursor: isNoop ? 'default' : 'pointer',
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
                background: isBlocked || isNoop ? '#374151' : '#2563eb',
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
