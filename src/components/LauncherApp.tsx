import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  History,
  Loader2,
  Minus,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  X
} from 'lucide-react';
import type { InstallMode, UpdateCheckResult, UpdateDownloadProgress } from '../types/harmony';

const RECENT_KEY = 'celsketch_recent_projects';
const THUMBS_KEY = 'celsketch_recent_thumbs';
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
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDatePtBr(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

function getParentFolder(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return filePath;
  return parts.slice(-3, -1).join('/');
}

function installModeLabel(mode: InstallMode): string {
  switch (mode) {
    case 'installed':
      return 'Instalado';
    case 'portable':
      return 'Portátil';
    case 'unpacked':
      return 'Build Local';
    default:
      return 'Dev';
  }
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={key++} style={{ color: '#f3f5fa', fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={key++}
          style={{
            background: 'rgba(58, 134, 255, 0.14)',
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

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

const ReleaseNotesView: React.FC<{ notes: string }> = ({ notes }) => {
  const lines = useMemo(() => (notes || '').split(/\r?\n/), [notes]);

  if (!notes.trim()) {
    return (
      <div style={{ color: '#8b92a3', fontSize: 12, lineHeight: 1.6 }}>
        Nenhuma nota de lançamento detalhada disponível para esta versão.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.55, color: '#c4cad6' }}>
      {lines.map((raw, idx) => {
        const line = raw.trim();
        if (!line) return <div key={idx} style={{ height: 4 }} />;
        if (line.startsWith('### ')) {
          return (
            <div
              key={idx}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#7dd3fc',
                marginTop: 6,
                letterSpacing: 0.2
              }}
            >
              {renderInlineMarkdown(line.slice(4))}
            </div>
          );
        }
        if (line.startsWith('## ') || line.startsWith('# ')) {
          const text = line.replace(/^#+\s*/, '');
          return (
            <div
              key={idx}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#f1f5f9',
                marginTop: idx === 0 ? 0 : 8,
                paddingBottom: 3,
                borderBottom: '1px solid rgba(255,255,255,0.06)'
              }}
            >
              {renderInlineMarkdown(text)}
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, paddingLeft: 2 }}>
              <span style={{ color: '#38bdf8', fontWeight: 700, lineHeight: 1.4 }}>•</span>
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
  const [appVersion, setAppVersion] = useState('1.2.0');
  const [installMode, setInstallMode] = useState<InstallMode>('installed');
  const [editorOpen, setEditorOpen] = useState(false);

  const [phase, setPhase] = useState<UpdaterPhase>('checking');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);
  const [shaVerified, setShaVerified] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const [autoLaunchPref, setAutoLaunchPref] = useState(false);
  const [autoLaunchCountdown, setAutoLaunchCountdown] = useState<number | null>(null);
  const autoLaunchCancelledRef = useRef(false);

  const [rightTab, setRightTab] = useState<'notes' | 'recent'>('notes');
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [recentThumbs, setRecentThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (Array.isArray(list)) setRecentProjects(list.slice(0, 8));
      const thumbs = JSON.parse(localStorage.getItem(THUMBS_KEY) || '{}');
      if (thumbs && typeof thumbs === 'object') setRecentThumbs(thumbs);
    } catch {
      // ignore
    }
  }, []);

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
        setRightTab('notes');
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
      setErrorMsg(err?.message || 'Erro ao verificar atualizações.');
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
      if (active) {
        runUpdateCheck(true);
      }
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
    setShaVerified(Boolean(res.sha256Verified));
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
      setErrorMsg(res.error || 'Não foi possível iniciar o instalador.');
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
        background: 'radial-gradient(circle at 12% 10%, #1e293b 0%, #16181d 46%, #121318 100%)',
        color: '#e5e7eb',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)'
      }}
    >
      <style>{`
        @keyframes celsketch-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .cs-spin { animation: celsketch-spin 1s linear infinite; }
        .cs-btn {
          transition: transform 0.12s ease, background 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
          cursor: pointer;
        }
        .cs-btn:hover:not(:disabled) { filter: brightness(1.09); }
        .cs-btn:active:not(:disabled) { transform: scale(0.985); }
        .cs-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .cs-recent-card:hover {
          background: rgba(56, 189, 248, 0.10) !important;
          border-color: rgba(56, 189, 248, 0.35) !important;
        }
      `}</style>

      {/* Top Frameless Titlebar */}
      <div
        className="drag-region"
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px 0 14px',
          background: 'rgba(15, 17, 22, 0.72)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <img
            src="./icon.png"
            alt="CelSketch"
            style={{ width: 20, height: 20, borderRadius: 5, objectFit: 'cover' }}
          />
          <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: 0.3, color: '#f3f4f6' }}>
            CelSketch Launcher
          </span>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 99,
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#7dd3fc',
              border: '1px solid rgba(56, 189, 248, 0.25)'
            }}
          >
            v{appVersion}
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 99,
              background: 'rgba(255,255,255,0.06)',
              color: '#9ca3af'
            }}
          >
            {installModeLabel(installMode)}
          </span>
        </div>

        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            className="cs-btn"
            title="Minimizar"
            onClick={() => window.harmonyAPI?.minimize()}
            style={{
              width: 32,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Minus size={14} />
          </button>
          <button
            className="cs-btn"
            title="Fechar Launcher"
            onClick={() => window.harmonyAPI?.close()}
            style={{
              width: 32,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#9ca3af',
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
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main 2-Column Content */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1.18fr 1fr',
          gap: 18,
          padding: 20,
          minHeight: 0
        }}
      >
        {/* Left Column: Hero + Auto-Updater + Launch Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, minHeight: 0 }}>
          {/* Hero Header */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.72) 0%, rgba(22, 24, 31, 0.92) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}
          >
            <img
              src="./icon.png"
              alt="CelSketch Logo"
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                flexShrink: 0
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', letterSpacing: -0.3 }}>
                CelSketch
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Estúdio de Animação 2D & Desenho Digital
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                  Instalado: <strong>v{appVersion}</strong>
                </span>
                {updateInfo && !updateInfo.error && (
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    • Última: <strong style={{ color: updateInfo.updateAvailable ? '#38bdf8' : '#34d399' }}>v{updateInfo.latestVersion}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Update Status Card */}
          <div
            style={{
              flex: 1,
              padding: '16px 18px',
              borderRadius: 14,
              background:
                phase === 'available' || phase === 'ready'
                  ? 'linear-gradient(160deg, rgba(14, 165, 233, 0.14) 0%, rgba(16, 185, 129, 0.08) 100%)'
                  : 'rgba(255,255,255,0.03)',
              border:
                phase === 'available' || phase === 'ready'
                  ? '1px solid rgba(56, 189, 248, 0.35)'
                  : '1px solid rgba(255,255,255,0.07)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 12
            }}
          >
            {phase === 'checking' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Loader2 size={22} color="#38bdf8" className="cs-spin" />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f1f5f9' }}>
                    Verificando atualizações...
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                    Consultando a última versão oficial do CelSketch no GitHub.
                  </div>
                </div>
              </div>
            )}

            {phase === 'up-to-date' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle2 size={22} color="#34d399" />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#ecfdf5' }}>
                        Você está na versão mais recente!
                      </div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                        CelSketch v{appVersion} pronto para animar.
                      </div>
                    </div>
                  </div>
                  <button
                    className="cs-btn"
                    onClick={() => runUpdateCheck(false)}
                    title="Verificar novamente"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#cbd5e1',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  >
                    <RefreshCw size={12} />
                    Verificar
                  </button>
                </div>

                {autoLaunchCountdown !== null && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      fontSize: 11.5,
                      color: '#bae6fd'
                    }}
                  >
                    <span>Abrindo o editor automaticamente em {autoLaunchCountdown}s...</span>
                    <button
                      className="cs-btn"
                      onClick={cancelAutoLaunch}
                      style={{
                        border: 'none',
                        background: 'rgba(255,255,255,0.12)',
                        color: '#fff',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}

            {phase === 'available' && updateInfo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(56, 189, 248, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#38bdf8',
                      flexShrink: 0
                    }}
                  >
                    <Sparkles size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
                      Nova versão disponível: v{updateInfo.latestVersion}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#bae6fd', marginTop: 2 }}>
                      {updateInfo.assetSize > 0
                        ? `Download oficial: ${formatBytes(updateInfo.assetSize)} • Atualização automática`
                        : 'Nova atualização pronta para baixar'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="cs-btn"
                    onClick={handleDownloadUpdate}
                    style={{
                      flex: 1,
                      height: 38,
                      borderRadius: 9,
                      border: 'none',
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: 12.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      boxShadow: '0 4px 16px rgba(14, 165, 233, 0.35)'
                    }}
                  >
                    <Download size={15} />
                    Baixar Atualização (v{updateInfo.latestVersion})
                  </button>
                </div>
              </div>
            )}

            {phase === 'downloading' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={16} color="#38bdf8" className="cs-spin" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                      {progress?.stage === 'verifying'
                        ? 'Verificando integridade (SHA-256)...'
                        : `Baixando CelSketch v${updateInfo?.latestVersion}...`}
                    </span>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#38bdf8' }}>
                    {progress?.percent ?? 0}%
                  </span>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: 9,
                    borderRadius: 99,
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(3, progress?.percent ?? 0)}%`,
                      height: '100%',
                      borderRadius: 99,
                      background: 'linear-gradient(90deg, #0ea5e9 0%, #34d399 100%)',
                      transition: 'width 0.14s ease-out'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>
                    {formatBytes(progress?.downloadedBytes || 0)}
                    {progress?.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ''}
                    {progress?.speedBytesPerSec ? ` • ${formatBytes(progress.speedBytesPerSec)}/s` : ''}
                  </span>
                  <button
                    className="cs-btn"
                    onClick={handleCancelDownload}
                    style={{
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#cbd5e1',
                      borderRadius: 6,
                      padding: '3px 9px',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {phase === 'ready' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={24} color="#34d399" />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#ecfdf5' }}>
                      Atualização v{updateInfo?.latestVersion} pronta para instalar!
                    </div>
                    <div style={{ fontSize: 11, color: '#a7f3d0', marginTop: 2 }}>
                      {shaVerified
                        ? 'Integridade SHA-256 verificada ✓ • O CelSketch será reiniciado automaticamente.'
                        : 'Download concluído • O CelSketch será atualizado e reiniciado.'}
                    </div>
                  </div>
                </div>
                {errorMsg && (
                  <div style={{ fontSize: 11.5, color: '#fca5a5', background: 'rgba(220,38,38,0.16)', padding: '6px 9px', borderRadius: 7 }}>
                    {errorMsg}
                  </div>
                )}
                <button
                  className="cs-btn"
                  onClick={handleInstallNow}
                  style={{
                    height: 38,
                    borderRadius: 9,
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: 12.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  <Rocket size={15} />
                  Instalar e Reiniciar Agora
                </button>
              </div>
            )}

            {phase === 'installing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Loader2 size={22} color="#34d399" className="cs-spin" />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#ecfdf5' }}>
                    Aplicando atualização...
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                    O CelSketch vai fechar por alguns segundos e reabrir já atualizado.
                  </div>
                </div>
              </div>
            )}

            {phase === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <AlertTriangle size={20} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fef3c7' }}>
                      Não foi possível concluir a atualização
                    </div>
                    <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 2, lineHeight: 1.45 }}>
                      {errorMsg || 'Verifique sua conexão com a internet.'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="cs-btn"
                    onClick={() => runUpdateCheck(false)}
                    style={{
                      flex: 1,
                      height: 32,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.06)',
                      color: '#f1f5f9',
                      fontSize: 11.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <RefreshCw size={12} />
                    Tentar novamente
                  </button>
                  <button
                    className="cs-btn"
                    onClick={() => window.harmonyAPI?.openExternal(updateInfo?.htmlUrl || RELEASES_URL)}
                    style={{
                      height: 32,
                      padding: '0 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'transparent',
                      color: '#93c5fd',
                      fontSize: 11.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5
                    }}
                  >
                    <ExternalLink size={12} />
                    GitHub
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Primary Launch Buttons + Preference */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="cs-btn"
                disabled={launching || isBusyUpdating}
                onClick={() => handleLaunchEditor(null)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 11,
                  border: 'none',
                  background:
                    phase === 'available'
                      ? 'rgba(255,255,255,0.10)'
                      : 'linear-gradient(135deg, #3a86ff 0%, #2563eb 100%)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow:
                    phase === 'available' ? 'none' : '0 6px 20px rgba(58, 134, 255, 0.35)'
                }}
              >
                {launching ? <Loader2 size={16} className="cs-spin" /> : <Play size={16} fill="currentColor" />}
                {launching
                  ? 'Abrindo CelSketch...'
                  : editorOpen
                  ? 'Voltar ao Editor'
                  : phase === 'available'
                  ? 'Abrir sem atualizar'
                  : 'Abrir CelSketch'}
              </button>

              <button
                className="cs-btn"
                disabled={launching || isBusyUpdating}
                onClick={handlePickProject}
                title="Escolher arquivo .celsketch para abrir diretamente"
                style={{
                  height: 46,
                  padding: '0 14px',
                  borderRadius: 11,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#e2e8f0',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7
                }}
              >
                <FolderOpen size={15} />
                Abrir Arquivo
              </button>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11.5,
                color: '#94a3b8',
                cursor: 'pointer',
                paddingLeft: 2
              }}
            >
              <input
                type="checkbox"
                checked={autoLaunchPref}
                onChange={(e) => handleToggleAutoLaunch(e.target.checked)}
                style={{ accentColor: '#3a86ff', width: 14, height: 14, cursor: 'pointer' }}
              />
              <span>Abrir o editor automaticamente quando já estiver na última versão</span>
            </label>
          </div>
        </div>

        {/* Right Column: Release Notes & Recent Projects */}
        <div
          style={{
            borderRadius: 14,
            background: 'rgba(15, 17, 22, 0.65)',
            border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          {/* Tabs Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="cs-btn"
                onClick={() => setRightTab('notes')}
                style={{
                  padding: '5px 11px',
                  borderRadius: 8,
                  border: 'none',
                  background: rightTab === 'notes' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  color: rightTab === 'notes' ? '#7dd3fc' : '#94a3b8',
                  fontSize: 11.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <Sparkles size={13} />
                Novidades
              </button>
              <button
                className="cs-btn"
                onClick={() => setRightTab('recent')}
                style={{
                  padding: '5px 11px',
                  borderRadius: 8,
                  border: 'none',
                  background: rightTab === 'recent' ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  color: rightTab === 'recent' ? '#7dd3fc' : '#94a3b8',
                  fontSize: 11.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <History size={13} />
                Recentes ({recentProjects.length})
              </button>
            </div>

            <button
              className="cs-btn"
              title="Abrir página de releases no GitHub"
              onClick={() => window.harmonyAPI?.openExternal(updateInfo?.htmlUrl || RELEASES_URL)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11
              }}
            >
              GitHub
              <ExternalLink size={11} />
            </button>
          </div>

          {/* Tab Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
            {rightTab === 'notes' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>
                    {updateInfo?.releaseName || `CelSketch v${appVersion}`}
                  </span>
                  {updateInfo?.publishedAt && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      {formatDatePtBr(updateInfo.publishedAt)}
                    </span>
                  )}
                </div>
                {phase === 'checking' && !updateInfo ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12, paddingTop: 12 }}>
                    <Loader2 size={14} className="cs-spin" />
                    Carregando notas da versão...
                  </div>
                ) : (
                  <ReleaseNotesView notes={updateInfo?.releaseNotes || ''} />
                )}
              </div>
            ) : recentProjects.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#64748b',
                  textAlign: 'center'
                }}
              >
                <FolderOpen size={28} strokeWidth={1.5} />
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>
                  Nenhum projeto recente ainda
                </div>
                <div style={{ fontSize: 11 }}>
                  Seus projetos `.celsketch` salvos aparecerão aqui para acesso rápido.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentProjects.map((fp) => {
                  const thumb = recentThumbs[fp];
                  return (
                    <button
                      key={fp}
                      className="cs-btn cs-recent-card"
                      disabled={launching || isBusyUpdating}
                      onClick={() => handleLaunchEditor(fp)}
                      style={{
                        width: '100%',
                        padding: 8,
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.025)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        textAlign: 'left',
                        color: '#e2e8f0'
                      }}
                    >
                      <div
                        style={{
                          width: 58,
                          height: 36,
                          borderRadius: 6,
                          overflow: 'hidden',
                          background: '#222630',
                          border: '1px solid rgba(255,255,255,0.08)',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <FolderOpen size={15} color="#64748b" />
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#f1f5f9',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {getFileName(fp)}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: 2
                          }}
                        >
                          {getParentFolder(fp)}
                        </div>
                      </div>
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

export default LauncherApp;
