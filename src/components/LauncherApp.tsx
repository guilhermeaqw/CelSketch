import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Minus,
  Play,
  RefreshCw,
  Rocket,
  X
} from 'lucide-react';
import type { InstallMode, UpdateCheckResult, UpdateDownloadProgress } from '../types/harmony';

const RELEASES_URL = 'https://github.com/guilhermeaqw/CelSketch/releases/latest';

type UpdaterPhase =
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      tokens.push(
        <strong key={key++} style={{ color: '#f1f5f9', fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      tokens.push(
        <code
          key={key++}
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: '#93c5fd',
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'Consolas, monospace'
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return tokens;
}

const CompactNotes: React.FC<{ notes: string }> = ({ notes }) => {
  const lines = useMemo(() => (notes || '').split(/\r?\n/), [notes]);
  if (!notes.trim()) {
    return <div style={{ color: '#64748b', fontSize: 12 }}>Sem notas de lançamento disponíveis.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, lineHeight: 1.55, color: '#cbd5e1' }}>
      {lines.map((raw, idx) => {
        const line = raw.trim();
        if (!line) return <div key={idx} style={{ height: 3 }} />;
        if (line.startsWith('### ')) {
          return (
            <div key={idx} style={{ fontSize: 12, fontWeight: 700, color: '#7dd3fc', marginTop: 6 }}>
              {renderInlineMarkdown(line.slice(4))}
            </div>
          );
        }
        if (line.startsWith('## ') || line.startsWith('# ')) {
          return (
            <div key={idx} style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginTop: idx === 0 ? 0 : 8 }}>
              {renderInlineMarkdown(line.replace(/^#+\s*/, ''))}
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={idx} style={{ display: 'flex', gap: 7, paddingLeft: 2 }}>
              <span style={{ color: '#38bdf8' }}>•</span>
              <span>{renderInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        return <div key={idx}>{renderInlineMarkdown(line)}</div>;
      })}
    </div>
  );
};

export const LauncherApp: React.FC = () => {
  const [appVersion, setAppVersion] = useState('1.2.3');
  const [installMode, setInstallMode] = useState<InstallMode>('installed');
  const [editorOpen, setEditorOpen] = useState(false);

  const [phase, setPhase] = useState<UpdaterPhase>('checking');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);

  const [autoLaunchPref, setAutoLaunchPref] = useState(false);
  const [autoLaunchCountdown, setAutoLaunchCountdown] = useState<number | null>(null);
  const autoLaunchCancelledRef = useRef(false);

  const runUpdateCheck = async (allowAutoLaunch = false) => {
    const api = window.harmonyAPI;
    if (!api?.checkForUpdates) {
      setPhase('up-to-date');
      return;
    }
    setPhase('checking');
    setErrorMsg(null);
    setProgress(null);

    try {
      const res = await api.checkForUpdates();
      setUpdateInfo(res);
      setAppVersion(res.currentVersion || appVersion);
      setInstallMode(res.installMode || installMode);

      if (res.error) {
        setErrorMsg(res.error);
        setPhase('error');
        return;
      }

      if (res.updateAvailable) {
        setPhase('available');
      } else {
        setPhase('up-to-date');
        if (allowAutoLaunch && !autoLaunchCancelledRef.current) {
          const prefs = await api.getLauncherPrefs?.();
          const info = await api.getAppInfo?.();
          if (prefs?.autoLaunchIfUpToDate && !info?.editorOpen) {
            setAutoLaunchCountdown(2);
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível verificar atualizações.');
      setPhase('error');
    }
  };

  useEffect(() => {
    let active = true;
    const api = window.harmonyAPI;

    (async () => {
      if (api?.getAppInfo) {
        const info = await api.getAppInfo();
        if (!active) return;
        setAppVersion(info.version);
        setInstallMode(info.installMode);
        setEditorOpen(info.editorOpen);
      }
      if (api?.getLauncherPrefs) {
        const prefs = await api.getLauncherPrefs();
        if (!active) return;
        setAutoLaunchPref(Boolean(prefs?.autoLaunchIfUpToDate));
      }
      if (active) runUpdateCheck(true);
    })();

    const unsubProgress = api?.onUpdateProgress?.((p) => {
      if (active) setProgress(p);
    });
    return () => {
      active = false;
      unsubProgress?.();
    };
  }, []);

  useEffect(() => {
    if (autoLaunchCountdown === null) return;
    if (autoLaunchCountdown <= 0) {
      handleLaunchEditor();
      return;
    }
    const id = window.setTimeout(() => {
      setAutoLaunchCountdown((prev) => (prev === null ? null : prev - 1));
    }, 900);
    return () => window.clearTimeout(id);
  }, [autoLaunchCountdown]);

  const cancelAutoLaunch = () => {
    autoLaunchCancelledRef.current = true;
    setAutoLaunchCountdown(null);
  };

  const handleToggleAutoLaunch = async (checked: boolean) => {
    setAutoLaunchPref(checked);
    cancelAutoLaunch();
    await window.harmonyAPI?.setLauncherPrefs?.({ autoLaunchIfUpToDate: checked });
  };

  const handleLaunchEditor = async (projectPath?: string | null) => {
    if (launching) return;
    cancelAutoLaunch();
    setLaunching(true);
    try {
      await window.harmonyAPI?.launchEditor?.({ projectPath: projectPath || null });
    } catch {
      setLaunching(false);
    }
  };

  const handlePickProject = async () => {
    cancelAutoLaunch();
    const res = await window.harmonyAPI?.pickProjectFile?.();
    if (res && !res.canceled && res.filePath) {
      await handleLaunchEditor(res.filePath);
    }
  };

  const handleDownloadUpdate = async () => {
    cancelAutoLaunch();
    if (!updateInfo?.assetUrl || !updateInfo.assetName || !window.harmonyAPI?.downloadUpdate) {
      window.harmonyAPI?.openExternal(updateInfo?.htmlUrl || RELEASES_URL);
      return;
    }
    setPhase('downloading');
    setErrorMsg(null);
    setProgress({
      percent: 0,
      downloadedBytes: 0,
      totalBytes: updateInfo.assetSize || 0,
      speedBytesPerSec: 0,
      stage: 'downloading'
    });

    const res = await window.harmonyAPI.downloadUpdate(
      updateInfo.assetUrl,
      updateInfo.assetName,
      updateInfo.assetSha256
    );

    if (res.canceled) {
      setPhase('available');
      setProgress(null);
      return;
    }
    if (!res.ok || !res.filePath) {
      setErrorMsg(res.error || 'Falha ao baixar atualização.');
      setPhase('error');
      return;
    }

    setDownloadedPath(res.filePath);

    // Automatically apply the downloaded update & restart in 1 seamless click (no extra "Instalar" prompt!)
    if (window.harmonyAPI?.installUpdate) {
      setPhase('installing');
      const installRes = await window.harmonyAPI.installUpdate(res.filePath, installMode);
      if (!installRes.ok) {
        setErrorMsg(installRes.error || 'Não foi possível aplicar a atualização.');
        setPhase(installRes.needsSave ? 'ready' : 'error');
      }
      return;
    }

    setPhase('ready');
  };

  const handleCancelDownload = async () => {
    await window.harmonyAPI?.cancelDownload?.();
    setPhase('available');
    setProgress(null);
  };

  const handleInstallNow = async () => {
    if (!downloadedPath || !window.harmonyAPI?.installUpdate) return;
    setPhase('installing');
    setErrorMsg(null);
    const res = await window.harmonyAPI.installUpdate(downloadedPath, installMode);
    if (!res.ok) {
      setErrorMsg(res.error || 'Não foi possível aplicar a atualização.');
      setPhase(res.needsSave ? 'ready' : 'error');
    }
  };

  const isBusyUpdating = phase === 'downloading' || phase === 'installing';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'radial-gradient(circle at 50% -15%, #1d283a 0%, #13151a 52%, #101116 100%)',
        color: '#e5e7eb',
        border: '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <style>{`
        @keyframes celsketch-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .cs-spin { animation: celsketch-spin 1s linear infinite; }
        .cs-btn {
          transition: opacity 0.14s ease, transform 0.12s ease, background 0.15s ease, filter 0.15s ease;
          cursor: pointer;
        }
        .cs-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .cs-btn:active:not(:disabled) { transform: scale(0.985); }
        .cs-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .cs-ghost {
          border: none;
          background: transparent;
          color: #8b95a7;
          font-size: 11.5px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .cs-ghost:hover:not(:disabled) {
          color: #e2e8f0;
          background: rgba(255,255,255,0.06);
        }
      `}</style>

      {/* Ultra-minimal Frameless Top Bar */}
      <div
        className="drag-region"
        style={{
          height: 38,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 8px',
          flexShrink: 0
        }}
      >
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            className="cs-btn"
            title="Minimizar"
            onClick={() => window.harmonyAPI?.minimize()}
            style={{
              width: 30,
              height: 26,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Minus size={14} />
          </button>
          <button
            className="cs-btn"
            title="Fechar"
            onClick={() => window.harmonyAPI?.close()}
            style={{
              width: 30,
              height: 26,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#dc2626';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Centered Minimal Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 36px 24px',
          gap: 22
        }}
      >
        {/* Brand Identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <img
            src="./icon.png"
            alt="CelSketch"
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              boxShadow: '0 14px 36px rgba(0, 0, 0, 0.55)'
            }}
          />
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', letterSpacing: -0.4 }}>
              CelSketch
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              v{appVersion}
            </div>
          </div>
        </div>

        {/* Clean Update Status Area */}
        <div style={{ width: '100%', minHeight: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {phase === 'checking' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12 }}>
              <Loader2 size={14} color="#38bdf8" className="cs-spin" />
              <span>Verificando atualizações...</span>
            </div>
          )}

          {phase === 'up-to-date' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399', fontSize: 12, fontWeight: 600 }}>
                <Check size={14} strokeWidth={2.5} />
                <span>Atualizado</span>
              </div>
              {autoLaunchCountdown !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#94a3b8' }}>
                  <span>Abrindo em {autoLaunchCountdown}s...</span>
                  <button className="cs-ghost" onClick={cancelAutoLaunch} style={{ padding: '2px 6px', color: '#cbd5e1' }}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'available' && updateInfo && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: '#7dd3fc', fontWeight: 600 }}>
                Nova versão v{updateInfo.latestVersion} disponível
                {updateInfo.assetSize > 0 ? ` • ${formatBytes(updateInfo.assetSize)}` : ''}
              </div>
              <button
                className="cs-btn"
                onClick={handleDownloadUpdate}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 11,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                  color: '#ffffff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 8px 22px rgba(14, 165, 233, 0.3)'
                }}
              >
                <Download size={16} />
                Atualizar para v{updateInfo.latestVersion}
              </button>
            </div>
          )}

          {phase === 'downloading' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#cbd5e1' }}>
                <span>
                  {progress?.stage === 'verifying'
                    ? 'Verificando arquivo...'
                    : `Baixando v${updateInfo?.latestVersion}...`}
                </span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{progress?.percent ?? 0}%</span>
              </div>
              <div style={{ width: '100%', height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.max(3, progress?.percent ?? 0)}%`,
                    height: '100%',
                    borderRadius: 99,
                    background: 'linear-gradient(90deg, #0ea5e9, #34d399)',
                    transition: 'width 0.14s ease-out'
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                <span>
                  {formatBytes(progress?.downloadedBytes || 0)}
                  {progress?.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ''}
                  {progress?.speedBytesPerSec ? ` • ${formatBytes(progress.speedBytesPerSec)}/s` : ''}
                </span>
                <button className="cs-ghost" onClick={handleCancelDownload} style={{ padding: '2px 6px' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {phase === 'ready' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {errorMsg && (
                <div style={{ fontSize: 11.5, color: '#fca5a5', textAlign: 'center' }}>{errorMsg}</div>
              )}
              <button
                className="cs-btn"
                onClick={handleInstallNow}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 11,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 8px 22px rgba(16, 185, 129, 0.3)'
                }}
              >
                <Rocket size={16} />
                Instalar e Reiniciar
              </button>
            </div>
          )}

          {phase === 'installing' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#34d399', fontSize: 12.5, fontWeight: 600 }}>
              <Loader2 size={15} className="cs-spin" />
              <span>Instalando atualização...</span>
            </div>
          )}

          {phase === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24', fontSize: 11.5 }}>
                <AlertCircle size={14} />
                <span>{errorMsg || 'Sem conexão com o GitHub'}</span>
              </div>
              <button className="cs-ghost" onClick={() => runUpdateCheck(false)} style={{ color: '#93c5fd' }}>
                <RefreshCw size={12} />
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* Main Launch CTA */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {phase !== 'available' && phase !== 'ready' ? (
            <button
              className="cs-btn"
              disabled={launching || isBusyUpdating}
              onClick={() => handleLaunchEditor(null)}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 11,
                border: 'none',
                background: 'linear-gradient(135deg, #3a86ff 0%, #2563eb 100%)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 8px 24px rgba(58, 134, 255, 0.32)'
              }}
            >
              {launching ? <Loader2 size={16} className="cs-spin" /> : <Play size={15} fill="currentColor" />}
              {launching ? 'Abrindo...' : editorOpen ? 'Voltar ao Editor' : 'Abrir CelSketch'}
            </button>
          ) : (
            <button
              className="cs-ghost"
              disabled={launching || isBusyUpdating}
              onClick={() => handleLaunchEditor(null)}
              style={{ fontSize: 12, color: '#94a3b8' }}
            >
              {editorOpen ? 'Voltar ao Editor' : 'Abrir sem atualizar'}
            </button>
          )}

          {/* Subtle Secondary Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="cs-ghost" disabled={launching || isBusyUpdating} onClick={handlePickProject}>
              <FolderOpen size={13} />
              Abrir arquivo
            </button>
            <span style={{ color: '#334155' }}>•</span>
            <button
              className="cs-ghost"
              disabled={!updateInfo?.releaseNotes}
              onClick={() => setShowNotesModal(true)}
            >
              <FileText size={13} />
              Novidades
            </button>
            <span style={{ color: '#334155' }}>•</span>
            <button className="cs-ghost" disabled={isBusyUpdating || phase === 'checking'} onClick={() => runUpdateCheck(false)}>
              <RefreshCw size={12} />
              Verificar
            </button>
          </div>
        </div>
      </div>

      {/* Minimal Footer Preference */}
      <div
        style={{
          padding: '10px 18px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11,
            color: '#64748b',
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={autoLaunchPref}
            onChange={(e) => handleToggleAutoLaunch(e.target.checked)}
            style={{ accentColor: '#3a86ff', width: 13, height: 13, cursor: 'pointer' }}
          />
          <span>Abrir direto quando atualizado</span>
        </label>
      </div>

      {/* Optional On-Demand Release Notes Overlay */}
      {showNotesModal && (
        <div
          onClick={() => setShowNotesModal(false)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10, 12, 16, 0.84)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '100%',
              background: '#181b22',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                {updateInfo?.releaseName || `CelSketch v${appVersion}`}
              </span>
              <button
                className="cs-ghost"
                onClick={() => setShowNotesModal(false)}
                style={{ padding: 4 }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: '14px 16px', overflowY: 'auto', maxHeight: 340 }}>
              <CompactNotes notes={updateInfo?.releaseNotes || ''} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LauncherApp;
