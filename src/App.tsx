import React, { useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { ToolsBar } from './components/ToolsBar';
import { CanvasStage } from './components/CanvasStage';
import { RightPanel } from './components/RightPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { DockablePanel } from './components/DockablePanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { HsvModal } from './components/HsvModal';
import { ExportModal } from './components/ExportModal';
import { useHarmonyStore } from './store/useHarmonyStore';

export const App: React.FC = () => {
  const {
    showWelcome,
    openScenes,
    activeSceneId,
    isDirty,
    switchSceneTab,
    closeSceneTab,
    addBlankSceneTab,
    activeTool,
    activeLayerId,
    layers,
    fps,
    currentFrame,
    zoom,
    projectName,
    projectPath,
    autoSaveEnabled,
    autoSaveIntervalSec,
    lastAutoSaveTime,
    brushSize,
    setTool,
    activateSelectionGroup,
    activateShapeGroup,
    swapColors,
    setZoom,
    resetView,
    setBrushSize,
    setLastAutoSaveTime,
    undo,
    redo,
    togglePlay,
    toggleFlipX,
    toggleGrayscaleMode,
    setHsvModalOpen,
    setCropMode,
    cropMode,
    nextFrame,
    prevFrame,
    duplicateFrameToNext,
    copyCurrentFrame,
    pasteToCurrentFrame,
    extendExposureF5,
    reduceExposureShiftF5,
    exportProjectData,
    setProjectMeta
  } = useHarmonyStore();

  // Auto-Save timer every X seconds
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const ms = Math.max(5, autoSaveIntervalSec) * 1000;
    const id = window.setInterval(async () => {
      if (!window.harmonyAPI) return;
      const state = useHarmonyStore.getState();
      const data = JSON.stringify(state.exportProjectData(), null, 2);
      const res = await window.harmonyAPI.autoSave(data, state.projectPath);
      if (res?.ok) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        setLastAutoSaveTime(`${hh}:${mm}:${ss}`);
      }
    }, ms);
    return () => window.clearInterval(id);
  }, [autoSaveEnabled, autoSaveIntervalSec, setLastAutoSaveTime]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (k === 'y') {
          e.preventDefault();
          toggleGrayscaleMode();
        } else if (k === 'u') {
          e.preventDefault();
          setHsvModalOpen(true);
        } else if (k === 'c') {
          e.preventDefault();
          copyCurrentFrame();
        } else if (k === 'v') {
          e.preventDefault();
          pasteToCurrentFrame();
        } else if (k === '=' || k === '+') {
          e.preventDefault();
          setZoom(zoom * 1.15);
        } else if (k === '-') {
          e.preventDefault();
          setZoom(zoom * 0.85);
        } else if (k === '0') {
          e.preventDefault();
          resetView();
        } else if (k === 's') {
          e.preventDefault();
          if (!window.harmonyAPI) return;
          const data = JSON.stringify(exportProjectData(), null, 2);
          const res = e.shiftKey
            ? await window.harmonyAPI.saveProjectAs(data)
            : await window.harmonyAPI.saveProject(data, projectPath);
          if (!res.canceled && res.filePath) {
            const name = res.filePath.split(/[\\/]/).pop()?.replace(/\.(celsketch|nexo|hrm)$/i, '') || projectName;
            setProjectMeta(name, res.filePath);
            try {
              const raw = localStorage.getItem('celsketch_recent_projects');
              const list: string[] = raw ? JSON.parse(raw) : [];
              const updated = [res.filePath, ...list.filter((p) => p !== res.filePath)].slice(0, 12);
              localStorage.setItem('celsketch_recent_projects', JSON.stringify(updated));
            } catch {
              // ignore storage errors
            }
          }
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextFrame();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevFrame();
        return;
      }

      // Brush size shortcuts (ABNT2: '[' increases, '´' decreases)
      if (e.key === '[' || e.code === 'BracketRight') {
        e.preventDefault();
        setBrushSize(brushSize + (brushSize >= 20 ? 4 : 2));
        return;
      }
      if (e.key === '´' || e.code === 'BracketLeft') {
        e.preventDefault();
        setBrushSize(brushSize - (brushSize > 20 ? 4 : 2));
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
        case 'k': setTool('select'); break;
        case 'a': setTool('contour'); break;
        case 'q': setTool(e.shiftKey ? 'polylasso' : 'lasso'); break;
        case 'm': activateSelectionGroup(e.shiftKey); break;
        case 'b': setTool('brush'); break;
        case 'c': setCropMode(!cropMode); break;
        case 'p': setTool('pencil'); break;
        case 'e': setTool('eraser'); break;
        case 'g': setTool(e.altKey ? 'polylassofill' : e.shiftKey ? 'lassofill' : 'paint'); break;
        case 'l': setTool('line'); break;
        case 'u': activateShapeGroup(e.shiftKey); break;
        case 'o': setTool('ellipse'); break;
        case 'i': setTool('eyedropper'); break;
        case 'x': swapColors(); break;
        case 'h': setTool('hand'); break;
        case 'z': setTool('zoom'); break;
        case '5':
          e.preventDefault();
          resetView();
          break;
        case ' ':
          if (e.shiftKey) {
            e.preventDefault();
            togglePlay();
          }
          break;
        case 'f1':
          e.preventDefault();
          toggleFlipX();
          break;
        case '.':
          nextFrame();
          break;
        case ',':
          prevFrame();
          break;
        case 'f5':
          e.preventDefault();
          if (e.shiftKey) reduceExposureShiftF5();
          else extendExposureF5();
          break;
        case 'f6':
          e.preventDefault();
          duplicateFrameToNext();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    setTool,
    activateSelectionGroup,
    activateShapeGroup,
    setBrushSize,
    brushSize,
    undo,
    redo,
    togglePlay,
    toggleFlipX,
    toggleGrayscaleMode,
    setHsvModalOpen,
    setCropMode,
    cropMode,
    nextFrame,
    prevFrame,
    duplicateFrameToNext,
    exportProjectData,
    setProjectMeta,
    projectName,
    projectPath
  ]);

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  if (showWelcome) {
    return <WelcomeScreen />;
  }

  return (
    <div className="app-shell">
      <TitleBar />

      <div className="workspace-main">
        <DockablePanel
          title="Tools"
          dockSide="left"
          defaultDockedSize={46}
          minDockedSize={42}
          maxDockedSize={140}
          defaultFloatPos={{ x: 24, y: 90 }}
          defaultFloatSize={{ w: 92, h: 360 }}
        >
          <ToolsBar />
        </DockablePanel>

        <div className="center-pane">
          <div className="panel-tabs" style={{ overflowX: 'auto' }}>
            {openScenes.map((scene) => {
              const isActive = scene.id === activeSceneId;
              return (
                <div
                  key={scene.id}
                  onClick={() => switchSceneTab(scene.id)}
                  className={`panel-tab ${isActive ? 'active' : ''}`}
                  style={{ gap: 8, paddingRight: 6 }}
                >
                  <span>
                    {scene.name}.celsketch{isActive && isDirty ? ' *' : ''}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSceneTab(scene.id);
                    }}
                    title="Fechar cena"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isActive ? '#ddd' : '#888',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 1
                    }}
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
            <button
              onClick={addBlankSceneTab}
              title="Nova cena em nova aba"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#aaa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                height: 23
              }}
            >
              <Plus size={13} />
            </button>
          </div>

          <CanvasStage />
        </div>

        <DockablePanel
          title="Colour & Brushes"
          dockSide="right"
          defaultDockedSize={285}
          minDockedSize={210}
          maxDockedSize={560}
          defaultFloatPos={{ x: 960, y: 90 }}
          defaultFloatSize={{ w: 290, h: 460 }}
        >
          <RightPanel />
        </DockablePanel>
      </div>

      <DockablePanel
        title="Timeline"
        dockSide="bottom"
        defaultDockedSize={225}
        minDockedSize={120}
        maxDockedSize={480}
        defaultFloatPos={{ x: 140, y: 520 }}
        defaultFloatSize={{ w: 860, h: 240 }}
      >
        <TimelinePanel />
      </DockablePanel>
      <HsvModal />
      <ExportModal />

      <div className="status-bar">
        <span>
          Tool: <strong>{activeTool.toUpperCase()}</strong> &nbsp;|&nbsp; Layer:{' '}
          <strong>{activeLayer?.name || 'None'}</strong>
        </span>
        <span>
          {lastAutoSaveTime && (
            <span style={{ color: '#4ade80', marginRight: 10 }}>AutoSaved {lastAutoSaveTime}</span>
          )}
          CelSketch (Windows x64) &nbsp;|&nbsp; {fps} FPS &nbsp;|&nbsp; Frame {currentFrame}
        </span>
      </div>
    </div>
  );
};

export default App;
