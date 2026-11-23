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
  Camera
} from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { parseExternalArtwork } from '../utils/importer';

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
  const updated = [filePath, ...existing].slice(0, 8);
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
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    projectName,
    projectPath,
    canvasWidth,
    canvasHeight,
    showGrid,
    showCameraFrame,
    lightTable,
    onionSkin,
    grayscaleMode,
    rotation,
    brushSmoothing,
    autoSaveEnabled,
    autoSaveIntervalSec,
    undoStack,
    redoStack,
    undo,
    redo,
    setBrushSmoothing,
    setAutoSaveEnabled,
    setAutoSaveIntervalSec,
    resetRotation,
    toggleGrid,
    toggleCameraFrame,
    toggleLightTable,
    toggleOnionSkin,
    toggleGrayscaleMode,
    setHsvModalOpen,
    setExportModalOpen,
    resetView,
    clearCurrentFrame,
    duplicateFrameToNext,
    newProject,
    exportProjectData,
    loadProjectData,
    setProjectMeta,
    addLayer,
    importImageLayer,
    togglePlay
  } = useHarmonyStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    setOpenMenu(null);
    const data = JSON.stringify(exportProjectData(), null, 2);
    if (window.harmonyAPI) {
      const res = await window.harmonyAPI.saveProject(data, projectPath);
      if (!res.canceled && res.filePath) {
        const name = res.filePath.split(/[\\/]/).pop()?.replace(/\.(celsketch|nexo|hrm)$/i, '') || projectName;
        setProjectMeta(name, res.filePath);
        setRecentProjects(saveRecentPath(res.filePath));
      }
    }
  };

  const handleSaveAs = async () => {
    setOpenMenu(null);
    const data = JSON.stringify(exportProjectData(), null, 2);
    if (window.harmonyAPI) {
      const res = await window.harmonyAPI.saveProjectAs(data);
      if (!res.canceled && res.filePath) {
        const name = res.filePath.split(/[\\/]/).pop()?.replace(/\.(celsketch|nexo|hrm)$/i, '') || projectName;
        setProjectMeta(name, res.filePath);
        setRecentProjects(saveRecentPath(res.filePath));
      }
    }
  };

  const handleOpen = async () => {
    setOpenMenu(null);
    if (window.harmonyAPI) {
      const res = await window.harmonyAPI.openProject();
      if (!res.canceled && res.content) {
        try {
          const parsed = JSON.parse(res.content);
          loadProjectData(parsed, res.filePath || null);
          if (res.filePath) setRecentProjects(saveRecentPath(res.filePath));
        } catch (err) {
          console.error('Failed to parse project file', err);
        }
      }
    }
  };

  const handleOpenRecent = async (filePath: string) => {
    setOpenMenu(null);
    if (!window.harmonyAPI) return;
    const res = await window.harmonyAPI.openProjectByPath(filePath);
    if (!res.canceled && res.content) {
      try {
        const parsed = JSON.parse(res.content);
        loadProjectData(parsed, filePath);
        setRecentProjects(saveRecentPath(filePath));
      } catch (err) {
        console.error('Failed to parse recent project', err);
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
        for (const item of items) {
          importImageLayer(item.name, item.dataUrl, item.x, item.y, item.w, item.h, item.opacity);
        }
      } catch (err) {
        console.error('Failed to import external artwork', err);
      }
    }
  };

  return (
    <>
      {/* Native-style Harmony 27.1 Title + Menu Bar */}
      <div className="title-bar drag-region">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="no-drag" ref={menuRef}>
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
                <button className="dropdown-item" onClick={() => { newProject(); setOpenMenu(null); }}>
                  <span>New Scene</span><span style={{ color: '#888' }}>Ctrl+N</span>
                </button>
                <button className="dropdown-item" onClick={handleOpen}>
                  <span>Open Project (.celsketch)...</span><span style={{ color: '#888' }}>Ctrl+O</span>
                </button>
                <button className="dropdown-item" onClick={handleImportArtwork}>
                  <span>Import (.psd, .kra, .clip, .png)...</span>
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
                <button className="dropdown-item" onClick={() => { undo(); setOpenMenu(null); }}>
                  <span>Undo</span><span style={{ color: '#888' }}>Ctrl+Z</span>
                </button>
                <button className="dropdown-item" onClick={() => { redo(); setOpenMenu(null); }}>
                  <span>Redo</span><span style={{ color: '#888' }}>Ctrl+Y</span>
                </button>
                <button className="dropdown-item" onClick={() => { setHsvModalOpen(true); setOpenMenu(null); }}>
                  <span>Hue / Saturation / Value...</span><span style={{ color: '#888' }}>Ctrl+U</span>
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
                  <span>Reset View</span><span style={{ color: '#888' }}>Shift+M</span>
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
                  <span>Play / Stop</span><span style={{ color: '#888' }}>Space</span>
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
        <button className="icon-btn" onClick={newProject} title="New Scene">
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

        <button className="icon-btn" onClick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button className="icon-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Y)">
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
        <button className={`icon-btn ${showCameraFrame ? 'active' : ''}`} onClick={toggleCameraFrame} title="Camera Frame">
          <Camera size={14} />
        </button>
        <button className="icon-btn" onClick={resetView} title="Reset View">
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
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ccc' }}
          title="Brush Stabilizer (Pulled String)"
        >
          <span>Stabilizer:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={brushSmoothing}
            onChange={(e) => setBrushSmoothing(Number(e.target.value))}
            style={{ width: 85, accentColor: '#3a86ff', cursor: 'pointer' }}
          />
          <span style={{ width: 32, color: '#fff', fontWeight: 600 }}>{brushSmoothing}%</span>
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
          type="number"
          min={5}
          max={3600}
          value={autoSaveIntervalSec}
          disabled={!autoSaveEnabled}
          onChange={(e) => setAutoSaveIntervalSec(Number(e.target.value) || 60)}
          className="harmony-input"
          style={{ width: 46, opacity: autoSaveEnabled ? 1 : 0.45 }}
          title="Intervalo do Auto-Save em segundos"
        />
        <span style={{ fontSize: 10.5, color: '#888' }}>s</span>
      </div>
    </>
  );
};
