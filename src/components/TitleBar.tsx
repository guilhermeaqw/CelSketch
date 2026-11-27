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
  Wind
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { hasActivePostProcess } from '../utils/postProcessUtils';
import { parseExternalArtwork } from '../utils/importer';
import { preloadFrameImages, renderFrameToCanvas } from '../utils/canvasRenderer';
import { pickSupportedVideoCodec } from '../utils/exporter';
import { decodeAudioBufferTrack } from '../App';

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
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentPaths());
  const [timelapseBusy, setTimelapseBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    setAutoSaveIntervalSec,
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

  const [autoSaveDraft, setAutoSaveDraft] = useState(String(autoSaveIntervalSec));
  useEffect(() => {
    setAutoSaveDraft(String(autoSaveIntervalSec));
  }, [autoSaveIntervalSec]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    const data = JSON.stringify(exportProjectData(), null, 2);
    if (window.harmonyAPI) {
      try {
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
    const data = JSON.stringify(exportProjectData(), null, 2);
    if (window.harmonyAPI) {
      try {
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
      if (!res.canceled && res.content) {
        try {
          const parsed = JSON.parse(res.content);
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
    if (!res.canceled && res.content) {
      try {
        const parsed = JSON.parse(res.content);
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
                <button className="dropdown-item" onClick={() => { setHsvModalOpen(true); setOpenMenu(null); }}>
                  <span>Hue / Saturation / Value...</span><span style={{ color: '#888' }}>Ctrl+U</span>
                </button>
                <button className="dropdown-item" onClick={() => { setLevelsModalOpen(true); setOpenMenu(null); }}>
                  <span>Níveis / Brilho & Contraste...</span><span style={{ color: '#888' }}>Ctrl+L</span>
                </button>
                <button className="dropdown-item" onClick={() => { setBlurModalOpen(true); setOpenMenu(null); }}>
                  <span>Desfoque (Movimento / Gaussiano / Radial)...</span><span style={{ color: '#888' }}>Ctrl+Shift+B</span>
                </button>
                <button className="dropdown-item" onClick={() => { setPostProcessModalOpen(true); setOpenMenu(null); }}>
                  <span>Pós-Produção / Look de Anime...</span><span style={{ color: '#c084fc' }}>FX</span>
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
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => { toggleGrid(); setOpenMenu(null); }}>
                  <span>12-Field Grid</span><span>{showGrid ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleCameraFrame(); setOpenMenu(null); }}>
                  <span>Camera Mask</span><span>{showCameraFrame ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleOnionSkin(); setOpenMenu(null); }}>
                  <span>Onion Skin</span><span>{onionSkin ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleLightTable(); setOpenMenu(null); }}>
                  <span>Light Table</span><span>{lightTable ? '✓' : ''}</span>
                </button>
                <button className="dropdown-item" onClick={() => { toggleGrayscaleMode(); setOpenMenu(null); }}>
                  <span>Grayscale Proof (Ctrl+Y)</span><span>{grayscaleMode ? '✓' : ''}</span>
                </button>
                <div className="dropdown-sep" />
                <button className="dropdown-item" onClick={() => { resetView(); setOpenMenu(null); }}>
                  <span>Reset View</span><span style={{ color: '#888' }}>5</span>
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
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => { addLayer(); setOpenMenu(null); }}>
                  <span>New Drawing Layer</span><span style={{ color: '#888' }}>Ctrl+R</span>
                </button>
                <button className="dropdown-item" onClick={() => { togglePlay(); setOpenMenu(null); }}>
                  <span>Play / Stop</span><span style={{ color: '#888' }}>Shift+Space</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center Scene Title */}
        <div style={{ fontSize: 11.5, color: '#999' }}>
          {projectName}.celsketch — {canvasWidth}×{canvasHeight}
        </div>

        {/* Windows Window Controls */}
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

      {/* Top Quick Toolbar */}
      <div className="top-toolbar">
        <button className="icon-btn" onClick={handleNewScene} title="New Scene">
          <FilePlus size={14} />
        </button>
        <button className="icon-btn" onClick={handleOpen} title="Open Project">
          <FolderOpen size={14} />
        </button>
        <button className="icon-btn" onClick={handleSave} title="Save Project (Ctrl+S)">
          <Save size={14} />
        </button>
        <button className="icon-btn" onClick={() => setExportModalOpen(true)} title="Export Animation / Image">
          <Download size={14} />
          <span>Export</span>
        </button>

        <div className="tb-sep" />

        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={14} />
        </button>

        <div className="tb-sep" />

        <button className={`icon-btn ${onionSkin ? 'active' : ''}`} onClick={toggleOnionSkin} title="Toggle Onion Skin">
          <Layers size={14} />
          <span>Onion Skin</span>
        </button>
        <button className={`icon-btn ${lightTable ? 'active' : ''}`} onClick={toggleLightTable} title="Light Table">
          <Sun size={14} />
          <span>Light Table</span>
        </button>
        <button className={`icon-btn ${showGrid ? 'active' : ''}`} onClick={toggleGrid} title="12-Field Grid">
          <Grid3X3 size={14} />
        </button>
        <button
          className={`icon-btn ${perspectiveMode > 0 ? 'active' : ''}`}
          onClick={() => setPerspectiveMode(((perspectiveMode + 1) % 5) as 0 | 1 | 2 | 3 | 4)}
          title="Régua de Perspectiva (Off / 1P / 2P / 3P / Fisheye)"
        >
          <span>
            {perspectiveMode === 0
              ? 'Persp: Off'
              : perspectiveMode === 4
              ? 'Persp: Fisheye'
              : `Persp: ${perspectiveMode}P`}
          </span>
        </button>
        <button
          className={`icon-btn ${symmetryMode === 'vertical' ? 'active' : ''}`}
          onClick={toggleSymmetry}
          title="Régua de Simetria Vertical ao vivo"
        >
          <span>Simetria</span>
        </button>
        <button
          className={`icon-btn ${referenceWindowOpen ? 'active' : ''}`}
          onClick={toggleReferenceWindow}
          title="Janela de Referência estilo PureRef (arraste imagens ou Ctrl+V)"
        >
          <span>Ref</span>
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
                ? 'Sair da Visão da Câmera (voltar para edição livre)'
                : 'Ver pela Câmera 2D (enquadramento exato do vídeo final)'
              : 'Adicionar Câmera 2D Animável à cena'
          }
        >
          <Camera size={14} />
          <span>{hasCameraLayer ? (cameraViewMode ? 'Câmera ON' : 'Ver Câmera') : 'Câmera 2D'}</span>
        </button>
        <button
          className="icon-btn"
          onClick={() => setBlurModalOpen(true)}
          style={{ gap: 4 }}
          title="Desfoque na Camada / Quadro / Seleção (Movimento Direcional, Gaussiano, Radial — Ctrl+Shift+B)"
        >
          <Wind size={13} color="#38bdf8" />
          <span>Desfoque</span>
        </button>
        <button
          className={`icon-btn ${postProcessModalOpen || postProcessActive ? 'active' : ''}`}
          onClick={() => setPostProcessModalOpen(!postProcessModalOpen)}
          style={
            postProcessActive
              ? { background: 'rgba(168, 85, 247, 0.25)', borderColor: '#a855f7', color: '#e9d5ff', gap: 4 }
              : { gap: 4 }
          }
          title="Pós-Produção / Look de Anime (Bloom, Aberração Cromática, Motion Blur, Vinheta, Grão)"
        >
          <Sparkles size={13} />
          <span>Pós-Prod</span>
        </button>
        <button className="icon-btn" onClick={resetView} title="Reset View (5)">
          <RotateCcw size={14} />
        </button>
        <button
          className={`icon-btn ${Math.round(rotation) !== 0 ? 'active' : ''}`}
          onClick={resetRotation}
          title="Redefinir Rotação da Tela (0°)"
        >
          <span>{Math.round(rotation)}°</span>
        </button>

        <div className="tb-sep" />

        {/* Brush Stabilizer */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#ccc' }}
          title="Estabilizador de Traço"
        >
          <span>Stabilizer:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={brushSmoothing}
            onChange={(e) => setBrushSmoothing(Number(e.target.value))}
            onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
            style={{ width: 76, accentColor: '#3a86ff', cursor: 'pointer' }}
          />
          <span style={{ width: 30, color: '#fff', fontWeight: 600 }}>{brushSmoothing}%</span>
        </label>

        {/* Brush / Eraser Opacity right next to Stabilizer */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#ccc' }}
          title={activeTool === 'eraser' ? 'Opacidade da Borracha (E)' : 'Opacidade do Pincel'}
        >
          <span>{activeTool === 'eraser' ? 'Opac. (E):' : 'Opacidade:'}</span>
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
            style={{ width: 76, accentColor: '#3a86ff', cursor: 'pointer' }}
          />
          <span style={{ width: 30, color: '#fff', fontWeight: 600 }}>
            {Math.round((activeTool === 'eraser' ? eraserOpacity : brushOpacity) * 100)}%
          </span>
        </label>

        <div className="tb-sep" />

        {/* Auto-Save Controls */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#ccc', cursor: 'pointer' }}
          title="Ativar/Desativar Auto-Save automático"
        >
          <input
            type="checkbox"
            checked={autoSaveEnabled}
            onChange={(e) => setAutoSaveEnabled(e.target.checked)}
          />
          <span>AutoSave:</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={autoSaveDraft}
          disabled={!autoSaveEnabled}
          onChange={(e) => setAutoSaveDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={() => {
            const v = parseInt(autoSaveDraft, 10);
            const clamped = Number.isFinite(v) ? Math.max(5, Math.min(3600, v)) : autoSaveIntervalSec;
            setAutoSaveIntervalSec(clamped);
            setAutoSaveDraft(String(clamped));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="harmony-input timeline-num-input"
          style={{ width: 44, opacity: autoSaveEnabled ? 1 : 0.45 }}
          title="Intervalo do Auto-Save em segundos (5 a 3600)"
        />
        <span style={{ fontSize: 10.5, color: '#888' }}>s</span>

        <div className="tb-sep" />

        {/* Timelapse Recording (Auto-Rec Process Recorder) */}
        <button
          className={`icon-btn ${timelapseRecording ? 'active' : ''}`}
          onClick={async () => {
            if (!timelapseRecording) {
              if (!timelapseRootDir && window.harmonyAPI?.pickDirectory) {
                const res = await window.harmonyAPI.pickDirectory('Escolha a pasta onde gravar os processos (Auto-Rec)');
                if (res.canceled || !res.dirPath) return;
                setTimelapseRootDir(res.dirPath);
              }
              toggleTimelapseRecording();
            } else {
              toggleTimelapseRecording();
            }
          }}
          style={timelapseRecording ? { background: '#b91c1c', borderColor: '#ef4444', color: '#fff' } : undefined}
          title={
            timelapseRootDir
              ? `Auto-Rec (salva pasta organizada por cena em: ${timelapseRootDir})`
              : 'Ativar Auto-Rec — pergunta onde salvar os processos organizados por cena'
          }
        >
          <span>{timelapseRecording ? '● REC' : '○ REC'}</span>
        </button>
        <button
          className="icon-btn"
          onClick={async (e) => {
            if (e.shiftKey || !timelapseRootDir) {
              const res = await window.harmonyAPI?.pickDirectory('Escolha a pasta onde gravar os processos (Auto-Rec)');
              if (res && !res.canceled && res.dirPath) {
                setTimelapseRootDir(res.dirPath);
              }
            } else {
              window.harmonyAPI?.openPath(timelapseRootDir);
            }
          }}
          title={
            timelapseRootDir
              ? `Pasta do Auto-Rec: ${timelapseRootDir} (Clique para abrir • Shift+Clique para trocar pasta)`
              : 'Escolher pasta de gravação do Auto-Rec'
          }
          style={{ padding: '0 5px' }}
        >
          <FolderOpen size={12} />
        </button>
        {timelapseCount > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button
              className="icon-btn"
              onClick={handleExportTimelapse}
              disabled={timelapseBusy}
              title="Exportar vídeo do Timelapse gravado"
            >
              <span>{timelapseBusy ? 'Exportando...' : `Timelapse (${timelapseCount})`}</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => clearTimelapse()}
              disabled={timelapseBusy}
              title="Limpar frames de Timelapse em memória"
              style={{ minWidth: 18, padding: '0 4px', color: '#9ca3af' }}
            >
              ×
            </button>
          </div>
        )}

        <div className="tb-sep" />

        {/* Performance Mode Switcher (Auto / Eco for weak PCs / Ultra for GPU PCs) */}
        <button
          className={`icon-btn ${performanceMode !== 'auto' ? 'active' : ''}`}
          onClick={() => {
            const next =
              performanceMode === 'auto' ? 'eco' : performanceMode === 'eco' ? 'ultra' : 'auto';
            setPerformanceMode(next);
          }}
          title="Modo de Desempenho: Auto (detecta seu PC) • Eco (PC Fraco / sem GPU) • Ultra (GPU / alta definição)"
          style={{ fontSize: 10.5 }}
        >
          <span>
            {performanceMode === 'auto'
              ? '⚡ Auto'
              : performanceMode === 'eco'
              ? '⚡ Eco'
              : '⚡ Ultra'}
          </span>
        </button>
      </div>
    </>
  );
};
