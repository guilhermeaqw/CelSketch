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
import { renderFrameToCanvas } from '../utils/canvasRenderer';

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
  const [recentThumbs, setRecentThumbs] = useState<Record<string, string>>(() => loadRecentThumbs());
  const [recentAnimFrames, setRecentAnimFrames] = useState<Record<string, string[]>>({});
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [hoverFrameIdx, setHoverFrameIdx] = useState(0);

  // Optimized hover animation playback for Recent Projects (8 fps)
  useEffect(() => {
    if (!hoveredPath) return;
    const frames = recentAnimFrames[hoveredPath];
    if (!frames || frames.length <= 1) return;
    setHoverFrameIdx(0);
    const id = window.setInterval(() => {
      setHoverFrameIdx((prev) => (prev + 1) % frames.length);
    }, 125);
    return () => window.clearInterval(id);
  }, [hoveredPath, recentAnimFrames]);

  // Auto-generate real thumbnails + optimized animation preview frames (up to 12 frames)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.harmonyAPI) return;
      const currentThumbs = loadRecentThumbs();
      const animMap: Record<string, string[]> = {};
      let changed = false;

      for (const fp of recentProjects) {
        try {
          const res = await window.harmonyAPI.openProjectByPath(fp);
          if (!res.canceled && res.content) {
            const parsed = JSON.parse(res.content);
            if (parsed.layers && parsed.width && parsed.height) {
              // Find all frames that have drawings (up to 12 evenly sampled)
              let maxF = 1;
              for (const l of parsed.layers) {
                for (const [k, v] of Object.entries(l.frames || {})) {
                  if (Array.isArray(v) && v.length > 0) {
                    maxF = Math.max(maxF, Number(k));
                  }
                }
              }
              const step = Math.max(1, Math.ceil(maxF / 12));
              const sampleFrames: string[] = [];
              const src = document.createElement('canvas');
              const thumb = document.createElement('canvas');
              thumb.width = 240;
              thumb.height = Math.round((240 * parsed.height) / parsed.width) || 135;
              const tctx = thumb.getContext('2d');

              if (tctx) {
                // Preload all Paint Bucket / imported image dataUrls so fills appear in previews!
                const imgPromises: Promise<void>[] = [];
                for (const l of parsed.layers) {
                  for (const strokes of Object.values(l.frames || {})) {
                    if (!Array.isArray(strokes)) continue;
                    for (const st of strokes as { tool?: string; imageDataUrl?: string }[]) {
                      if (st.tool === 'image' && st.imageDataUrl) {
                        imgPromises.push(
                          new Promise<void>((resolve) => {
                            const im = new Image();
                            im.onload = () => resolve();
                            im.onerror = () => resolve();
                            im.src = st.imageDataUrl!;
                          })
                        );
                      }
                    }
                  }
                }
                if (imgPromises.length > 0) {
                  await Promise.all(imgPromises);
                }

                for (let f = 1; f <= maxF; f += step) {
                  renderFrameToCanvas(src, parsed.layers, f, parsed.width, parsed.height, '#ffffff');
                  tctx.clearRect(0, 0, thumb.width, thumb.height);
                  tctx.drawImage(src, 0, 0, thumb.width, thumb.height);
                  sampleFrames.push(thumb.toDataURL('image/jpeg', 0.72));
                }
                if (sampleFrames.length > 0) {
                  animMap[fp] = sampleFrames;
                  currentThumbs[fp] = sampleFrames[0];
                  changed = true;
                }
              }
            }
          }
        } catch {
          // skip unreadable files
        }
      }
      if (!cancelled) {
        if (changed) {
          try {
            localStorage.setItem(THUMBS_KEY, JSON.stringify(currentThumbs));
          } catch {
            // ignore
          }
          setRecentThumbs({ ...currentThumbs });
        }
        setRecentAnimFrames(animMap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recentProjects]);

  const handleRemoveRecent = (e: React.MouseEvent, fp: string) => {
    e.stopPropagation();
    const updated = recentProjects.filter((p) => p !== fp);
    setRecentProjects(updated);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };
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
      <div className="title-bar drag-region" style={{ background: '#161920' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="./icon.png"
            alt="CelSketch"
            style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }}
          />
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

      {/* Original CelSketch Studio Hero Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #161b26 0%, #1d2433 60%, #17202e 100%)',
          borderBottom: '1px solid #2c3547',
          padding: '22px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img
            src="./icon.png"
            alt="CelSketch"
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              boxShadow: '0 6px 20px rgba(58, 134, 255, 0.3)'
            }}
          />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>
              CelSketch
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowNewModal(true)}
            style={{
              background: 'linear-gradient(135deg, #2563eb, #3a86ff)',
              border: '1px solid #60a5fa',
              color: '#fff',
              padding: '9px 18px',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
            }}
          >
            <FilePlus size={16} />
            <span>Novo Projeto (Ctrl+N)</span>
          </button>
          <button
            onClick={handleOpenExisting}
            style={{
              background: '#262f40',
              border: '1px solid #3d4a63',
              color: '#e2e8f0',
              padding: '9px 16px',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <FolderOpen size={16} />
            <span>Abrir .celsketch (Ctrl+O)</span>
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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(186px, 1fr))',
                  gap: 16
                }}
              >
                {recentProjects.map((fp) => {
                  const fileName = fp.split(/[\\/]/).pop() || fp;
                  const animList = recentAnimFrames[fp];
                  const activeSrc =
                    hoveredPath === fp && animList && animList.length > 1
                      ? animList[hoverFrameIdx % animList.length]
                      : recentThumbs[fp];

                  return (
                    <div
                      key={fp}
                      onClick={() => handleOpenRecent(fp)}
                      onMouseEnter={() => setHoveredPath(fp)}
                      onMouseLeave={() => setHoveredPath(null)}
                      title={fp}
                      style={{
                        position: 'relative',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        padding: 4
                      }}
                    >
                      <button
                        onClick={(e) => handleRemoveRecent(e, fp)}
                        title="Remover dos recentes"
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(20,20,20,0.78)',
                          color: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 5
                        }}
                      >
                        <X size={12} />
                      </button>

                      <div
                        style={{
                          width: 180,
                          height: 115,
                          background: '#3b3b3b',
                          border: `1.5px solid ${hoveredPath === fp ? '#3a86ff' : '#4d4d4d'}`,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#aaa',
                          overflow: 'hidden'
                        }}
                      >
                        {activeSrc ? (
                          <img
                            src={activeSrc}
                            alt={fileName}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }}
                          />
                        ) : (
                          <FileImage size={42} strokeWidth={1.3} />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: '#d4d4d4',
                          textDecoration: 'underline',
                          maxWidth: 180,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {fileName}
                      </span>
                    </div>
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
              width: 400,
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 74px', gap: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#aaa', minWidth: 0 }}>
                  Largura (px)
                  <input
                    type="number"
                    className="harmony-input"
                    style={{ width: '100%', minWidth: 0 }}
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value) || 1920)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#aaa', minWidth: 0 }}>
                  Altura (px)
                  <input
                    type="number"
                    className="harmony-input"
                    style={{ width: '100%', minWidth: 0 }}
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value) || 1080)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#aaa', minWidth: 0 }}>
                  FPS
                  <input
                    type="number"
                    className="harmony-input"
                    style={{ width: '100%', minWidth: 0 }}
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
