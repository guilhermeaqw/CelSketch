import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { TitleBar, saveProjectThumbnail } from './components/TitleBar';
import { ToolsBar } from './components/ToolsBar';
import { CanvasStage } from './components/CanvasStage';
import { RightPanel } from './components/RightPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { DockablePanel } from './components/DockablePanel';
import { useHarmonyStore } from './store/useHarmonyStore';
import { matchesShortcutCombo } from './utils/shortcuts';
import { isTextEditingTarget, decodeAudioBufferTrack } from './utils/appUtils';

export { isTextEditingTarget, decodeAudioBufferTrack };

// Lazy-load modals & overlays on demand so Editor startup is lean and instant!
const WelcomeScreen = lazy(() =>
  import('./components/WelcomeScreen').then((m) => ({ default: m.WelcomeScreen }))
);
const HsvModal = lazy(() =>
  import('./components/HsvModal').then((m) => ({ default: m.HsvModal }))
);
const LevelsModal = lazy(() =>
  import('./components/LevelsModal').then((m) => ({ default: m.LevelsModal }))
);
const BlurModal = lazy(() =>
  import('./components/BlurModal').then((m) => ({ default: m.BlurModal }))
);
const PostProcessModal = lazy(() =>
  import('./components/PostProcessModal').then((m) => ({ default: m.PostProcessModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const ExportModal = lazy(() =>
  import('./components/ExportModal').then((m) => ({ default: m.ExportModal }))
);
const ReferenceWindow = lazy(() =>
  import('./components/ReferenceWindow').then((m) => ({ default: m.ReferenceWindow }))
);
const UnsavedCloseModal = lazy(() =>
  import('./components/UnsavedCloseModal').then((m) => ({ default: m.UnsavedCloseModal }))
);

const LazyModalHost: React.FC<{ closeConfirmOpen: boolean; onCloseConfirm: () => void }> = ({
  closeConfirmOpen,
  onCloseConfirm
}) => {
  const {
    hsvModalOpen,
    levelsModalOpen,
    blurModalOpen,
    postProcessModalOpen,
    settingsModalOpen,
    exportModalOpen,
    referenceWindowOpen
  } = useHarmonyStore(
    useShallow((s) => ({
      hsvModalOpen: s.hsvModalOpen,
      levelsModalOpen: s.levelsModalOpen,
      blurModalOpen: s.blurModalOpen,
      postProcessModalOpen: s.postProcessModalOpen,
      settingsModalOpen: s.settingsModalOpen,
      exportModalOpen: s.exportModalOpen,
      referenceWindowOpen: s.referenceWindowOpen
    }))
  );

  return (
    <>
      {hsvModalOpen && <HsvModal />}
      {levelsModalOpen && <LevelsModal />}
      {blurModalOpen && <BlurModal />}
      {postProcessModalOpen && <PostProcessModal />}
      {settingsModalOpen && <SettingsModal />}
      {exportModalOpen && <ExportModal />}
      {referenceWindowOpen && <ReferenceWindow />}
      {closeConfirmOpen && <UnsavedCloseModal open={closeConfirmOpen} onClose={onCloseConfirm} />}
    </>
  );
};

const StatusBarFrame: React.FC = () => {
  const { fps, currentFrame } = useHarmonyStore(
    useShallow((s) => ({ fps: s.fps, currentFrame: s.currentFrame }))
  );
  return (
    <>
      CelSketch (Windows x64) &nbsp;|&nbsp; {fps} FPS &nbsp;|&nbsp; Frame {currentFrame}
    </>
  );
};

export const App: React.FC = () => {
  const [recoveryOffer, setRecoveryOffer] = useState<{ content: string; mtimeMs: number } | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  useEffect(() => {
    const unsub = window.harmonyAPI?.onRequestClose?.(() => {
      setCloseConfirmOpen(true);
    });
    const unsubRefColor = window.harmonyAPI?.onRefColorPicked?.((hex) => {
      if (!hex) return;
      const st = useHarmonyStore.getState();
      st.setActiveColor(hex);
      st.pushRecentColor(hex);
    });
    return () => {
      if (unsub) unsub();
      if (unsubRefColor) unsubRefColor();
    };
  }, []);

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
    lastAutoSaveTime,
    autoSaveEnabled,
    autoSaveIntervalSec,
    setLastAutoSaveTime
  } = useHarmonyStore(
    useShallow((s) => ({
      showWelcome: s.showWelcome,
      openScenes: s.openScenes,
      activeSceneId: s.activeSceneId,
      isDirty: s.isDirty,
      switchSceneTab: s.switchSceneTab,
      closeSceneTab: s.closeSceneTab,
      addBlankSceneTab: s.addBlankSceneTab,
      activeTool: s.activeTool,
      activeLayerId: s.activeLayerId,
      layers: s.layers,
      lastAutoSaveTime: s.lastAutoSaveTime,
      autoSaveEnabled: s.autoSaveEnabled,
      autoSaveIntervalSec: s.autoSaveIntervalSec,
      setLastAutoSaveTime: s.setLastAutoSaveTime
    }))
  );

  // Open project helper (handles Explorer double-click + saved audio reload)
  const openProjectPathDirectly = async (filePath: string) => {
    if (!window.harmonyAPI) return;
    try {
      const res = await window.harmonyAPI.openProjectByPath(filePath);
      if (res.canceled || !res.content || !res.filePath) return;
      const parsed = JSON.parse(res.content);
      const st = useHarmonyStore.getState();
      st.loadProjectData(parsed, res.filePath);
      if (parsed.audioTrackPath && window.harmonyAPI.readAudioByPath) {
        const audioRes = await window.harmonyAPI.readAudioByPath(parsed.audioTrackPath);
        if (!audioRes.canceled && audioRes.bytes && audioRes.name) {
          const track = await decodeAudioBufferTrack(audioRes.bytes, audioRes.name, audioRes.filePath);
          if (track) {
            useHarmonyStore.getState().setAudioTrack(track);
            useHarmonyStore.setState({ isDirty: false });
          }
        }
      }
      try {
        const raw = localStorage.getItem('celsketch_recent_projects');
        const list: string[] = raw ? JSON.parse(raw) : [];
        const updated = [res.filePath, ...list.filter((p) => p !== res.filePath)].slice(0, 12);
        localStorage.setItem('celsketch_recent_projects', JSON.stringify(updated));
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Failed to open project file:', err);
    }
  };

  // Startup: handle OS file association launch + second-instance + crash recovery check
  useEffect(() => {
    let active = true;
    const api = window.harmonyAPI;
    if (!api) return;

    api.getLaunchFile?.().then((launchFile) => {
      if (active && launchFile) {
        openProjectPathDirectly(launchFile);
      }
    });

    const unsubOpen = api.onOpenExternalFile?.((fp) => {
      if (fp) openProjectPathDirectly(fp);
    });

    api.checkRecovery?.().then((rec) => {
      if (active && rec?.exists && rec.content) {
        setRecoveryOffer({ content: rec.content, mtimeMs: rec.mtimeMs || Date.now() });
      }
    });

    return () => {
      active = false;
      unsubOpen?.();
    };
  }, []);

  // Auto-Save timer: ONLY saves when user is inside a scene AND has unsaved edits (never overwrites backup on WelcomeScreen!)
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const ms = Math.max(5, autoSaveIntervalSec) * 1000;
    const id = window.setInterval(async () => {
      if (!window.harmonyAPI) return;
      const state = useHarmonyStore.getState();
      if (state.showWelcome || !state.isDirty) return;
      try {
        const data = JSON.stringify(state.exportProjectData());
        const res = await window.harmonyAPI.autoSave(data, state.projectPath);
        if (res?.ok) {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, '0');
          const mm = String(now.getMinutes()).padStart(2, '0');
          const ss = String(now.getSeconds()).padStart(2, '0');
          setLastAutoSaveTime(`${hh}:${mm}:${ss}`);
        }
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, ms);
    return () => window.clearInterval(id);
  }, [autoSaveEnabled, autoSaveIntervalSec, setLastAutoSaveTime]);

  // Global Keyboard Shortcuts (reads live store state via getState() — zero stale closures!)
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const s = useHarmonyStore.getState();
      if (s.showWelcome || s.hsvModalOpen || s.levelsModalOpen || s.blurModalOpen || s.exportModalOpen || s.settingsModalOpen) return;
      if (isTextEditingTarget(e.target)) return;

      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) s.redo();
          else s.undo();
        } else if (k === 'y') {
          if (e.repeat) return;
          e.preventDefault();
          s.toggleGrayscaleMode();
        } else if (k === 'u') {
          if (e.repeat) return;
          e.preventDefault();
          s.setHsvModalOpen(true);
        } else if (k === 'l') {
          if (e.repeat) return;
          e.preventDefault();
          s.setLevelsModalOpen(true);
        } else if (k === 'b' && e.shiftKey) {
          if (e.repeat) return;
          e.preventDefault();
          s.setBlurModalOpen(true);
        } else if (k === 'i' && e.shiftKey) {
          if (e.repeat) return;
          e.preventDefault();
          s.requestInvertSelection();
        } else if (k === 'n') {
          if (e.repeat) return;
          e.preventDefault();
          s.addBlankSceneTab();
        } else if (k === 'r') {
          if (e.repeat) return;
          e.preventDefault();
          s.addLayer();
        } else if (k === 'o') {
          if (e.repeat) return;
          e.preventDefault();
          if (!window.harmonyAPI) return;
          try {
            const res = await window.harmonyAPI.openProject();
            if (!res.canceled && res.content && res.filePath) {
              const parsed = JSON.parse(res.content);
              useHarmonyStore.getState().loadProjectData(parsed, res.filePath);
              try {
                const raw = localStorage.getItem('celsketch_recent_projects');
                const list: string[] = raw ? JSON.parse(raw) : [];
                const updated = [res.filePath, ...list.filter((p) => p !== res.filePath)].slice(0, 12);
                localStorage.setItem('celsketch_recent_projects', JSON.stringify(updated));
              } catch {
                // ignore storage errors
              }
              if (parsed.audioTrackPath && window.harmonyAPI.readAudioByPath) {
                const audioRes = await window.harmonyAPI.readAudioByPath(parsed.audioTrackPath);
                if (!audioRes.canceled && audioRes.bytes && audioRes.name) {
                  const track = await decodeAudioBufferTrack(audioRes.bytes, audioRes.name, audioRes.filePath);
                  if (track) {
                    useHarmonyStore.getState().setAudioTrack(track);
                    useHarmonyStore.setState({ isDirty: false });
                  }
                }
              }
            }
          } catch (err) {
            console.error('Open failed:', err);
          }
        } else if (k === 'c') {
          e.preventDefault();
          s.copyCurrentFrame();
        } else if (k === 'v') {
          // Let ReferenceWindow receive native clipboard image paste when focused/hovered!
          const targetEl = e.target instanceof HTMLElement ? e.target : null;
          const insideRef = Boolean(targetEl?.closest('[data-ref-window]'));
          const refHovered = Boolean(document.querySelector('[data-ref-window="active"]'));
          if (insideRef || refHovered) return;
          e.preventDefault();
          s.pasteToCurrentFrame();
        } else if (k === '=' || k === '+') {
          e.preventDefault();
          s.setZoom(s.zoom * 1.15);
        } else if (k === '-') {
          e.preventDefault();
          s.setZoom(s.zoom * 0.85);
        } else if (k === '0') {
          e.preventDefault();
          s.resetView();
        } else if (k === 's') {
          if (e.repeat) return;
          e.preventDefault();
          if (!window.harmonyAPI) return;
          try {
            const data = JSON.stringify(s.exportProjectData(), null, 2);
            const res = e.shiftKey
              ? await window.harmonyAPI.saveProjectAs(data, s.projectName)
              : await window.harmonyAPI.saveProject(data, s.projectPath, s.projectName);
            if (!res.canceled && res.filePath) {
              const name = res.filePath.split(/[\\/]/).pop()?.replace(/\.(celsketch|nexo|hrm)$/i, '') || s.projectName;
              s.setProjectMeta(name, res.filePath);
              saveProjectThumbnail(res.filePath);
              try {
                const raw = localStorage.getItem('celsketch_recent_projects');
                const list: string[] = raw ? JSON.parse(raw) : [];
                const updated = [res.filePath, ...list.filter((p) => p !== res.filePath)].slice(0, 12);
                localStorage.setItem('celsketch_recent_projects', JSON.stringify(updated));
              } catch {
                // ignore storage errors
              }
            }
          } catch (err) {
            console.error('Save failed:', err);
          }
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        if (e.target instanceof HTMLInputElement && e.target.type === 'range') return;
        e.preventDefault();
        if (e.altKey) s.jumpToNextDrawing();
        else s.nextFrame();
        return;
      }
      if (e.key === 'ArrowLeft') {
        if (e.target instanceof HTMLInputElement && e.target.type === 'range') return;
        e.preventDefault();
        if (e.altKey) s.jumpToPrevDrawing();
        else s.prevFrame();
        return;
      }

      // Customizable shortcuts (Settings -> Atalhos)
      const sc = s.customShortcuts;
      if (matchesShortcutCombo(e, sc.brush_size_inc)) {
        e.preventDefault();
        if (s.activeTool === 'eraser') s.setEraserSize(s.eraserSize + (s.eraserSize >= 20 ? 4 : 2));
        else if (s.activeTool === 'liquify') s.setLiquifySize(s.liquifySize + 10);
        else s.setBrushSize(s.brushSize + (s.brushSize >= 20 ? 4 : 2));
        return;
      }
      if (matchesShortcutCombo(e, sc.brush_size_dec)) {
        e.preventDefault();
        if (s.activeTool === 'eraser') s.setEraserSize(s.eraserSize - (s.eraserSize > 20 ? 4 : 2));
        else if (s.activeTool === 'liquify') s.setLiquifySize(s.liquifySize - 10);
        else s.setBrushSize(s.brushSize - (s.brushSize > 20 ? 4 : 2));
        return;
      }
      if (matchesShortcutCombo(e, sc.toggle_play)) {
        if (!e.repeat) {
          e.preventDefault();
          s.togglePlay();
        }
        return;
      }
      if (matchesShortcutCombo(e, sc.toggle_onion)) {
        if (!e.repeat) {
          e.preventDefault();
          s.toggleOnionSkin();
        }
        return;
      }
      if (matchesShortcutCombo(e, sc.toggle_light_table)) {
        if (!e.repeat) {
          e.preventDefault();
          s.toggleLightTable();
        }
        return;
      }
      if (matchesShortcutCombo(e, sc.toggle_ref)) {
        if (!e.repeat) {
          e.preventDefault();
          s.toggleReferenceWindow();
        }
        return;
      }
      if (matchesShortcutCombo(e, sc.flip_x)) {
        if (!e.repeat) {
          e.preventDefault();
          s.toggleFlipX();
        }
        return;
      }
      if (matchesShortcutCombo(e, sc.reset_view)) {
        e.preventDefault();
        s.resetView();
        return;
      }
      if (matchesShortcutCombo(e, sc.swap_colors)) {
        if (!e.repeat) s.swapColors();
        return;
      }
      if (matchesShortcutCombo(e, sc.crop_mode)) {
        if (!e.repeat) s.setCropMode(!s.cropMode);
        return;
      }
      if (matchesShortcutCombo(e, sc.tool_brush)) { s.setTool('brush'); return; }
      if (matchesShortcutCombo(e, sc.tool_eraser)) { s.setTool('eraser'); return; }
      if (matchesShortcutCombo(e, sc.tool_pencil)) { s.setTool('pencil'); return; }
      if (matchesShortcutCombo(e, sc.tool_paint)) { s.setTool('paint'); return; }
      if (matchesShortcutCombo(e, sc.tool_gradient)) { s.setTool('gradient'); return; }
      if (matchesShortcutCombo(e, sc.tool_lasso)) { s.setTool('lasso'); return; }
      if (matchesShortcutCombo(e, sc.tool_magicwand)) { s.setTool('magicwand'); return; }
      if (matchesShortcutCombo(e, sc.tool_liquify)) { s.setTool('liquify'); return; }
      if (matchesShortcutCombo(e, sc.tool_line)) { s.setTool('line'); return; }
      if (matchesShortcutCombo(e, sc.tool_rectangle)) { s.activateShapeGroup(false); return; }
      if (matchesShortcutCombo(e, sc.tool_ellipse)) { s.setTool('ellipse'); return; }
      if (matchesShortcutCombo(e, sc.tool_text)) { s.setTool('text'); return; }
      if (matchesShortcutCombo(e, sc.tool_eyedropper)) { s.setTool('eyedropper'); return; }
      if (matchesShortcutCombo(e, sc.tool_hand)) { s.setTool('hand'); return; }
      if (matchesShortcutCombo(e, sc.tool_zoom)) { s.setTool('zoom'); return; }

      const lower = e.key.toLowerCase();
      // Special Alt+G shortcut for Polygonal Lasso Fill; ignore other Alt+key combos so menu/Alt-picker never triggers tools!
      if (e.altKey) {
        if (lower === 'g') {
          e.preventDefault();
          s.setTool('polylassofill');
        }
        return;
      }

      switch (lower) {
        case 'q': if (e.shiftKey) s.setTool('polylasso'); break;
        case 'm': s.activateSelectionGroup(e.shiftKey); break;
        case 'g': if (e.shiftKey) s.setTool('lassofill'); break;
        case 'u': if (e.shiftKey) s.activateShapeGroup(true); break;
        case '.':
          s.nextFrame();
          break;
        case ',':
          s.prevFrame();
          break;
        case 'f5':
          e.preventDefault();
          if (e.shiftKey) s.reduceExposureShiftF5();
          else s.extendExposureF5();
          break;
        case 'f6':
          e.preventDefault();
          s.duplicateFrameToNext();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  const recoveryBanner = recoveryOffer ? (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        right: 18,
        zIndex: 9999,
        background: '#1e293b',
        border: '1px solid #3b82f6',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 10px 28px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 340
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e0f2fe' }}>
        Backup de Auto-Save encontrado!
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        Encontramos uma cena salva automaticamente em {new Date(recoveryOffer.mtimeMs).toLocaleString('pt-BR')}. Deseja restaurar?
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          className="icon-btn"
          onClick={() => {
            window.harmonyAPI?.clearRecovery?.();
            setRecoveryOffer(null);
          }}
          style={{ padding: '4px 10px', fontSize: 11 }}
        >
          Descartar
        </button>
        <button
          className="icon-btn active"
          onClick={() => {
            try {
              const parsed = JSON.parse(recoveryOffer.content);
              useHarmonyStore.getState().loadProjectData(parsed, null);
              useHarmonyStore.setState({ isDirty: true });
              window.harmonyAPI?.clearRecovery?.();
              setRecoveryOffer(null);
            } catch (err) {
              console.error('Failed to parse recovery:', err);
              alert('Não foi possível restaurar o backup de recuperação (arquivo corrompido).');
            }
          }}
          style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600 }}
        >
          Restaurar Cena
        </button>
      </div>
    </div>
  ) : null;

  if (showWelcome) {
    return (
      <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#171920' }} />}>
        <WelcomeScreen />
        {recoveryBanner}
        {closeConfirmOpen && (
          <UnsavedCloseModal open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} />
        )}
      </Suspense>
    );
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
              const tabDirty = isActive ? isDirty : scene.isDirty;
              return (
                <div
                  key={scene.id}
                  onClick={() => switchSceneTab(scene.id)}
                  className={`panel-tab ${isActive ? 'active' : ''}`}
                  style={{ gap: 8, paddingRight: 6 }}
                >
                  <span>
                    {scene.name}.celsketch{tabDirty ? ' *' : ''}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tabDirty) {
                        const ok = window.confirm(
                          `A cena "${scene.name}" tem alterações não salvas. Deseja fechar mesmo assim?`
                        );
                        if (!ok) return;
                      }
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
              title="Nova cena em nova aba (Ctrl+N)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#aaa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                height: 23,
                flexShrink: 0
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
      <Suspense fallback={null}>
        <LazyModalHost closeConfirmOpen={closeConfirmOpen} onCloseConfirm={() => setCloseConfirmOpen(false)} />
      </Suspense>
      {recoveryBanner}

      <div className="status-bar">
        <span>
          Tool: <strong>{activeTool.toUpperCase()}</strong> &nbsp;|&nbsp; Layer:{' '}
          <strong>{activeLayer?.name || 'None'}</strong>
        </span>
        <span>
          {lastAutoSaveTime && (
            <span style={{ color: '#4ade80', marginRight: 10 }}>AutoSaved {lastAutoSaveTime}</span>
          )}
          <StatusBarFrame />
        </span>
      </div>
    </div>
  );
};

export default App;
