import React, { useState } from 'react';
import { FolderOpen, FilePlus, Clock, Minus, Square, X } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';

const RECENT_KEY = 'celsketch_recent_projects';

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
  const updated = [filePath, ...existing].slice(0, 10);
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

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#191919', display: 'flex', flexDirection: 'column' }}>
      {/* Top Window Bar */}
      <div className="title-bar drag-region" style={{ background: '#151515' }}>
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

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32
        }}
      >
        <div
          style={{
            width: 860,
            maxWidth: '95vw',
            minHeight: 480,
            background: '#232323',
            border: '1px solid #383838',
            borderRadius: 8,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            display: 'grid',
            gridTemplateColumns: '340px 1fr',
            overflow: 'hidden'
          }}
        >
          {/* Left Column: New Project & Open */}
          <div
            style={{
              background: '#272727',
              borderRight: '1px solid #353535',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, #3a86ff, #1d4ed8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 20,
                  color: '#fff'
                }}
              >
                C
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>CelSketch</div>
                <div style={{ fontSize: 11, color: '#888' }}>2D Animation & Drawing Studio</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#bbb', textTransform: 'uppercase' }}>
                Novo Projeto
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#aaa' }}>
                Nome da Cena
                <input
                  className="harmony-input"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  style={{ padding: '6px 8px', fontSize: 12 }}
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
                    style={{ padding: '5px 6px' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#aaa' }}>
                  Altura (px)
                  <input
                    type="number"
                    className="harmony-input"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value) || 1080)}
                    style={{ padding: '5px 6px' }}
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
                    style={{ padding: '5px 6px' }}
                  />
                </label>
              </div>

              <button
                className="icon-btn active"
                onClick={() => createNewScene(sceneName, width, height, fps)}
                style={{ height: 36, fontSize: 12.5, fontWeight: 600, marginTop: 4 }}
              >
                <FilePlus size={15} />
                <span>Criar Novo Projeto</span>
              </button>

              <button
                className="icon-btn"
                onClick={handleOpenExisting}
                style={{ height: 34, fontSize: 12, background: '#333', borderColor: '#444' }}
              >
                <FolderOpen size={15} />
                <span>Abrir Projeto Existente (.celsketch)...</span>
              </button>
            </div>
          </div>

          {/* Right Column: Recent Projects */}
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Clock size={14} color="#888" />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd', textTransform: 'uppercase' }}>
                Projetos Recentes
              </span>
            </div>

            {recentProjects.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#777',
                  fontSize: 12,
                  textAlign: 'center',
                  gap: 6
                }}
              >
                <div>Nenhum projeto recente ainda.</div>
                <div style={{ fontSize: 11, color: '#666' }}>
                  Crie um novo projeto ao lado ou abra um arquivo <code>.celsketch</code>.
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentProjects.map((fp) => {
                  const fileName = fp.split(/[\\/]/).pop() || fp;
                  return (
                    <button
                      key={fp}
                      onClick={() => handleOpenRecent(fp)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: 5,
                        background: '#2b2b2b',
                        border: '1px solid #3a3a3a',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#eee' }}>{fileName}</span>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: '#888',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {fp}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
