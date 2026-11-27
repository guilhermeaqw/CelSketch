import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Sliders, X, Check, RotateCcw, Eye, EyeOff, Lock } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { getEffectiveFrameStrokes, renderStroke } from '../utils/canvasRenderer';
import { applyHslToCanvas, isNoopHsv } from '../utils/hsvUtils';
import { getSelectionBounds, traceSelectionPath } from '../utils/selectionUtils';

export const HsvModal: React.FC = () => {
  const {
    hsvModalOpen,
    setHsvModalOpen,
    setHsvPreview,
    applyLayerHsv,
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
      hsvModalOpen: s.hsvModalOpen,
      setHsvModalOpen: s.setHsvModalOpen,
      setHsvPreview: s.setHsvPreview,
      applyLayerHsv: s.applyLayerHsv,
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

  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(0);
  const [val, setVal] = useState(0);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [allFrames, setAllFrames] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const isBlocked = !activeLayer || activeLayer.locked || activeLayer.type === 'folder';
  const hasSelection = Boolean(activeSelectionPoly && activeSelectionPoly.length >= 3 && !allFrames);
  const isNoop = isNoopHsv({ h: hue, s: sat, v: val });

  useEffect(() => {
    if (hsvModalOpen) {
      setHue(0);
      setSat(0);
      setVal(0);
      setPreviewEnabled(true);
      setAllFrames(false);
    } else {
      setHsvPreview(null);
    }
  }, [hsvModalOpen, setHsvPreview]);

  useEffect(() => {
    if (!hsvModalOpen) return;
    if (!previewEnabled || isBlocked || isNoop) {
      setHsvPreview(null);
    } else {
      setHsvPreview({ h: hue, s: sat, v: val, allFrames });
    }
  }, [hsvModalOpen, hue, sat, val, allFrames, previewEnabled, isBlocked, isNoop, setHsvPreview]);

  const handleClose = useCallback(() => {
    setHsvPreview(null);
    setHsvModalOpen(false);
  }, [setHsvPreview, setHsvModalOpen]);

  const handleReset = useCallback(() => {
    setHue(0);
    setSat(0);
    setVal(0);
  }, []);

  const handleApply = useCallback(() => {
    if (isBlocked) {
      handleClose();
      return;
    }
    if (isNoop) {
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
      // Exact pixel-level HSL adjustment strictly on the selected region (supports multi-contour, holes & inverted!)
      const strokes = getEffectiveFrameStrokes(activeLayer, currentFrame);
      const full = document.createElement('canvas');
      full.width = canvasWidth;
      full.height = canvasHeight;
      const fctx = full.getContext('2d');
      if (fctx) {
        for (const st of strokes) {
          renderStroke(fctx, st);
        }

        // Apply pixel-exact HSL to the full layer first so edges match live preview 100%
        const filtered = document.createElement('canvas');
        applyHslToCanvas(full, filtered, { h: hue, s: sat, v: val });

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
                id: `hsv-erase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
                id: `hsv-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      setHsvPreview(null);
      setHsvModalOpen(false);
      return;
    }

    applyLayerHsv(hue, sat, val, allFrames);
    setHsvPreview(null);
    setHsvModalOpen(false);
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
    hue,
    sat,
    val,
    allFrames,
    addStrokesBatch,
    applyLayerHsv,
    setHsvPreview,
    setHsvModalOpen,
    handleClose
  ]);

  // Enter to apply, Escape to cancel
  useEffect(() => {
    if (!hsvModalOpen) return;
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
  }, [hsvModalOpen, handleClose, handleApply]);

  // Draggable header pointer handlers
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextX = Math.max(8, Math.min(window.innerWidth - 332, dragRef.current.origX + dx));
    const nextY = Math.max(40, Math.min(window.innerHeight - 120, dragRef.current.origY + dy));
    setPos({ x: nextX, y: nextY });
  };

  const handleHeaderPointerUp = () => {
    dragRef.current = null;
  };

  if (!hsvModalOpen) return null;

  const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));
  const previewHueDeg = ((hue % 360) + 360) % 360;

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
          <Sliders size={14} color="#60a5fa" />
          <span>Matiz / Saturação / Luminosidade</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setPreviewEnabled((p) => !p)}
            title={previewEnabled ? 'Ocultar prévia (ver original)' : 'Mostrar prévia'}
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
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 3,
              display: 'inline-flex'
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {/* Target info badge */}
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
            {isBlocked
              ? activeLayer?.type === 'folder'
                ? 'Selecione uma camada de desenho (não pasta)'
                : 'Camada bloqueada — desbloqueie para editar'
              : `Camada: ${activeLayer?.name || '—'}`}
          </span>
          {!isBlocked && (
            <span style={{ color: hasSelection ? '#60a5fa' : '#a1a1aa', fontWeight: 600, flexShrink: 0 }}>
              {hasSelection
                ? activeSelectionInverted
                  ? 'Seleção Inv.'
                  : 'Seleção'
                : allFrames
                  ? 'Todos Quadros'
                  : `Q${currentFrame}`}
            </span>
          )}
        </div>

        {/* Hue */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 500 }}>Matiz (Hue)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                type="number"
                min={-180}
                max={180}
                value={hue}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) setHue(clampNum(n, -180, 180));
                }}
                style={{
                  width: 52,
                  background: '#16181c',
                  border: '1px solid #3c4049',
                  borderRadius: 4,
                  color: '#93c5fd',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  textAlign: 'right',
                  padding: '2px 4px'
                }}
              />
              <span style={{ color: '#9ca3af', fontSize: 11 }}>°</span>
            </div>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              marginBottom: 3,
              background:
                'linear-gradient(to right, #00ffff, #0000ff, #ff00ff, #ff0000, #ffff00, #00ff00, #00ffff)'
            }}
          />
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={hue}
            onChange={(e) => setHue(Number(e.target.value))}
            onDoubleClick={() => setHue(0)}
            title="Duplo clique para zerar"
            style={{ width: '100%', accentColor: '#3b82f6', margin: 0 }}
          />
        </div>

        {/* Saturation */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 500 }}>Saturação</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                type="number"
                min={-100}
                max={100}
                value={sat}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) setSat(clampNum(n, -100, 100));
                }}
                style={{
                  width: 52,
                  background: '#16181c',
                  border: '1px solid #3c4049',
                  borderRadius: 4,
                  color: '#93c5fd',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  textAlign: 'right',
                  padding: '2px 4px'
                }}
              />
              <span style={{ color: '#9ca3af', fontSize: 11 }}>%</span>
            </div>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              marginBottom: 3,
              background: `linear-gradient(to right, #808080, hsl(${previewHueDeg}, 100%, 50%))`
            }}
          />
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={sat}
            onChange={(e) => setSat(Number(e.target.value))}
            onDoubleClick={() => setSat(0)}
            title="Duplo clique para zerar"
            style={{ width: '100%', accentColor: '#3b82f6', margin: 0 }}
          />
        </div>

        {/* Lightness / Value */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 500 }}>Luminosidade</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                type="number"
                min={-100}
                max={100}
                value={val}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) setVal(clampNum(n, -100, 100));
                }}
                style={{
                  width: 52,
                  background: '#16181c',
                  border: '1px solid #3c4049',
                  borderRadius: 4,
                  color: '#93c5fd',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  textAlign: 'right',
                  padding: '2px 4px'
                }}
              />
              <span style={{ color: '#9ca3af', fontSize: 11 }}>%</span>
            </div>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              marginBottom: 3,
              background: 'linear-gradient(to right, #000000, #808080, #ffffff)'
            }}
          />
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={val}
            onChange={(e) => setVal(Number(e.target.value))}
            onDoubleClick={() => setVal(0)}
            title="Duplo clique para zerar"
            style={{ width: '100%', accentColor: '#3b82f6', margin: 0 }}
          />
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: '#d1d5db' }}>
            <input
              type="checkbox"
              checked={allFrames}
              onChange={(e) => setAllFrames(e.target.checked)}
            />
            <span>Aplicar em todos os quadros da camada</span>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleReset}
            disabled={isNoop}
            title="Zerar todos os controles"
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
