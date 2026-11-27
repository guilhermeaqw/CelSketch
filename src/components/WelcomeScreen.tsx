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
  FileImage,
  Flame
} from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { preloadFrameImages, renderFrameToCanvas } from '../utils/canvasRenderer';
import { unpackProjectPayload } from '../utils/projectCodec';
import { decodeAudioBufferTrack } from '../App';

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
  const { createNewScene, createWarmupScene, loadProjectData, setShowWelcome } = useHarmonyStore();
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentPaths());
  const [recentThumbs, setRecentThumbs] = useState<Record<string, string>>(() => loadRecentThumbs());
  const [recentAnimData, setRecentAnimData] = useState<Record<string, { frames: string[]; fps: number; step: number }>>({});
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [hoverFrameIdx, setHoverFrameIdx] = useState(0);

  // Real-FPS hover animation playback matching each project's exact FPS!
  useEffect(() => {
    if (!hoveredPath) return;
    const data = recentAnimData[hoveredPath];
    if (!data || data.frames.length <= 1) return;
    setHoverFrameIdx(0);
    const intervalMs = Math.max(16, Math.round((1000 / Math.max(1, data.fps)) * data.step));
    const id = window.setInterval(() => {
      setHoverFrameIdx((prev) => (prev + 1) % data.frames.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [hoveredPath, recentAnimData]);

  const loadedPreviewsRef = React.useRef<Set<string>>(new Set());

  // Lazy-load missing static thumbnails ONLY (1 single frame, never 60 frames × 12 projects on boot!)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.harmonyAPI) return;
      const currentThumbs = loadRecentThumbs();
      const missingThumbPaths = recentProjects.filter((fp) => !currentThumbs[fp]);
      if (missingThumbPaths.length === 0) return;

      let changed = false;
      for (const fp of missingThumbPaths) {
        if (cancelled) return;
        try {
          const res = await window.harmonyAPI.openProjectByPath(fp);
          if (!res.canceled && (res.content || res.bytes)) {
            const parsed = await unpackProjectPayload(res);
            if (parsed.layers && parsed.width && parsed.height) {
              let previewFrame = 1;
              let earliest = Infinity;
              for (const l of parsed.layers) {
                for (const [k, v] of Object.entries(l.frames || {})) {
                  if (Array.isArray(v) && v.length > 0) earliest = Math.min(earliest, Number(k));
                }
              }
              if (Number.isFinite(earliest)) previewFrame = earliest;
              await preloadFrameImages(parsed.layers, previewFrame, previewFrame);
              const src = document.createElement('canvas');
              const thumb = document.createElement('canvas');
              thumb.width = 200;
              thumb.height = Math.round((200 * parsed.height) / parsed.width) || 115;
              const tctx = thumb.getContext('2d');
              if (tctx) {
                renderFrameToCanvas(src, parsed.layers, previewFrame, parsed.width, parsed.height, '#ffffff');
                tctx.clearRect(0, 0, thumb.width, thumb.height);
                tctx.drawImage(src, 0, 0, thumb.width, thumb.height);
                currentThumbs[fp] = thumb.toDataURL('image/jpeg', 0.72);
                changed = true;
              }
            }
          }
        } catch {
          // skip unreadable files
        }
      }
      if (!cancelled && changed) {
        try {
          localStorage.setItem(THUMBS_KEY, JSON.stringify(currentThumbs));
        } catch {
          // ignore
        }
        setRecentThumbs({ ...currentThumbs });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recentProjects]);

  // On-demand (Lazy Hover) real-FPS animation preview: only reads & renders when user hovers a card!
  useEffect(() => {
    if (!hoveredPath || !window.harmonyAPI || loadedPreviewsRef.current.has(hoveredPath)) return;
    let cancelled = false;
    const fp = hoveredPath;
    loadedPreviewsRef.current.add(fp);

    (async () => {
      try {
        const res = await window.harmonyAPI!.openProjectByPath(fp);
        if (cancelled || res.canceled || (!res.content && !res.bytes)) return;
        const parsed = await unpackProjectPayload(res);
        if (!parsed.layers || !parsed.width || !parsed.height) return;

        const projectFps = Math.max(1, Math.min(60, Number(parsed.fps) || 24));
        let maxF = 1;
        for (const l of parsed.layers) {
          for (const [k, v] of Object.entries(l.frames || {})) {
            if (Array.isArray(v) && v.length > 0) {
              const fNum = Number(k);
              const dur = l.celDurations?.[fNum] || 1;
              maxF = Math.max(maxF, fNum + dur - 1);
            }
          }
        }
        if (typeof parsed.playEnd === 'number' && parsed.playEnd > 0) {
          maxF = Math.min(maxF, parsed.playEnd);
        }
        const step = maxF <= 60 ? 1 : Math.ceil(maxF / 60);
        const sampleFrames: string[] = [];
        const src = document.createElement('canvas');
        const thumb = document.createElement('canvas');
        thumb.width = 200;
        thumb.height = Math.round((200 * parsed.height) / parsed.width) || 115;
        const tctx = thumb.getContext('2d');
        if (!tctx) return;

        await preloadFrameImages(parsed.layers, 1, maxF);
        if (cancelled) return;
        for (let f = 1; f <= maxF; f += step) {
          renderFrameToCanvas(src, parsed.layers, f, parsed.width, parsed.height, '#ffffff');
          tctx.clearRect(0, 0, thumb.width, thumb.height);
          tctx.drawImage(src, 0, 0, thumb.width, thumb.height);
          sampleFrames.push(thumb.toDataURL('image/jpeg', 0.68));
        }
        if (!cancelled && sampleFrames.length > 0) {
          setRecentAnimData((prev) => ({ ...prev, [fp]: { frames: sampleFrames, fps: projectFps, step } }));
          const currentThumbs = loadRecentThumbs();
          currentThumbs[fp] = sampleFrames[0];
          try {
            localStorage.setItem(THUMBS_KEY, JSON.stringify(currentThumbs));
          } catch {
            // ignore
          }
          setRecentThumbs({ ...currentThumbs });
        }
      } catch {
        // skip unreadable files
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hoveredPath]);

  const handleRemoveRecent = (e: React.MouseEvent, fp: string) => {
    e.stopPropagation();
    const updated = recentProjects.filter((p) => p !== fp);
    setRecentProjects(updated);
    loadedPreviewsRef.current.delete(fp);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      const thumbs = loadRecentThumbs();
      delete thumbs[fp];
      localStorage.setItem(THUMBS_KEY, JSON.stringify(thumbs));
      setRecentThumbs(thumbs);
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
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const cardRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const didDragRef = React.useRef(false);

  const startRecentDrag = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Ignore clicks on the remove '×' button
    if ((e.target as HTMLElement).closest('button')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let currentOver = idx;

    const onMove = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        active = true;
        didDragRef.current = true;
        setDraggingIdx(idx);
        setDragOverIdx(idx);
      }
      if (!active) return;

      // Hit-test which recent card the pointer is over
      for (const [i, el] of cardRefs.current.entries()) {
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          currentOver = i;
          setDragOverIdx(i);
          break;
        }
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (active && currentOver !== idx) {
        setRecentProjects((prev) => {
          const next = [...prev];
          const [moved] = next.splice(idx, 1);
          next.splice(currentOver, 0, moved);
          try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
      setDraggingIdx(null);
      setDragOverIdx(null);
      if (active) {
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 60);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const restoreAudioIfSaved = async (audioTrackPath?: string | null) => {
    if (!audioTrackPath || !window.harmonyAPI?.readAudioByPath) return;
    const audioRes = await window.harmonyAPI.readAudioByPath(audioTrackPath);
    if (!audioRes.canceled && audioRes.bytes && audioRes.name) {
      const track = await decodeAudioBufferTrack(audioRes.bytes, audioRes.name, audioRes.filePath);
      if (track) {
        useHarmonyStore.getState().setAudioTrack(track);
        useHarmonyStore.setState({ isDirty: false });
      }
    }
  };

  const handleOpenExisting = async () => {
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.openProject();
    if (res.error) {
      window.alert(`Erro ao abrir projeto: ${res.error}`);
      return;
    }
    if (!res.canceled && (res.content || res.bytes)) {
      try {
        const parsed = await unpackProjectPayload(res);
        loadProjectData(parsed, res.filePath || null);
        if (res.filePath) setRecentProjects(saveRecentPath(res.filePath));
        setShowWelcome(false);
        await restoreAudioIfSaved(parsed.audioTrackPath);
      } catch (err) {
        console.error('Failed to open project', err);
        window.alert('Arquivo de projeto inválido ou corrompido.');
      }
    }
  };

  const handleOpenRecent = async (filePath: string) => {
    if (didDragRef.current) return;
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.openProjectByPath(filePath);
    if (res.error) {
      window.alert(`Não foi possível abrir este projeto:\n${res.error}`);
      return;
    }
    if (!res.canceled && (res.content || res.bytes)) {
      try {
        const parsed = await unpackProjectPayload(res);
        loadProjectData(parsed, filePath);
        // Preserve the user's manual ordering of recent projects!
        setShowWelcome(false);
        await restoreAudioIfSaved(parsed.audioTrackPath);
      } catch (err) {
        console.error('Failed to open recent project', err);
        window.alert('Arquivo de projeto inválido ou corrompido.');
      }
    }
  };

  const handleClearRecents = () => {
    localStorage.removeItem(RECENT_KEY);
    localStorage.removeItem(THUMBS_KEY);
    loadedPreviewsRef.current.clear();
    setRecentProjects([]);
    setRecentThumbs({});
    setRecentAnimData({});
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
            onClick={() => createWarmupScene()}
            title="Criar folha de exercícios: elipses, pontos para conectar, linhas retas H/V e curvas em S"
            style={{
              background: 'linear-gradient(135deg, #d97706, #f59e0b)',
              border: '1px solid #fbbf24',
              color: '#111827',
              padding: '9px 16px',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.28)'
            }}
          >
            <Flame size={16} />
            <span>Modo Aquecimento</span>
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
            {recentProjects.length > 1 && (
              <span style={{ fontSize: 11, color: '#7a7a7a' }}>Arraste para reorganizar</span>
            )}
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
                {recentProjects.map((fp, idx) => {
                  const fileName = fp.split(/[\\/]/).pop() || fp;
                  const animInfo = recentAnimData[fp];
                  const activeSrc =
                    hoveredPath === fp && animInfo && animInfo.frames.length > 1
                      ? animInfo.frames[hoverFrameIdx % animInfo.frames.length]
                      : recentThumbs[fp];
                  const isBeingDragged = draggingIdx === idx;
                  const isDropTarget = draggingIdx !== null && dragOverIdx === idx && draggingIdx !== idx;

                  return (
                    <div
                      key={fp}
                      ref={(el) => {
                        if (el) cardRefs.current.set(idx, el);
                        else cardRefs.current.delete(idx);
                      }}
                      onPointerDown={(e) => startRecentDrag(idx, e)}
                      onClick={() => handleOpenRecent(fp)}
                      onMouseEnter={() => setHoveredPath(fp)}
                      onMouseLeave={() => setHoveredPath(null)}
                      title={`${fp}\n(Clique para abrir • Arraste para reorganizar)`}
                      style={{
                        position: 'relative',
                        cursor: isBeingDragged ? 'grabbing' : 'grab',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        padding: 4,
                        borderRadius: 6,
                        opacity: isBeingDragged ? 0.45 : 1,
                        outline: isDropTarget ? '2px dashed #3a86ff' : 'none',
                        background: isDropTarget ? 'rgba(58, 134, 255, 0.12)' : 'transparent',
                        transition: 'background 0.12s, opacity 0.12s',
                        touchAction: 'none',
                        userSelect: 'none'
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
                            draggable={false}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }}
                          />
                        ) : (
                          <FileImage size={42} strokeWidth={1.3} />
                        )}
                      </div>
                      {animInfo && (
                        <span
                          style={{
                            position: 'absolute',
                            left: 10,
                            top: 96,
                            background: 'rgba(15, 23, 42, 0.85)',
                            color: '#93c5fd',
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            border: '1px solid rgba(58,134,255,0.45)',
                            pointerEvents: 'none'
                          }}
                        >
                          {animInfo.fps} FPS
                        </span>
                      )}
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
