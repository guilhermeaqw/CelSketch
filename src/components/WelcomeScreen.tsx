import React, { useState, useEffect } from 'react';
import {
  FilePlus,
  FolderOpen,
  Code2,
  Download,
  Keyboard,
  Minus,
  Square,
  X,
  FileImage
} from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';

const RECENT_KEY = 'celsketch_recent_projects';
const THUMBS_KEY = 'celsketch_recent_thumbs';

function loadRecentThumbs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(THUMBS_KEY) || '{}');
  } catch {
    return {};
  }
}

function loadRecentPaths(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentPath(filePath: string): string[] {
  const existing = loadRecentPaths().filter((p) => p !== filePath);
  const updated = [filePath, ...existing].slice(0, 12);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

const PRESETS = [
  { label: 'Full HD 16:9', w: 1920, h: 1080 },
  { label: '4K UHD', w: 3840, h: 2160 },
  { label: 'Vertical 9:16', w: 1080, h: 1920 },
  { label: 'Quadrado 1:1', w: 1080, h: 1080 }
];

export const WelcomeScreen: React.FC = () => {
  const { createNewScene, loadProjectData, setShowWelcome } = useHarmonyStore();
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentPaths());
  const [recentThumbs] = useState<Record<string, string>>(() => loadRecentThumbs());
  const [showNewModal, setShowNewModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sceneName, setSceneName] = useState('Cena_01');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(24);

  const handleOpenExisting = async () => {
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.openProject();
    if (!res.canceled && res.content) {
      try {
        const parsed = JSON.parse(res.content);
        loadProjectData(parsed, res.filePath || null);
        if (res.filePath) setRecentProjects(saveRecentPath(res.filePath));
        setShowWelcome(false);
      } catch (err) {
        console.error('Failed to open project', err);
      }
    }
  };

  const handleOpenRecent = async (filePath: string) => {
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.openProjectByPath(filePath);
    if (!res.canceled && res.content) {
      try {
        const parsed = JSON.parse(res.content);
        loadProjectData(parsed, filePath);
        setRecentProjects(saveRecentPath(filePath));
        setShowWelcome(false);
      } catch (err) {
        console.error('Failed to open recent project', err);
      }
    }
  };

  const handleClearRecents = () => {
    localStorage.removeItem(RECENT_KEY);
    setRecentProjects([]);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowNewModal(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenExisting();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#2e2e2e', color: '#dcdcdc', display: 'flex', flexDirection: 'column' }}>
      {/* Top Window Bar */}
      <div className="title-bar drag-region" style={{ background: '#222222' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #3a86ff, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 11,
              color: '#fff'
            }}
          >
            C
          </div>
          <span style={{ fontWeight: 600, color: '#e5e5e5' }}>CelSketch</span>
        </div>
        <div style={{ display: 'flex' }} className="no-drag">
          <button className="win-ctrl-btn" onClick={() => window.harmonyAPI?.minimize()} title="Minimize">
            <Minus size={13} />
          </button>
          <button className="win-ctrl-btn" onClick={() => window.harmonyAPI?.maximize()} title="Maximize">
            <Square size={11} />
          </button>
          <button className="win-ctrl-btn close" onClick={() => window.harmonyAPI?.close()} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 3-Column Spacious Home Layout */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '210px 1fr 310px',
          gap: 20,
          padding: '24px 28px 16px 28px',
          minHeight: 0
        }}
      >
        {/* Left Column: Iniciar + Comunidade */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#e6e6e6', marginBottom: 16 }}>
              Iniciar
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={() => setShowNewModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#d8d8d8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '4px 0'
                }}
              >
                <FilePlus size={20} strokeWidth={1.6} />
                <span style={{ textDecoration: 'underline' }}>Novo projeto</span>
                <span style={{ color: '#888', fontSize: 11, marginLeft: 'auto' }}>(Ctrl+N)</span>
              </button>

              <button
                onClick={handleOpenExisting}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#d8d8d8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '4px 0'
                }}
              >
                <FolderOpen size={20} strokeWidth={1.6} />
                <span style={{ textDecoration: 'underline' }}>Abrir projeto</span>
                <span style={{ color: '#888', fontSize: 11, marginLeft: 'auto' }}>(Ctrl+O)</span>
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#e6e6e6', marginBottom: 12 }}>
              Comunidade
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => window.harmonyAPI?.openPath('https://github.com/guilhermeaqw/CelSketch')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#cccccc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 11.5
                }}
              >
                <Code2 size={14} />
                <span style={{ textDecoration: 'underline' }}>Código-fonte (GitHub)</span>
              </button>

              <button
                onClick={() => window.harmonyAPI?.openPath('https://github.com/guilhermeaqw/CelSketch/releases')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#cccccc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 11.5
                }}
              >
                <Download size={14} />
                <span style={{ textDecoration: 'underline' }}>Baixar atualizações</span>
              </button>

              <button
                onClick={() => setShowShortcuts(!showShortcuts)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#cccccc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 11.5
                }}
              >
                <Keyboard size={14} />
                <span style={{ textDecoration: 'underline' }}>Atalhos do teclado</span>
              </button>
            </div>
          </div>
        </div>

        {/* Center Column: Projetos recentes */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#e6e6e6' }}>Projetos recentes</span>
            {recentProjects.length > 0 && (
              <button
                onClick={handleClearRecents}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#999',
                  fontSize: 11,
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Limpar
              </button>
            )}
          </div>

          <div
            style={{
              flex: 1,
              border: '1px solid #3f3f3f',
              background: '#2b2b2b',
              padding: 12,
              overflowY: 'auto'
            }}
          >
            {recentProjects.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#777',
                  fontSize: 12
                }}
              >
                Nenhum projeto recente. Clique em &ldquo;Novo projeto&rdquo; para começar.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(126px, 1fr))',
                  gap: 14
                }}
              >
                {recentProjects.map((fp) => {
                  const fileName = fp.split(/[\\/]/).pop() || fp;
                  return (
                    <button
                      key={fp}
                      onClick={() => handleOpenRecent(fp)}
                      title={fp}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        padding: 4
                      }}
                    >
                      <div
                        style={{
                          width: 118,
                          height: 118,
                          background: '#3b3b3b',
                          border: '1px solid #4d4d4d',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#aaa',
                          overflow: 'hidden'
                        }}
                      >
                        {recentThumbs[fp] ? (
                          <img
                            src={recentThumbs[fp]}
                            alt={fileName}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }}
                          />
                        ) : (
                          <FileImage size={38} strokeWidth={1.3} />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#d4d4d4',
                          textDecoration: 'underline',
                          maxWidth: 118,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {fileName}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Novidades / Atalhos */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#e6e6e6', marginBottom: 10 }}>
            {showShortcuts ? 'Atalhos Rápidos' : 'Novidades'}
          </div>
          <div
            style={{
              flex: 1,
              border: '1px solid #3f3f3f',
              background: '#2b2b2b',
              padding: 16,
              overflowY: 'auto',
              fontSize: 11.5,
              color: '#aaa',
              lineHeight: 1.6
            }}
          >
            {showShortcuts ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong style={{ color: '#eee' }}>B / E / G</strong> — Pincel / Borracha / Balde</div>
                <div><strong style={{ color: '#eee' }}>[ / ´</strong> — Aumentar / Diminuir pincel</div>
                <div><strong style={{ color: '#eee' }}>Q / Shift+Q</strong> — Laço / Laço Poligonal</div>
                <div><strong style={{ color: '#eee' }}>C</strong> — Crop / Alterar tamanho da tela</div>
                <div><strong style={{ color: '#eee' }}>Ctrl+T</strong> — Transformar / Perspectiva</div>
                <div><strong style={{ color: '#eee' }}>Ctrl+A</strong> — Selecionar tudo</div>
                <div><strong style={{ color: '#eee' }}>F1</strong> — Espelhar tela horizontalmente</div>
                <div><strong style={{ color: '#eee' }}>Segurar Space</strong> — Mover na cena</div>
                <div><strong style={{ color: '#eee' }}>Segurar R</strong> — Rotacionar tela</div>
                <div><strong style={{ color: '#eee' }}>Shift+Space</strong> — Play / Pause animação</div>
                <div><strong style={{ color: '#eee' }}>Setas ← / →</strong> — Frame anterior / próximo</div>
                <div><strong style={{ color: '#eee' }}>Ctrl+U / Ctrl+Y</strong> — HSV / Grayscale</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: '#e5e5e5', fontWeight: 600 }}>CelSketch v1.0.0</div>
                <div>• Auto-Save automático configurável na barra superior.</div>
                <div>• Balde de Tinta com referência de camadas, tolerância e Anti-Halo.</div>
                <div>• Transformação Livre e Perspectiva em 4 cantos (Ctrl+T).</div>
                <div>• Importação de arquivos .psd, .kra, .clip, .png, .jpg e .svg.</div>
                <div>• Exportação unificada em MP4, GIF, PNG Sequence e PNG.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Centered Footer */}
      <div
        style={{
          padding: '8px 20px 14px 20px',
          textAlign: 'center',
          fontSize: 11,
          color: '#999',
          lineHeight: 1.5
        }}
      >
        <div>O CelSketch é uma ferramenta de animação 2D e desenho digital de código aberto feita para artistas.</div>
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              width: 360,
              background: '#2b2b2b',
              border: '1px solid #4a4a4a',
              borderRadius: 6,
              overflow: 'hidden',
              boxShadow: '0 12px 36px rgba(0,0,0,0.65)'
            }}
          >
            <div
              style={{
                height: 34,
                background: '#202020',
                borderBottom: '1px solid #3a3a3a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                fontWeight: 600
              }}
            >
              <span>Novo Projeto</span>
              <button className="icon-btn" onClick={() => setShowNewModal(false)}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#aaa' }}>
                Nome da Cena
                <input
                  className="harmony-input"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  style={{ padding: '6px 8px' }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setWidth(p.w);
                      setHeight(p.h);
                    }}
                    className={`icon-btn ${width === p.w && height === p.h ? 'active' : ''}`}
                    style={{ height: 26, justifyContent: 'center', fontSize: 10.5 }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: 6 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#aaa' }}>
                  Largura (px)
                  <input
                    type="number"
                    className="harmony-input"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value) || 1920)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#aaa' }}>
                  Altura (px)
                  <input
                    type="number"
                    className="harmony-input"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value) || 1080)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#aaa' }}>
                  FPS
                  <input
                    type="number"
                    className="harmony-input"
                    min={1}
                    max={120}
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value) || 24)}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button className="icon-btn" onClick={() => setShowNewModal(false)}>
                  Cancelar
                </button>
                <button
                  className="icon-btn active"
                  onClick={() => createNewScene(sceneName, width, height, fps)}
                  style={{ padding: '4px 16px', fontWeight: 600 }}
                >
                  Criar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
