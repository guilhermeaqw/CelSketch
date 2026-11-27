import React, { useState, useRef, useEffect } from 'react';
import {
  Minus,
  Square,
  X,
  Undo2,
  Redo2,
  Grid3X3,
  Layers,
  Sun,
  Save,
  FolderOpen,
  Download,
  FilePlus,
  RotateCcw,
  Camera,
  Sparkles,
  ChevronDown,
  Settings
} from 'lucide-react';
import { TitleBarPopovers } from './TitleBarPopovers';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { hasActivePostProcess } from '../utils/postProcessUtils';
import { parseExternalArtwork } from '../utils/importer';
import { preloadFrameImages, renderFrameToCanvas } from '../utils/canvasRenderer';
import { pickSupportedVideoCodec } from '../utils/exporter';
import { decodeAudioBufferTrack } from '../utils/appUtils';
import { packProjectToZip, unpackProjectPayload } from '../utils/projectCodec';

const RECENT_KEY = 'celsketch_recent_projects';
const THUMBS_KEY = 'celsketch_recent_thumbs';

export async function saveProjectThumbnail(filePath: string) {
  try {
    const s = useHarmonyStore.getState();
    // Pick the first drawn frame (fallback to frame 1) so thumbnails aren't blank when art starts later!
    let previewFrame = 1;
    let earliest = Infinity;
    for (const l of s.layers) {
      if (l.type === 'folder') continue;
      for (const [k, st] of Object.entries(l.frames || {})) {
        if (st && st.length > 0) earliest = Math.min(earliest, Number(k));
      }
    }
    if (Number.isFinite(earliest)) previewFrame = earliest;
    await preloadFrameImages(s.layers, previewFrame, previewFrame);
    const src = document.createElement('canvas');
    renderFrameToCanvas(src, s.layers, previewFrame, s.canvasWidth, s.canvasHeight, '#ffffff');
    const thumb = document.createElement('canvas');
    thumb.width = 240;
    thumb.height = Math.round((240 * s.canvasHeight) / s.canvasWidth) || 135;
    const tctx = thumb.getContext('2d');
    if (!tctx) return;
    tctx.drawImage(src, 0, 0, thumb.width, thumb.height);
    const dataUrl = thumb.toDataURL('image/jpeg', 0.78);
    const map = JSON.parse(localStorage.getItem(THUMBS_KEY) || '{}');
    map[filePath] = dataUrl;
    localStorage.setItem(THUMBS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
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
    // ignore storage errors
  }
  return updated;
}

export const TitleBar: React.FC = () => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<{ kind: 'guides' | 'rec'; left: number; top: number } | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentPaths());
  const [timelapseBusy, setTimelapseBusy] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [availableUpdateVer, setAvailableUpdateVer] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const guidesBtnRef = useRef<HTMLButtonElement>(null);
  const recBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    const api = window.harmonyAPI;
    api?.getAppInfo?.().then((info) => {
      if (active && info?.version) setAppVersion(info.version);
    });
    api?.getLastUpdateCheck?.().then((res) => {
      if (active && res?.updateAvailable) setAvailableUpdateVer(res.latestVersion);
    });
    const unsub = api?.onUpdateStatusChanged?.((res) => {
      if (!active) return;
      setAvailableUpdateVer(res?.updateAvailable ? res.latestVersion : null);
    });
    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  // Refresh Recent Projects whenever File menu opens so Ctrl+S / Ctrl+O / Explorer opens show up immediately
  useEffect(() => {
    if (openMenu === 'file') {
      setRecentProjects(loadRecentPaths());
    }
  }, [openMenu]);

  const {
    projectName,
    projectPath,
    canvasWidth,
    canvasHeight,
    showGrid,
    perspectiveMode,
    symmetryMode,
    showCameraFrame,
    cameraViewMode,
    hasCameraLayer,
    postProcessModalOpen,
    postProcessActive,
    lightTable,
    onionSkin,
    grayscaleMode,
    rotation,
    activeTool,
    brushSmoothing,
    brushOpacity,
    eraserOpacity,
    autoSaveEnabled,
    autoSaveIntervalSec,
    timelapseRecording,
    timelapseRootDir,
    timelapseCount,
    performanceMode,
    referenceWindowOpen,
    showBrushSizeHud,
    canUndo,
    canRedo
  } = useHarmonyStore(
    useShallow((s) => ({
      projectName: s.projectName,
      projectPath: s.projectPath,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      showGrid: s.showGrid,
      perspectiveMode: s.perspectiveMode,
      symmetryMode: s.symmetryMode,
      showCameraFrame: s.showCameraFrame,
      cameraViewMode: s.cameraViewMode,
      hasCameraLayer: s.layers.some((l) => l.type === 'camera' && l.visible),
      postProcessModalOpen: s.postProcessModalOpen,
      postProcessActive: hasActivePostProcess(s.postProcess),
      lightTable: s.lightTable,
      onionSkin: s.onionSkin,
      grayscaleMode: s.grayscaleMode,
      rotation: s.rotation,
      activeTool: s.activeTool,
      brushSmoothing: s.brushSmoothing,
      brushOpacity: s.brushOpacity,
      eraserOpacity: s.eraserOpacity,
      autoSaveEnabled: s.autoSaveEnabled,
      autoSaveIntervalSec: s.autoSaveIntervalSec,
      timelapseRecording: s.timelapseRecording,
      timelapseRootDir: s.timelapseRootDir,
      timelapseCount: s.timelapseFrames.length,
      performanceMode: s.performanceMode,
      referenceWindowOpen: s.referenceWindowOpen,
      showBrushSizeHud: s.showBrushSizeHud,
      canUndo: s.undoStack.length > 0,
      canRedo: s.redoStack.length > 0
    }))
  );

  const {
    undo,
    redo,
    setBrushSmoothing,
    setBrushOpacity,
    setEraserOpacity,
    setAutoSaveEnabled,
    toggleTimelapseRecording,
    setTimelapseRootDir,
    setPerformanceMode,
    toggleReferenceWindow,
    toggleSymmetry,
    setPerspectiveMode,
    setAudioTrack,
    resetRotation,
    toggleGrid,
    toggleCameraFrame,
    toggleCameraViewMode,
    addCameraLayer,
    toggleLightTable,
    toggleOnionSkin,
    toggleGrayscaleMode,
    setHsvModalOpen,
    setLevelsModalOpen,
    setBlurModalOpen,
    setPostProcessModalOpen,
    setSettingsModalOpen,
    setShowBrushSizeHud,
    setExportModalOpen,
    setShowWelcome,
    resetView,
    clearCurrentFrame,
    duplicateFrameToNext,
    newProject,
    exportProjectData,
    loadProjectData,
    setProjectMeta,
    addLayer,
    importArtworkLayersBatch,
    clearTimelapse,
    togglePlay
  } = useHarmonyStore.getState();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setOpenMenu(null);
      }
      if (
        target &&
        !target.closest('[data-tb-popover]') &&
        !(guidesBtnRef.current && guidesBtnRef.current.contains(target)) &&
        !(recBtnRef.current && recBtnRef.current.contains(target))
      ) {
        setOpenPopover(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setOpenPopover(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleToolbarPopover = (kind: 'guides' | 'rec', btnEl: HTMLButtonElement | null, width: number) => {
    setOpenMenu(null);
    if (openPopover?.kind === kind) {
      setOpenPopover(null);
      return;
    }
    const rect = btnEl?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setOpenPopover({ kind, left, top: rect.bottom + 4 });
  };

  const handleNewScene = () => {
    setOpenMenu(null);
    newProject();
  };

  const handleExportTimelapse = async () => {
    const timelapseFrames = useHarmonyStore.getState().timelapseFrames;
    if (!window.harmonyAPI || timelapseFrames.length === 0 || timelapseBusy) return;
    setTimelapseBusy(true);
    let stream: MediaStream | null = null;
    try {
      const firstImg = new Image();
      firstImg.src = timelapseFrames[0];
      await new Promise<void>((r) => {
        firstImg.onload = () => r();
        firstImg.onerror = () => r();
      });
      const canvas = document.createElement('canvas');
      canvas.width = firstImg.naturalWidth || 960;
      canvas.height = firstImg.naturalHeight || 540;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const codec = pickSupportedVideoCodec();
      stream = canvas.captureStream(15);
      const recorder = new MediaRecorder(stream, { mimeType: codec.mimeType, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: codec.mimeType }));
      });
      ctx.drawImage(firstImg, 0, 0, canvas.width, canvas.height);
      recorder.start();
      let nextTick = performance.now();
      for (let i = 0; i < timelapseFrames.length; i++) {
        if (i > 0) {
          const img = new Image();
          img.src = timelapseFrames[i];
          await new Promise<void>((r) => {
            img.onload = () => r();
            img.onerror = () => r();
          });
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        nextTick += 66.7;
        const waitMs = Math.max(0, nextTick - performance.now());
        await new Promise((r) => setTimeout(r, waitMs));
      }
      recorder.stop();
      const blob = await done;
      const buf = await blob.arrayBuffer();
      const safeName = (projectName || 'CelSketch').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
      await window.harmonyAPI.saveBinaryFile(
        `${safeName}_timelapse.${codec.ext}`,
        `${codec.label} Timelapse`,
        [codec.ext],
        new Uint8Array(buf)
      );
    } catch (err) {
      console.error('Timelapse export failed:', err);
      window.alert('Não foi possível exportar o vídeo de Timelapse.');
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setTimelapseBusy(false);
    }
  };

  const handleSave = async () => {
    setOpenMenu(null);
    if (window.harmonyAPI) {
      try {
        const data = await packProjectToZip(exportProjectData());
        const res = await window.harmonyAPI.saveProject(data, projectPath, projectName);
        if (res.error) {
          window.alert(`Erro ao salvar projeto: ${res.error}`);
          return;
        }
        if (!res.canceled && res.filePath) {
          const name = res.filePath.split(/[\\/]/).pop()?.replace(/\.(celsketch|nexo|hrm)$/i, '') || projectName;
          setProjectMeta(name, res.filePath);
          setRecentProjects(saveRecentPath(res.filePath));
          saveProjectThumbnail(res.filePath);
        }
      } catch (err) {
        console.error('Save failed:', err);
        window.alert('Falha ao salvar o projeto.');
      }
    }
  };

  const handleSaveAs = async () => {
    setOpenMenu(null);
    if (window.harmonyAPI) {
      try {
        const data = await packProjectToZip(exportProjectData());
        const res = await window.harmonyAPI.saveProjectAs(data, projectName);
        if (res.error) {
          window.alert(`Erro ao salvar projeto: ${res.error}`);
          return;
        }
        if (!res.canceled && res.filePath) {
          const name = res.filePath.split(/[\\/]/).pop()?.replace(/\.(celsketch|nexo|hrm)$/i, '') || projectName;
          setProjectMeta(name, res.filePath);
          setRecentProjects(saveRecentPath(res.filePath));
          saveProjectThumbnail(res.filePath);
        }
      } catch (err) {
        console.error('Save As failed:', err);
        window.alert('Falha ao salvar o projeto.');
      }
    }
  };

  const restoreProjectAudio = async (audioTrackPath?: string | null) => {
    if (!audioTrackPath || !window.harmonyAPI?.readAudioByPath) return;
    const audioRes = await window.harmonyAPI.readAudioByPath(audioTrackPath);
    if (!audioRes.canceled && audioRes.bytes && audioRes.name) {
      const track = await decodeAudioBufferTrack(audioRes.bytes, audioRes.name, audioRes.filePath);
      if (track) {
        setAudioTrack(track);
        useHarmonyStore.setState({ isDirty: false });
      }
    }
  };

  const handleOpen = async () => {
    setOpenMenu(null);
    if (window.harmonyAPI) {
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
          await restoreProjectAudio(parsed.audioTrackPath);
        } catch (err) {
          console.error('Failed to parse project file', err);
          window.alert('Arquivo de projeto inválido ou corrompido.');
        }
      }
    }
  };

  const handleOpenRecent = async (filePath: string) => {
    setOpenMenu(null);
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.openProjectByPath(filePath);
    if (res.error) {
      window.alert(`Não foi possível abrir o arquivo:\n${res.error}`);
      return;
    }
    if (!res.canceled && (res.content || res.bytes)) {
      try {
        const parsed = await unpackProjectPayload(res);
        loadProjectData(parsed, filePath);
        setRecentProjects(saveRecentPath(filePath));
        await restoreProjectAudio(parsed.audioTrackPath);
      } catch (err) {
        console.error('Failed to parse recent project', err);
        window.alert('Arquivo de projeto inválido ou corrompido.');
      }
    }
  };

  const handleImportAudio = async () => {
    setOpenMenu(null);
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.importAudio();
    if (!res.canceled && res.bytes && res.name) {
      const track = await decodeAudioBufferTrack(res.bytes, res.name, res.filePath);
      if (track) {
        setAudioTrack(track);
      } else {
        window.alert('Não foi possível decodificar o arquivo de áudio selecionado.');
      }
    }
  };

  const handleImportArtwork = async () => {
    setOpenMenu(null);
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.importExternal();
    if (!res.canceled && res.bytes && res.ext && res.filePath) {
      const fileName = res.filePath.split(/[\\/]/).pop() || 'Imported';
      try {
        const items = await parseExternalArtwork(fileName, res.ext, res.bytes);
        if (items.length === 0) {
          window.alert('Nenhuma camada/imagem encontrada nesse arquivo.');
          return;
        }
        importArtworkLayersBatch(items);
      } catch (err: any) {
        console.error('Failed to import external artwork', err);
        window.alert(`Erro ao importar arquivo: ${err?.message || 'formato não suportado'}`);
      }
    }
  };

  return (
    <>
      {/* Native-style Harmony 27.1 Title + Menu Bar */}
      <div className="title-bar drag-region">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="no-drag" ref={menuRef}>
          <img
            src="./icon.png"
            alt="CelSketch"
            style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }}
          />
          <span style={{ fontWeight: 600, color: '#e5e5e5', marginRight: 8 }}>
            CelSketch
          </span>

          {/* File Menu */}
          <div style={{ position: 'relative' }}>
            <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}>
              File
            </button>
            {openMenu === 'file' && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => { setShowWelcome(true); setOpenMenu(null); }}>
                  <span>Tela Inicial (Home)</span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={handleNewScene}>
                  <span>New Scene</span><span style={{ color: '#888' }}>Ctrl+N</span>
                </button>
                <button className="dropdown-item" onClick={handleOpen}>
                  <span>Open Project (.celsketch)...</span><span style={{ color: '#888' }}>Ctrl+O</span>
                </button>
                <button className="dropdown-item" onClick={handleImportArtwork}>
                  <span>Import (.psd, .kra, .clip, .png)...</span>
                </button>
                <button className="dropdown-item" onClick={handleImportAudio}>
                  <span>Import Audio (.mp3, .wav)...</span>
                </button>
                {recentProjects.length > 0 && (
                  <>
                    <div className="dropdown-sep" />
                    <div style={{ padding: '3px 14px', fontSize: 10, color: '#888', textTransform: 'uppercase' }}>
                      Recent Projects
                    </div>
                    {recentProjects.map((fp) => {
                      const label = fp.split(/[\\/]/).pop() || fp;
                      return (
                        <button
                          key={fp}
                          className="dropdown-item"
                          onClick={() => handleOpenRecent(fp)}
                          title={fp}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={handleSave}>
                  <span>Save</span><span style={{ color: '#888' }}>Ctrl+S</span>
                </button>
                <button className="dropdown-item" onClick={handleSaveAs}>
                  <span>Save As...</span><span style={{ color: '#888' }}>Ctrl+Shift+S</span>
                </button>
                <div className="dropdown-sep" />
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setOpenMenu(null);
                    setExportModalOpen(true);
                  }}
                >
                  <span>Export...</span>
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div style={{ position: 'relative' }}>
            <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}>
              Edit
            </button>
            {openMenu === 'edit' && (
              <div className="dropdown-menu">
                <button
                  className="dropdown-item"
                  disabled={!canUndo}
                  style={{ opacity: canUndo ? 1 : 0.45 }}
                  onClick={() => { undo(); setOpenMenu(null); }}
                >
                  <span>Undo</span><span style={{ color: '#888' }}>Ctrl+Z</span>
                </button>
                <button
                  className="dropdown-item"
                  disabled={!canRedo}
                  style={{ opacity: canRedo ? 1 : 0.45 }}
                  onClick={() => { redo(); setOpenMenu(null); }}
                >
                  <span>Redo</span><span style={{ color: '#888' }}>Ctrl+Shift+Z</span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { clearCurrentFrame(); setOpenMenu(null); }}>
                  <span>Clear Current Frame</span><span style={{ color: '#888' }}>Del</span>
                </button>
                <button className="dropdown-item" onClick={() => { duplicateFrameToNext(); setOpenMenu(null); }}>
                  <span>Duplicate Frame to Next</span><span style={{ color: '#888' }}>F6</span>
                </button>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div style={{ position: 'relative' }}>
            <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}>
              View
            </button>
            {openMenu === 'view' && (
              <div className="dropdown-menu" style={{ minWidth: 230 }}>
                <button className="dropdown-item" onClick={() => { toggleOnionSkin(); setOpenMenu(null); }}>
                  <span>Onion Skin</span><span>{onionSkin ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleLightTable(); setOpenMenu(null); }}>
                  <span>Light Table</span><span>{lightTable ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleGrid(); setOpenMenu(null); }}>
                  <span>Grade 12-Field</span><span>{showGrid ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleSymmetry(); setOpenMenu(null); }}>
                  <span>Simetria Vertical</span><span>{symmetryMode === 'vertical' ? '✓' : ''}</span>
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setPerspectiveMode(((perspectiveMode + 1) % 5) as 0 | 1 | 2 | 3 | 4);
                    setOpenMenu(null);
                  }}
                >
                  <span>Régua de Perspectiva</span>
                  <span style={{ color: perspectiveMode > 0 ? '#60a5fa' : '#888' }}>
                    {perspectiveMode === 0 ? 'Off' : perspectiveMode === 4 ? 'Fisheye' : `${perspectiveMode}P`}
                  </span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { toggleCameraFrame(); setOpenMenu(null); }}>
                  <span>Moldura de Câmera</span><span>{showCameraFrame ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleReferenceWindow(); setOpenMenu(null); }}>
                  <span>Janela de Referência</span><span>{referenceWindowOpen ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleGrayscaleMode(); setOpenMenu(null); }}>
                  <span>Visualizar P&B (Ctrl+Y)</span><span>{grayscaleMode ? '✓' : ''}</span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { resetView(); setOpenMenu(null); }}>
                  <span>Reset View</span><span style={{ color: '#888' }}>5</span>
                </button>
                <button className="dropdown-item" onClick={() => { resetRotation(); setOpenMenu(null); }}>
                  <span>Zerar Rotação</span><span style={{ color: '#888' }}>0°</span>
                </button>
              </div>
            )}
          </div>

          {/* Insert / Scene Menu */}
          <div style={{ position: 'relative' }}>
            <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'insert' ? null : 'insert')}>
              Insert
            </button>
            {openMenu === 'insert' && (
              <div className="dropdown-menu" style={{ minWidth: 215 }}>
                <button className="dropdown-item" onClick={() => { addLayer(); setOpenMenu(null); }}>
                  <span>Nova Camada de Desenho</span><span style={{ color: '#888' }}>Ctrl+R</span>
                </button>
                <button className="dropdown-item" onClick={() => { addCameraLayer(); setOpenMenu(null); }}>
                  <span>Câmera 2D Animável</span><span style={{ color: '#888' }}>{hasCameraLayer ? 'Selecionar' : '+'}</span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { togglePlay(); setOpenMenu(null); }}>
                  <span>Play / Stop</span><span style={{ color: '#888' }}>Shift+Space</span>
                </button>
              </div>
            )}
          </div>

          {/* Filtros & Efeitos Menu */}
          <div style={{ position: 'relative' }}>
            <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'filters' ? null : 'filters')}>
              Filtros
            </button>
            {openMenu === 'filters' && (
              <div className="dropdown-menu" style={{ minWidth: 260 }}>
                <button className="dropdown-item" onClick={() => { setHsvModalOpen(true); setOpenMenu(null); }}>
                  <span>Matiz / Saturação / Luminosidade...</span><span style={{ color: '#888' }}>Ctrl+U</span>
                </button>
                <button className="dropdown-item" onClick={() => { setLevelsModalOpen(true); setOpenMenu(null); }}>
                  <span>Níveis / Brilho & Contraste...</span><span style={{ color: '#888' }}>Ctrl+L</span>
                </button>
                <button className="dropdown-item" onClick={() => { setBlurModalOpen(true); setOpenMenu(null); }}>
                  <span>Desfoque (Movimento / Gaussiano / Radial)...</span><span style={{ color: '#888' }}>Ctrl+Shift+B</span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { setPostProcessModalOpen(true); setOpenMenu(null); }}>
                  <span>Pós-Produção (Look de Anime)...</span>
                  <span style={{ color: postProcessActive ? '#60a5fa' : '#888', fontWeight: postProcessActive ? 600 : 400 }}>
                    {postProcessActive ? 'ON' : 'FX'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Opções / Preferences Menu */}
          <div style={{ position: 'relative' }}>
            <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'options' ? null : 'options')}>
              Opções
            </button>
            {openMenu === 'options' && (
              <div className="dropdown-menu" style={{ minWidth: 250 }}>
                <button className="dropdown-item" onClick={() => { setSettingsModalOpen(true); setOpenMenu(null); }}>
                  <span>Configurações e Atalhos...</span><span style={{ color: '#60a5fa' }}>⚙</span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { setShowBrushSizeHud(!showBrushSizeHud); setOpenMenu(null); }}>
                  <span>Feedback Visual do Pincel</span><span>{showBrushSizeHud ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { setAutoSaveEnabled(!autoSaveEnabled); setOpenMenu(null); }}>
                  <span>Auto-Save ({autoSaveIntervalSec}s)</span><span>{autoSaveEnabled ? '✓' : ''}</span>
                </button>
                <div className="dropdown-sep" />
                <div style={{ padding: '3px 14px', fontSize: 10, color: '#888', textTransform: 'uppercase' }}>
                  Modo de Desempenho
                </div>
                <button className="dropdown-item" onClick={() => { setPerformanceMode('auto'); setOpenMenu(null); }}>
                  <span>Auto (Recomendado)</span><span>{performanceMode === 'auto' ? '●' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { setPerformanceMode('eco'); setOpenMenu(null); }}>
                  <span>Eco (PC Fraco / Leve)</span><span>{performanceMode === 'eco' ? '●' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { setPerformanceMode('ultra'); setOpenMenu(null); }}>
                  <span>Ultra (Máxima Definição)</span><span>{performanceMode === 'ultra' ? '●' : ''}</span>
                </button>
                <div className="dropdown-sep" />
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setOpenMenu(null);
                    window.harmonyAPI?.openLauncher?.();
                  }}
                >
                  <span>CelSketch Launcher / Atualizações</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center Scene Title */}
        <div style={{ fontSize: 11.5, color: '#999' }}>
          {projectName}.celsketch — {canvasWidth}×{canvasHeight}
        </div>

        {/* Windows Window Controls + Launcher / Update Pill */}
        <div style={{ display: 'flex', alignItems: 'center' }} className="no-drag">
          <button
            onClick={() => window.harmonyAPI?.openLauncher?.()}
            title={
              availableUpdateVer
                ? `Nova versão v${availableUpdateVer} disponível — clique para abrir o Launcher e atualizar`
                : 'Abrir CelSketch Launcher / Verificar Atualizações'
            }
            style={{
              height: 20,
              marginRight: 8,
              padding: '0 8px',
              borderRadius: 99,
              border: availableUpdateVer ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255,255,255,0.1)',
              background: availableUpdateVer ? 'rgba(14, 165, 233, 0.22)' : 'rgba(255,255,255,0.04)',
              color: availableUpdateVer ? '#7dd3fc' : '#9ca3af',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Download size={10} />
            <span>
              {availableUpdateVer
                ? `Atualizar v${availableUpdateVer}`
                : appVersion
                ? `Launcher • v${appVersion}`
                : 'Launcher'}
            </span>
          </button>
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

      {/* Top Quick Toolbar (clean, uncluttered) */}
      <div className="top-toolbar">
        <button className="icon-btn" onClick={handleNewScene} title="Nova Cena (Ctrl+N)">
          <FilePlus size={14} />
        </button>
        <button className="icon-btn" onClick={handleOpen} title="Abrir Projeto (Ctrl+O)">
          <FolderOpen size={14} />
        </button>
        <button className="icon-btn" onClick={handleSave} title="Salvar Projeto (Ctrl+S)">
          <Save size={14} />
        </button>
        <button className="icon-btn" onClick={() => setExportModalOpen(true)} title="Exportar Animação / Imagem">
          <Download size={14} />
          <span>Exportar</span>
        </button>

        <div className="tb-sep" />

        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Shift+Z)">
          <Redo2 size={14} />
        </button>

        <div className="tb-sep" />

        <button className={`icon-btn ${onionSkin ? 'active' : ''}`} onClick={toggleOnionSkin} title="Onion Skin">
          <Layers size={14} />
          <span>Onion</span>
        </button>
        <button className={`icon-btn ${lightTable ? 'active' : ''}`} onClick={toggleLightTable} title="Light Table">
          <Sun size={14} />
          <span>Light</span>
        </button>

        {/* Compact Guides Dropdown (Grid, Perspective, Symmetry) */}
        <button
          ref={guidesBtnRef}
          className={`icon-btn ${showGrid || perspectiveMode > 0 || symmetryMode === 'vertical' || openPopover?.kind === 'guides' ? 'active' : ''}`}
          onClick={() => toggleToolbarPopover('guides', guidesBtnRef.current, 215)}
          title="Guias de Desenho (Grade 12-Field, Perspectiva, Simetria)"
          style={{ gap: 3 }}
        >
          <Grid3X3 size={13} />
          <span>Guias</span>
          <ChevronDown size={11} style={{ opacity: 0.7 }} />
        </button>

        <button
          className={`icon-btn ${hasCameraLayer ? (cameraViewMode ? 'active' : '') : showCameraFrame ? 'active' : ''}`}
          onClick={() => {
            if (hasCameraLayer) toggleCameraViewMode();
            else addCameraLayer();
          }}
          style={
            hasCameraLayer && cameraViewMode
              ? { background: '#0284c7', borderColor: '#38bdf8', color: '#fff', gap: 4 }
              : hasCameraLayer
              ? { borderColor: '#0369a1', color: '#7dd3fc', gap: 4 }
              : { gap: 4 }
          }
          title={
            hasCameraLayer
              ? cameraViewMode
                ? 'Sair da Visão da Câmera'
                : 'Ver pela Câmera 2D'
              : 'Adicionar Câmera 2D Animável à cena'
          }
        >
          <Camera size={13} />
          <span>{hasCameraLayer ? (cameraViewMode ? 'Câmera ON' : 'Câmera') : 'Câmera'}</span>
        </button>

        <button
          className={`icon-btn ${referenceWindowOpen ? 'active' : ''}`}
          onClick={toggleReferenceWindow}
          title="Janela de Referência estilo PureRef (Imagens, GIFs, MP4, Notas e Multi-Monitor)"
        >
          <span>Ref</span>
        </button>

        {postProcessActive && (
          <button
            className={`icon-btn ${postProcessModalOpen ? 'active' : ''}`}
            onClick={() => setPostProcessModalOpen(!postProcessModalOpen)}
            style={{
              background: 'rgba(58, 134, 255, 0.16)',
              borderColor: 'rgba(96, 165, 250, 0.5)',
              color: '#bfdbfe',
              gap: 4
            }}
            title="Pós-Produção ativa — clique para ajustar"
          >
            <Sparkles size={12} />
            <span>Pós-Prod</span>
          </button>
        )}

        <button className="icon-btn" onClick={resetView} title="Resetar Visualização (5)">
          <RotateCcw size={13} />
        </button>
        {Math.round(rotation) !== 0 && (
          <button
            className="icon-btn active"
            onClick={resetRotation}
            title="Zerar Rotação da Tela (0°)"
          >
            <span>{Math.round(rotation)}°</span>
          </button>
        )}

        <div className="tb-sep" />

        {/* Brush Stabilizer */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#bbb' }}
          title="Estabilizador de Traço"
        >
          <span>Estab.</span>
          <input
            type="range"
            min={0}
            max={100}
            value={brushSmoothing}
            onChange={(e) => setBrushSmoothing(Number(e.target.value))}
            onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
            style={{ width: 70, accentColor: '#3a86ff', cursor: 'pointer' }}
          />
          <span style={{ width: 28, color: '#eee', fontWeight: 600, fontSize: 10.5 }}>{brushSmoothing}%</span>
        </label>

        {/* Brush / Eraser Opacity */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#bbb' }}
          title={activeTool === 'eraser' ? 'Opacidade da Borracha' : 'Opacidade do Pincel'}
        >
          <span>{activeTool === 'eraser' ? 'Opac. (E)' : 'Opac.'}</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round((activeTool === 'eraser' ? eraserOpacity : brushOpacity) * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              if (activeTool === 'eraser') setEraserOpacity(v);
              else setBrushOpacity(v);
            }}
            onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
            style={{ width: 70, accentColor: '#3a86ff', cursor: 'pointer' }}
          />
          <span style={{ width: 28, color: '#eee', fontWeight: 600, fontSize: 10.5 }}>
            {Math.round((activeTool === 'eraser' ? eraserOpacity : brushOpacity) * 100)}%
          </span>
        </label>

        <div style={{ flex: 1, minWidth: 8 }} />

        {/* Unified Single REC Dropdown Button */}
        <button
          ref={recBtnRef}
          className={`icon-btn ${timelapseRecording || openPopover?.kind === 'rec' ? 'active' : ''}`}
          onClick={() => toggleToolbarPopover('rec', recBtnRef.current, 250)}
          style={
            timelapseRecording
              ? { background: '#b91c1c', borderColor: '#ef4444', color: '#fff', gap: 4 }
              : { gap: 4 }
          }
          title="Gravação de Processo / Timelapse (Auto-Rec)"
        >
          <span>{timelapseRecording ? '● REC' : '○ REC'}</span>
          {timelapseCount > 0 && (
            <span
              style={{
                fontSize: 9.5,
                padding: '0 4px',
                borderRadius: 99,
                background: timelapseRecording ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.12)',
                color: '#fff'
              }}
            >
              {timelapseCount}
            </span>
          )}
          <ChevronDown size={11} style={{ opacity: 0.75 }} />
        </button>

        <button
          className="icon-btn"
          onClick={() => setSettingsModalOpen(true)}
          title="Configurações e Atalhos do Teclado"
        >
          <Settings size={14} />
        </button>
      </div>

      <TitleBarPopovers
        openPopover={openPopover}
        onClose={() => setOpenPopover(null)}
        showGrid={showGrid}
        symmetryMode={symmetryMode}
        perspectiveMode={perspectiveMode}
        onToggleGrid={toggleGrid}
        onToggleSymmetry={toggleSymmetry}
        onSetPerspectiveMode={setPerspectiveMode}
        timelapseRecording={timelapseRecording}
        timelapseRootDir={timelapseRootDir}
        timelapseCount={timelapseCount}
        timelapseBusy={timelapseBusy}
        onToggleRecording={toggleTimelapseRecording}
        onSetTimelapseRootDir={setTimelapseRootDir}
        onExportTimelapse={handleExportTimelapse}
        onClearTimelapse={clearTimelapse}
      />
    </>
  );
};
