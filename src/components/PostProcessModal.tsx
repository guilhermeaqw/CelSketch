import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Sparkles, X, RotateCcw, Power } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { POST_PROCESS_PRESETS } from '../utils/postProcessUtils';

export const PostProcessModal: React.FC = () => {
  const {
    postProcessModalOpen,
    postProcess,
    setPostProcessModalOpen,
    setPostProcess,
    resetPostProcess
  } = useHarmonyStore(
    useShallow((s) => ({
      postProcessModalOpen: s.postProcessModalOpen,
      postProcess: s.postProcess,
      setPostProcessModalOpen: s.setPostProcessModalOpen,
      setPostProcess: s.setPostProcess,
      resetPostProcess: s.resetPostProcess
    }))
  );

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!postProcessModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPostProcessModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [postProcessModalOpen, setPostProcessModalOpen]);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const nextX = Math.max(8, Math.min(window.innerWidth - 350, dragRef.current.origX + (e.clientX - dragRef.current.startX)));
    const nextY = Math.max(40, Math.min(window.innerHeight - 140, dragRef.current.origY + (e.clientY - dragRef.current.startY)));
    setPos({ x: nextX, y: nextY });
  };
  const handleHeaderPointerUp = () => {
    dragRef.current = null;
  };

  if (!postProcessModalOpen) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        ...(pos ? { left: pos.x, top: pos.y } : { top: 74, right: 300 }),
        width: 344,
        maxHeight: '82vh',
        background: '#1e2026',
        border: '1px solid #444957',
        borderRadius: 10,
        boxShadow: '0 18px 48px rgba(0,0,0,0.7)',
        zIndex: 9998,
        color: '#e5e7eb',
        fontSize: 12,
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
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
          background: '#17191e',
          borderBottom: '1px solid #303440',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
          <Sparkles size={14} color="#c084fc" />
          <span>Pós-Produção / Look de Anime</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            onClick={() => setPostProcess({ enabled: !postProcess.enabled })}
            style={{
              background: postProcess.enabled ? 'rgba(192, 132, 252, 0.22)' : '#262932',
              border: '1px solid ' + (postProcess.enabled ? '#a855f7' : '#3d414d'),
              borderRadius: 5,
              color: postProcess.enabled ? '#e9d5ff' : '#9ca3af',
              cursor: 'pointer',
              padding: '2px 7px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10.5,
              fontWeight: 600
            }}
          >
            <Power size={11} />
            {postProcess.enabled ? 'ATIVO' : 'OFF'}
          </button>
          <button
            onClick={() => setPostProcessModalOpen(false)}
            title="Fechar (Esc)"
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 3, display: 'inline-flex' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div style={{ padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {/* 1-Click Presets */}
        <div>
          <div style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 5, fontWeight: 600 }}>
            Presets Prontos (1 clique):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {POST_PROCESS_PRESETS.map((pr) => (
              <button
                key={pr.id}
                onClick={() => setPostProcess(pr.settings)}
                title={pr.desc}
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid #353a47',
                  background: '#252832',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600
                }}
              >
                {pr.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: '#2e323d' }} />

        {/* Anime Bloom / Glow */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e9d5ff' }}>Bloom / Glow de Anime</div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span>Intensidade do Brilho</span>
              <span style={{ fontFamily: 'monospace', color: '#c084fc' }}>{Math.round(postProcess.bloomIntensity)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(postProcess.bloomIntensity)}
              onChange={(e) => setPostProcess({ enabled: true, bloomIntensity: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ bloomIntensity: 0 })}
              style={{ width: '100%', accentColor: '#a855f7' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#aaa' }}>
                <span>Raio</span>
                <span>{Math.round(postProcess.bloomRadius)}px</span>
              </div>
              <input
                type="range"
                min={4}
                max={40}
                value={Math.round(postProcess.bloomRadius)}
                onChange={(e) => setPostProcess({ enabled: true, bloomRadius: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#a855f7' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#aaa' }}>
                <span>Limite Luz</span>
                <span>{Math.round(postProcess.bloomThreshold)}</span>
              </div>
              <input
                type="range"
                min={90}
                max={245}
                value={Math.round(postProcess.bloomThreshold)}
                onChange={(e) => setPostProcess({ enabled: true, bloomThreshold: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#a855f7' }}
              />
            </div>
          </div>
        </div>

        {/* Chromatic Aberration */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>Aberração Cromática (RGB Split)</span>
            <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{postProcess.chromaticAberration.toFixed(1)}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={18}
            step={0.5}
            value={postProcess.chromaticAberration}
            onChange={(e) => setPostProcess({ enabled: true, chromaticAberration: Number(e.target.value) })}
            onDoubleClick={() => setPostProcess({ chromaticAberration: 0 })}
            style={{ width: '100%', accentColor: '#38bdf8' }}
          />
        </div>

        {/* Directional Motion Blur */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span style={{ fontWeight: 600 }}>Motion Blur</span>
              <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{Math.round(postProcess.motionBlur)}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={Math.round(postProcess.motionBlur)}
              onChange={(e) => setPostProcess({ enabled: true, motionBlur: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ motionBlur: 0 })}
              style={{ width: '100%', accentColor: '#f59e0b' }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span>Ângulo</span>
              <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{Math.round(postProcess.motionBlurAngle)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(postProcess.motionBlurAngle)}
              onChange={(e) => setPostProcess({ enabled: true, motionBlurAngle: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ motionBlurAngle: 0 })}
              style={{ width: '100%', accentColor: '#f59e0b' }}
            />
          </div>
        </div>

        {/* Vignette + Film Grain */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span style={{ fontWeight: 600 }}>Vinheta</span>
              <span style={{ fontFamily: 'monospace', color: '#d1d5db' }}>{Math.round(postProcess.vignette)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(postProcess.vignette)}
              onChange={(e) => setPostProcess({ enabled: true, vignette: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ vignette: 0 })}
              style={{ width: '100%', accentColor: '#9ca3af' }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span style={{ fontWeight: 600 }}>Grão Filme</span>
              <span style={{ fontFamily: 'monospace', color: '#d1d5db' }}>{Math.round(postProcess.filmGrain)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={Math.round(postProcess.filmGrain)}
              onChange={(e) => setPostProcess({ enabled: true, filmGrain: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ filmGrain: 0 })}
              style={{ width: '100%', accentColor: '#9ca3af' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <span style={{ fontSize: 10.5, color: '#8b92a1' }}>Aplicado ao vivo e na exportação!</span>
          <button
            onClick={resetPostProcess}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid #3c4049',
              background: '#2a2d34',
              color: '#d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11
            }}
          >
            <RotateCcw size={12} />
            Limpar Tudo
          </button>
        </div>
      </div>
    </div>
  );
};
