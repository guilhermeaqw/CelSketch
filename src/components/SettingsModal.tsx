import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, RotateCcw, Search, Sliders, X, AlertTriangle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import {
  SHORTCUT_DEFINITIONS,
  formatShortcutLabel,
  keyboardEventToCombo,
  type ShortcutActionId
} from '../utils/shortcuts';

export const SettingsModal: React.FC = () => {
  const {
    open,
    setOpen,
    customShortcuts,
    setCustomShortcut,
    resetCustomShortcuts,
    performanceMode,
    setPerformanceMode,
    autoSaveEnabled,
    autoSaveIntervalSec,
    setAutoSaveEnabled,
    setAutoSaveIntervalSec,
    showBrushSizeHud,
    setShowBrushSizeHud,
    usePressure,
    setUsePressure
  } = useHarmonyStore(
    useShallow((s) => ({
      open: s.settingsModalOpen,
      setOpen: s.setSettingsModalOpen,
      customShortcuts: s.customShortcuts,
      setCustomShortcut: s.setCustomShortcut,
      resetCustomShortcuts: s.resetCustomShortcuts,
      performanceMode: s.performanceMode,
      setPerformanceMode: s.setPerformanceMode,
      autoSaveEnabled: s.autoSaveEnabled,
      autoSaveIntervalSec: s.autoSaveIntervalSec,
      setAutoSaveEnabled: s.setAutoSaveEnabled,
      setAutoSaveIntervalSec: s.setAutoSaveIntervalSec,
      showBrushSizeHud: s.showBrushSizeHud,
      setShowBrushSizeHud: s.setShowBrushSizeHud,
      usePressure: s.usePressure,
      setUsePressure: s.setUsePressure
    }))
  );

  const [tab, setTab] = useState<'shortcuts' | 'general'>('shortcuts');
  const [query, setQuery] = useState('');
  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);

  useEffect(() => {
    if (!open) {
      setRecordingId(null);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (recordingId) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          setRecordingId(null);
          return;
        }
        const combo = keyboardEventToCombo(e);
        if (combo) {
          setCustomShortcut(recordingId, combo);
          setRecordingId(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, recordingId, setCustomShortcut, setOpen]);

  // Detect duplicate shortcut assignments so user immediately sees conflicts
  const conflictCombos = useMemo(() => {
    const counts = new Map<string, number>();
    for (const def of SHORTCUT_DEFINITIONS) {
      const k = (customShortcuts[def.id] || def.defaultKey).toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [k, n] of counts.entries()) {
      if (n > 1) dupes.add(k);
    }
    return dupes;
  }, [customShortcuts]);

  const filteredDefs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_DEFINITIONS;
    return SHORTCUT_DEFINITIONS.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        formatShortcutLabel(customShortcuts[d.id]).toLowerCase().includes(q)
    );
  }, [query, customShortcuts]);

  const categories: Array<'Ferramentas' | 'Pincel & Tela' | 'Animação & Visualização'> = [
    'Ferramentas',
    'Pincel & Tela',
    'Animação & Visualização'
  ];

  if (!open) return null;

  return (
    <div
      onClick={() => {
        if (!recordingId) setOpen(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 12, 16, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          maxWidth: '94vw',
          height: 540,
          maxHeight: '88vh',
          background: '#1c1e24',
          border: '1px solid #323642',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          color: '#e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '13px 16px',
            background: '#16181d',
            borderBottom: '1px solid #2b2f3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>Configurações do CelSketch</span>
            <div style={{ display: 'flex', gap: 4, background: '#23262f', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => setTab('shortcuts')}
                style={{
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: tab === 'shortcuts' ? '#3a86ff' : 'transparent',
                  color: tab === 'shortcuts' ? '#fff' : '#9ca3af'
                }}
              >
                <Keyboard size={13} />
                Atalhos
              </button>
              <button
                onClick={() => setTab('general')}
                style={{
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: tab === 'general' ? '#3a86ff' : 'transparent',
                  color: tab === 'general' ? '#fff' : '#9ca3af'
                }}
              >
                <Sliders size={13} />
                Geral & Desempenho
              </button>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            title="Fechar (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 4,
              display: 'inline-flex'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {tab === 'shortcuts' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  background: '#14161b',
                  border: '1px solid #2e323e',
                  borderRadius: 8,
                  padding: '6px 10px'
                }}
              >
                <Search size={13} color="#64748b" />
                <input
                  type="text"
                  placeholder="Buscar ferramenta ou ação..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#e5e7eb',
                    fontSize: 12
                  }}
                />
              </div>
              <button
                onClick={resetCustomShortcuts}
                style={{
                  height: 31,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid #353946',
                  background: '#252832',
                  color: '#cbd5e1',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <RotateCcw size={12} />
                Restaurar Padrões
              </button>
            </div>

            <div style={{ fontSize: 11, color: '#8b95a7' }}>
              Clique em qualquer atalho abaixo e pressione a nova tecla (ou combinação com Ctrl / Shift / Alt). Pressione <kbd style={{ color: '#e2e8f0' }}>Esc</kbd> para cancelar.
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
              {categories.map((cat) => {
                const items = filteredDefs.filter((d) => d.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7dd3fc' }}>
                      {cat}
                    </div>
                    {items.map((def) => {
                      const currentCombo = customShortcuts[def.id] || def.defaultKey;
                      const isRecording = recordingId === def.id;
                      const isConflict = conflictCombos.has(currentCombo.toLowerCase());
                      const isModified = currentCombo !== def.defaultKey;
                      return (
                        <div
                          key={def.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: 7,
                            background: isRecording ? 'rgba(58, 134, 255, 0.14)' : 'rgba(255,255,255,0.025)',
                            border: isRecording
                              ? '1px solid #3a86ff'
                              : isConflict
                              ? '1px solid rgba(245, 158, 11, 0.45)'
                              : '1px solid rgba(255,255,255,0.05)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 12, color: '#e2e8f0' }}>{def.label}</span>
                            {isConflict && (
                              <span
                                title="Este atalho está sendo usado em outra ação"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#fbbf24' }}
                              >
                                <AlertTriangle size={11} />
                                Conflito
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isModified && !isRecording && (
                              <button
                                onClick={() => setCustomShortcut(def.id, def.defaultKey)}
                                title={`Restaurar padrão (${formatShortcutLabel(def.defaultKey)})`}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#64748b',
                                  cursor: 'pointer',
                                  padding: 3,
                                  display: 'inline-flex'
                                }}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                            <button
                              onClick={() => setRecordingId(isRecording ? null : def.id)}
                              style={{
                                minWidth: 88,
                                padding: '4px 10px',
                                borderRadius: 6,
                                border: isRecording ? '1px solid #60a5fa' : '1px solid #3b404e',
                                background: isRecording ? '#2563eb' : '#14161b',
                                color: isRecording ? '#ffffff' : '#f1f5f9',
                                fontSize: 11.5,
                                fontWeight: 700,
                                fontFamily: 'Consolas, monospace',
                                cursor: 'pointer'
                              }}
                            >
                              {isRecording ? 'Pressione...' : formatShortcutLabel(currentCombo)}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Performance Mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f1f5f9' }}>Modo de Desempenho</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {(
                  [
                    { id: 'auto', title: 'Automático', desc: 'Equilíbrio ideal detectando seu PC' },
                    { id: 'eco', title: 'Eco (PC Fraco)', desc: 'Menor uso de RAM e GPU integrada' },
                    { id: 'ultra', title: 'Ultra (GPU)', desc: 'Máxima nitidez em telas HiDPI' }
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPerformanceMode(m.id)}
                    style={{
                      padding: '10px 11px',
                      borderRadius: 9,
                      border: performanceMode === m.id ? '1px solid #3a86ff' : '1px solid #2f3440',
                      background: performanceMode === m.id ? 'rgba(58, 134, 255, 0.16)' : '#15171c',
                      color: '#f1f5f9',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{m.title}</div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3, lineHeight: 1.35 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: '#2a2e38' }} />

            {/* Auto-Save */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f1f5f9' }}>Auto-Save de Recuperação</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Salva um backup automático em segundo plano contra quedas de energia.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  style={{ accentColor: '#3a86ff', width: 15, height: 15, cursor: 'pointer' }}
                />
                <input
                  type="number"
                  min={5}
                  max={3600}
                  disabled={!autoSaveEnabled}
                  value={autoSaveIntervalSec}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v)) setAutoSaveIntervalSec(Math.max(5, Math.min(3600, v)));
                  }}
                  className="harmony-input"
                  style={{ width: 64, textAlign: 'center', opacity: autoSaveEnabled ? 1 : 0.45 }}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>seg</span>
              </div>
            </div>

            <div style={{ height: 1, background: '#2a2e38' }} />

            {/* Visual Brush Size HUD */}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f1f5f9' }}>
                  Feedback Visual ao Mudar Tamanho do Pincel
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Mostra o círculo real e o tamanho em pixels ao usar os atalhos de aumentar/diminuir pincel.
                </div>
              </div>
              <input
                type="checkbox"
                checked={showBrushSizeHud}
                onChange={(e) => setShowBrushSizeHud(e.target.checked)}
                style={{ accentColor: '#3a86ff', width: 16, height: 16, cursor: 'pointer' }}
              />
            </label>

            {/* Pen Pressure */}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f1f5f9' }}>
                  Sensibilidade de Pressão (Mesa Digitalizadora)
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Varia espessura e opacidade conforme a pressão da caneta.
                </div>
              </div>
              <input
                type="checkbox"
                checked={usePressure}
                onChange={(e) => setUsePressure(e.target.checked)}
                style={{ accentColor: '#3a86ff', width: 16, height: 16, cursor: 'pointer' }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
