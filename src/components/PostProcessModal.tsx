import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Sparkles, X, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    const nextX = Math.max(8, Math.min(window.innerWidth - 340, dragRef.current.origX + (e.clientX - dragRef.current.startX)));
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
        ...(pos ? { left: pos.x, top: pos.y } : { top: 76, right: 300 }),
        width: 332,
        maxHeight: '82vh',
        background: '#1b1d22',
        border: '1px solid #2e333f',
        borderRadius: 12,
        boxShadow: '0 16px 44px rgba(0,0,0,0.6)',
        zIndex: 9998,
        color: '#e5e7eb',
        fontSize: 12,
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Calm Draggable Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 14px',
          background: '#16181d',
          borderBottom: '1px solid #282c36',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={14} color="#60a5fa" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: '#f3f4f6' }}>Pós-Produção</div>
            <div style={{ fontSize: 10, color: '#858d9e' }}>Acabamento visual ao vivo e no vídeo</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Clean iOS/Studio toggle switch */}
          <button
            onClick={() => setPostProcess({ enabled: !postProcess.enabled })}
            title={postProcess.enabled ? 'Desativar Pós-Produção' : 'Ativar Pós-Produção'}
            style={{
              width: 36,
              height: 20,
              borderRadius: 99,
              border: 'none',
              background: postProcess.enabled ? '#3a86ff' : '#323743',
              position: 'relative',
              cursor: 'pointer',
              padding: 0,
              transition: 'background 0.15s'
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: postProcess.enabled ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.15s'
              }}
            />
          </button>
          <button
            onClick={() => setPostProcessModalOpen(false)}
            title="Fechar (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#858d9e',
              cursor: 'pointer',
              padding: 3,
              display: 'inline-flex',
              borderRadius: 4
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable Calm Body */}
      <div style={{ padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 1-Click Presets */}
        <div>
          <div style={{ fontSize: 10.5, color: '#8d96a8', marginBottom: 7, fontWeight: 600 }}>
            Comece com um estilo pronto
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {POST_PROCESS_PRESETS.map((pr) => (
              <button
                key={pr.id}
                onClick={() => setPostProcess(pr.settings)}
                title={pr.desc}
                style={{
                  padding: '8px 10px',
                  borderRadius: 7,
                  border: '1px solid #2d323e',
                  background: '#22252d',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>{pr.label}</span>
                <span style={{ fontSize: 9.5, color: '#858d9e', lineHeight: 1.25 }}>{pr.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: '#262a34' }} />

        {/* Simple Essential Sliders */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            opacity: postProcess.enabled ? 1 : 0.55,
            transition: 'opacity 0.15s'
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: '#d1d5db' }}>Brilho suave (Bloom)</span>
              <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{Math.round(postProcess.bloomIntensity)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(postProcess.bloomIntensity)}
              onChange={(e) => setPostProcess({ enabled: true, bloomIntensity: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ bloomIntensity: 0 })}
              style={{ width: '100%', accentColor: '#3a86ff' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: '#d1d5db' }}>Aberração cromática (RGB)</span>
              <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{postProcess.chromaticAberration.toFixed(1)} px</span>
            </div>
            <input
              type="range"
              min={0}
              max={18}
              step={0.5}
              value={postProcess.chromaticAberration}
              onChange={(e) => setPostProcess({ enabled: true, chromaticAberration: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ chromaticAberration: 0 })}
              style={{ width: '100%', accentColor: '#3a86ff' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: '#d1d5db' }}>Vinheta nas bordas</span>
              <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{Math.round(postProcess.vignette)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(postProcess.vignette)}
              onChange={(e) => setPostProcess({ enabled: true, vignette: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ vignette: 0 })}
              style={{ width: '100%', accentColor: '#3a86ff' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: '#d1d5db' }}>Textura de filme (Grão)</span>
              <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{Math.round(postProcess.filmGrain)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={Math.round(postProcess.filmGrain)}
              onChange={(e) => setPostProcess({ enabled: true, filmGrain: Number(e.target.value) })}
              onDoubleClick={() => setPostProcess({ filmGrain: 0 })}
              style={{ width: '100%', accentColor: '#3a86ff' }}
            />
          </div>

          {/* Collapsible Fine-Tuning Section for Beginners */}
          <div style={{ borderTop: '1px solid #262a34', paddingTop: 10 }}>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '2px 0'
              }}
            >
              <span>Ajustes avançados (Bloom & Motion Blur)</span>
              {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#9ca3af', marginBottom: 3 }}>
                      <span>Raio Bloom</span>
                      <span>{Math.round(postProcess.bloomRadius)}px</span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={40}
                      value={Math.round(postProcess.bloomRadius)}
                      onChange={(e) => setPostProcess({ enabled: true, bloomRadius: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#3a86ff' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#9ca3af', marginBottom: 3 }}>
                      <span>Limite Luz</span>
                      <span>{Math.round(postProcess.bloomThreshold)}</span>
                    </div>
                    <input
                      type="range"
                      min={90}
                      max={245}
                      value={Math.round(postProcess.bloomThreshold)}
                      onChange={(e) => setPostProcess({ enabled: true, bloomThreshold: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#3a86ff' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#9ca3af', marginBottom: 3 }}>
                      <span>Motion Blur</span>
                      <span>{Math.round(postProcess.motionBlur)}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      value={Math.round(postProcess.motionBlur)}
                      onChange={(e) => setPostProcess({ enabled: true, motionBlur: Number(e.target.value) })}
                      onDoubleClick={() => setPostProcess({ motionBlur: 0 })}
                      style={{ width: '100%', accentColor: '#3a86ff' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#9ca3af', marginBottom: 3 }}>
                      <span>Ângulo</span>
                      <span>{Math.round(postProcess.motionBlurAngle)}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={Math.round(postProcess.motionBlurAngle)}
                      onChange={(e) => setPostProcess({ enabled: true, motionBlurAngle: Number(e.target.value) })}
                      onDoubleClick={() => setPostProcess({ motionBlurAngle: 0 })}
                      style={{ width: '100%', accentColor: '#3a86ff' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clean Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 6,
            borderTop: '1px solid #262a34'
          }}
        >
          <span style={{ fontSize: 10.5, color: '#788194' }}>Duplo clique zera qualquer barra</span>
          <button
            onClick={resetPostProcess}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid #303542',
              background: '#242832',
              color: '#d1d5db',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11
            }}
          >
            <RotateCcw size={12} />
            Zerar
          </button>
        </div>
      </div>
    </div>
  );
};
