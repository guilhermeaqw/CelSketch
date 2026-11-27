import React from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Trash2, Video } from 'lucide-react';

export interface TitleBarPopoversProps {
  openPopover: { kind: 'guides' | 'rec'; left: number; top: number } | null;
  onClose: () => void;
  showGrid: boolean;
  symmetryMode: 'none' | 'vertical';
  perspectiveMode: 0 | 1 | 2 | 3 | 4;
  onToggleGrid: () => void;
  onToggleSymmetry: () => void;
  onSetPerspectiveMode: (mode: 0 | 1 | 2 | 3 | 4) => void;
  timelapseRecording: boolean;
  timelapseRootDir: string | null;
  timelapseCount: number;
  timelapseBusy: boolean;
  onToggleRecording: () => void;
  onSetTimelapseRootDir: (dir: string) => void;
  onExportTimelapse: () => void;
  onClearTimelapse: () => void;
}

export const TitleBarPopovers: React.FC<TitleBarPopoversProps> = ({
  openPopover,
  onClose,
  showGrid,
  symmetryMode,
  perspectiveMode,
  onToggleGrid,
  onToggleSymmetry,
  onSetPerspectiveMode,
  timelapseRecording,
  timelapseRootDir,
  timelapseCount,
  timelapseBusy,
  onToggleRecording,
  onSetTimelapseRootDir,
  onExportTimelapse,
  onClearTimelapse
}) => {
  if (!openPopover) return null;

  return createPortal(
    <div
      data-tb-popover="true"
      style={{
        position: 'fixed',
        left: openPopover.left,
        top: openPopover.top,
        width: openPopover.kind === 'rec' ? 250 : 215,
        background: '#252830',
        border: '1px solid #3f4452',
        borderRadius: 8,
        padding: 6,
        boxShadow: '0 10px 28px rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }}
    >
      {openPopover.kind === 'guides' && (
        <>
          <div style={{ padding: '3px 8px', fontSize: 10, color: '#8e96a8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Guias de Desenho
          </div>
          <button className="dropdown-item" onClick={onToggleGrid}>
            <span>Grade 12-Field</span>
            <span style={{ color: '#60a5fa' }}>{showGrid ? '✓' : ''}</span>
          </button>
          <button className="dropdown-item" onClick={onToggleSymmetry}>
            <span>Simetria Vertical</span>
            <span style={{ color: '#60a5fa' }}>{symmetryMode === 'vertical' ? '✓' : ''}</span>
          </button>
          <div className="dropdown-sep" />
          <div style={{ padding: '3px 8px', fontSize: 10, color: '#8e96a8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Régua de Perspectiva
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: '2px 6px 4px' }}>
            {([
              { v: 0, l: 'Off' },
              { v: 1, l: '1P' },
              { v: 2, l: '2P' },
              { v: 3, l: '3P' },
              { v: 4, l: 'Eye' }
            ] as const).map((opt) => (
              <button
                key={opt.v}
                onClick={() => onSetPerspectiveMode(opt.v)}
                style={{
                  padding: '4px 0',
                  borderRadius: 4,
                  border: perspectiveMode === opt.v ? '1px solid #3a86ff' : '1px solid #3d4250',
                  background: perspectiveMode === opt.v ? 'rgba(58,134,255,0.22)' : '#1d2027',
                  color: perspectiveMode === opt.v ? '#dbeafe' : '#bbb',
                  fontSize: 10.5,
                  cursor: 'pointer'
                }}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </>
      )}

      {openPopover.kind === 'rec' && (
        <>
          <div style={{ padding: '3px 8px', fontSize: 10, color: '#8e96a8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Gravação / Timelapse
          </div>
          <button
            className="dropdown-item"
            onClick={async () => {
              if (!timelapseRecording) {
                if (!timelapseRootDir && window.harmonyAPI?.pickDirectory) {
                  const res = await window.harmonyAPI.pickDirectory('Escolha a pasta onde gravar os processos (Auto-Rec)');
                  if (res.canceled || !res.dirPath) return;
                  onSetTimelapseRootDir(res.dirPath);
                }
                onToggleRecording();
              } else {
                onToggleRecording();
              }
              onClose();
            }}
            style={{ color: timelapseRecording ? '#fca5a5' : '#e5e7eb', fontWeight: 600 }}
          >
            <span>{timelapseRecording ? '■ Parar Gravação (Auto-Rec)' : '● Iniciar Gravação (Auto-Rec)'}</span>
          </button>
          <button
            className="dropdown-item"
            onClick={async () => {
              const res = await window.harmonyAPI?.pickDirectory('Escolha a pasta onde gravar os processos (Auto-Rec)');
              if (res && !res.canceled && res.dirPath) {
                onSetTimelapseRootDir(res.dirPath);
              }
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FolderOpen size={12} /> {timelapseRootDir ? 'Trocar Pasta do Auto-Rec...' : 'Escolher Pasta...'}
            </span>
          </button>
          {timelapseRootDir && (
            <button
              className="dropdown-item"
              onClick={() => {
                window.harmonyAPI?.openPath(timelapseRootDir);
                onClose();
              }}
              title={timelapseRootDir}
            >
              <span style={{ fontSize: 10.5, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Abrir: {timelapseRootDir}
              </span>
            </button>
          )}
          <div className="dropdown-sep" />
          <button
            className="dropdown-item"
            disabled={timelapseCount === 0 || timelapseBusy}
            style={{ opacity: timelapseCount === 0 || timelapseBusy ? 0.45 : 1 }}
            onClick={() => {
              onClose();
              onExportTimelapse();
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Video size={12} /> {timelapseBusy ? 'Exportando...' : `Exportar Timelapse (${timelapseCount})`}
            </span>
          </button>
          {timelapseCount > 0 && (
            <button
              className="dropdown-item"
              disabled={timelapseBusy}
              onClick={() => {
                onClearTimelapse();
                onClose();
              }}
              style={{ color: '#f87171' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={12} /> Limpar Frames Gravados
              </span>
            </button>
          )}
        </>
      )}
    </div>,
    document.body
  );
};
