import React, { useEffect } from 'react';
import { Camera, PenTool, Network } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { ToolsBar } from './components/ToolsBar';
import { CanvasStage } from './components/CanvasStage';
import { NodeView } from './components/NodeView';
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
    centerTab,
    setCenterTab,
    activeTool,
    activeLayerId,
    layers,
    fps,
    currentFrame,
    projectName,
    projectPath,
    autoSaveEnabled,
    autoSaveIntervalSec,
    lastAutoSaveTime,
    brushSize,
    setTool,
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
        case 'v': setTool('select'); break;
        case 'a': setTool('contour'); break;
        case 'q': setTool(e.shiftKey ? 'polylasso' : 'lasso'); break;
        case 'b': setTool('brush'); break;
        case 'c': setCropMode(!cropMode); break;
        case 'p': setTool('pencil'); break;
        case 'e': setTool('eraser'); break;
        case 'g': setTool('paint'); break;
        case 'l': setTool('line'); break;
        case 'u': setTool('rectangle'); break;
        case 'o': setTool('ellipse'); break;
        case 'i': setTool('eyedropper'); break;
        case 'h': setTool('hand'); break;
        case 'z': setTool('zoom'); break;
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
          <div className="panel-tabs">
            <button
              className={`panel-tab ${centerTab === 'camera' ? 'active' : ''}`}
              onClick={() => setCenterTab('camera')}
            >
              <Camera size={12} />
              Camera
            </button>
            <button
              className={`panel-tab ${centerTab === 'drawing' ? 'active' : ''}`}
              onClick={() => setCenterTab('drawing')}
            >
              <PenTool size={12} />
              Drawing
            </button>
            <button
              className={`panel-tab ${centerTab === 'node' ? 'active' : ''}`}
              onClick={() => setCenterTab('node')}
            >
              <Network size={12} />
              Node View
            </button>
          </div>

          {centerTab === 'node' ? <NodeView /> : <CanvasStage />}
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
