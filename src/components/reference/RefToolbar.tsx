import React from 'react';
import {
  ImagePlus,
  Pipette,
  Trash2,
  X,
  FlipHorizontal2,
  Type,
  ExternalLink,
  Pin,
  PinOff,
  Group,
  Ungroup,
  LayoutGrid,
  Maximize2,
  Contrast,
  Minus,
  Square
} from 'lucide-react';
import { NOTE_PALETTE, type RefItem } from './types';

export interface RefToolbarProps {
  standalone: boolean;
  selectedCount: number;
  selectedHasGrouped: boolean;
  singleSelectedText: RefItem | null;
  dropperMode: boolean;
  grayscaleBoard: boolean;
  winOpacity: number;
  alwaysOnTop: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onStartWindowDrag: (e: React.PointerEvent) => void;
  onReadFiles: (files: FileList) => void;
  onAddTextNote: () => void;
  onToggleDropper: () => void;
  onToggleGrayscale: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onFlipSelected: () => void;
  onDeleteSelected: () => void;
  onAutoPackGrid: () => void;
  onFitAll: () => void;
  onChangeOpacity: (v: number) => void;
  onToggleAlwaysOnTop: () => void;
  onPopOut: () => void;
  onCloseDocked: () => void;
  onUpdateTextNote: (id: string, patch: Partial<RefItem>) => void;
}

export const RefToolbar: React.FC<RefToolbarProps> = ({
  standalone,
  selectedCount,
  selectedHasGrouped,
  singleSelectedText,
  dropperMode,
  grayscaleBoard,
  winOpacity,
  alwaysOnTop,
  fileInputRef,
  onStartWindowDrag,
  onReadFiles,
  onAddTextNote,
  onToggleDropper,
  onToggleGrayscale,
  onGroupSelected,
  onUngroupSelected,
  onFlipSelected,
  onDeleteSelected,
  onAutoPackGrid,
  onFitAll,
  onChangeOpacity,
  onToggleAlwaysOnTop,
  onPopOut,
  onCloseDocked,
  onUpdateTextNote
}) => (
  <>
    <div
      className={standalone ? 'drag-region' : undefined}
      onPointerDown={onStartWindowDrag}
      style={{
        height: 30,
        background: '#1e212a',
        borderBottom: '1px solid #2d3240',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 6px',
        cursor: standalone ? 'default' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        gap: 4,
        flexShrink: 0
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 3 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#e5e7eb' }}>Referência</span>
        {selectedCount > 1 && (
          <span
            style={{
              fontSize: 10,
              color: '#93c5fd',
              background: 'rgba(58,134,255,0.18)',
              padding: '0 5px',
              borderRadius: 99
            }}
          >
            {selectedCount} sel.
          </span>
        )}
      </div>

      <div
        className={standalone ? 'no-drag' : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 2 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime,.gif,.mp4,.webm,.mov"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) onReadFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          className="icon-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Adicionar Imagem, GIF ou Vídeo MP4 (ou arraste / Ctrl+V)"
          style={{ height: 22, padding: '0 5px' }}
        >
          <ImagePlus size={12.5} />
        </button>
        <button
          className="icon-btn"
          onClick={onAddTextNote}
          title="Adicionar Nota de Texto"
          style={{ height: 22, padding: '0 5px' }}
        >
          <Type size={12.5} />
        </button>
        <button
          className={`icon-btn ${dropperMode ? 'active' : ''}`}
          onClick={onToggleDropper}
          title="Conta-gotas (ou Alt+Clique em qualquer Imagem, GIF ou Vídeo)"
          style={{ height: 22, padding: '0 5px' }}
        >
          <Pipette size={12.5} />
        </button>
        <button
          className={`icon-btn ${grayscaleBoard ? 'active' : ''}`}
          onClick={onToggleGrayscale}
          title="Modo Preto & Branco (estudo de valores)"
          style={{ height: 22, padding: '0 5px' }}
        >
          <Contrast size={12.5} />
        </button>

        {selectedCount > 0 && (
          <>
            <div style={{ width: 1, height: 14, background: '#383e4f', margin: '0 2px' }} />
            <button
              className="icon-btn"
              onClick={onGroupSelected}
              title="Agrupar selecionados (Ctrl+G)"
              style={{ height: 22, padding: '0 5px' }}
            >
              <Group size={12.5} />
            </button>
            {selectedHasGrouped && (
              <button
                className="icon-btn"
                onClick={onUngroupSelected}
                title="Desagrupar (Ctrl+Shift+G)"
                style={{ height: 22, padding: '0 5px' }}
              >
                <Ungroup size={12.5} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={onFlipSelected}
              title="Espelhar selecionados (H)"
              style={{ height: 22, padding: '0 5px' }}
            >
              <FlipHorizontal2 size={12.5} />
            </button>
            <button
              className="icon-btn"
              onClick={onDeleteSelected}
              title="Remover selecionados (Delete)"
              style={{ height: 22, padding: '0 5px' }}
            >
              <Trash2 size={12.5} />
            </button>
          </>
        )}

        <div style={{ width: 1, height: 14, background: '#383e4f', margin: '0 2px' }} />

        <button
          className="icon-btn"
          onClick={onAutoPackGrid}
          title="Organizar referências em grade"
          style={{ height: 22, padding: '0 5px' }}
        >
          <LayoutGrid size={12} />
        </button>
        <button
          className="icon-btn"
          onClick={onFitAll}
          title="Enquadrar tudo (F)"
          style={{ height: 22, padding: '0 5px' }}
        >
          <Maximize2 size={11.5} />
        </button>

        <input
          type="range"
          min={25}
          max={100}
          value={Math.round(winOpacity * 100)}
          onChange={(e) => onChangeOpacity(Number(e.target.value) / 100)}
          title={`Opacidade da Janela: ${Math.round(winOpacity * 100)}%`}
          style={{ width: 42, accentColor: '#3a86ff' }}
        />

        {standalone ? (
          <>
            <button
              className={`icon-btn ${alwaysOnTop ? 'active' : ''}`}
              onClick={onToggleAlwaysOnTop}
              title={alwaysOnTop ? 'Sempre no topo: ATIVO' : 'Sempre no topo: OFF'}
              style={{ height: 22, padding: '0 5px' }}
            >
              {alwaysOnTop ? <Pin size={12} /> : <PinOff size={12} />}
            </button>
            <button
              className="icon-btn"
              onClick={() => window.harmonyAPI?.minimize()}
              title="Minimizar"
              style={{ height: 22, padding: '0 4px' }}
            >
              <Minus size={12} />
            </button>
            <button
              className="icon-btn"
              onClick={() => window.harmonyAPI?.maximize()}
              title="Maximizar"
              style={{ height: 22, padding: '0 4px' }}
            >
              <Square size={10} />
            </button>
            <button
              className="icon-btn"
              onClick={() => window.harmonyAPI?.close()}
              title="Fechar janela de referência"
              style={{ height: 22, padding: '0 4px' }}
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              className="icon-btn"
              onClick={onPopOut}
              title="Destacar para janela livre (arraste até para outro monitor!)"
              style={{ height: 22, padding: '0 5px', color: '#93c5fd' }}
            >
              <ExternalLink size={12} />
            </button>
            <button
              className="icon-btn"
              onClick={onCloseDocked}
              title="Fechar Janela de Referência"
              style={{ height: 22, padding: '0 4px' }}
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>
    </div>

    {singleSelectedText && (
      <div
        style={{
          height: 28,
          background: '#1a1d25',
          borderBottom: '1px solid #2b303c',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px',
          fontSize: 10.5,
          color: '#9ca3af',
          flexShrink: 0
        }}
      >
        <span>Nota:</span>
        {NOTE_PALETTE.map((p) => (
          <button
            key={p.id}
            onClick={() => onUpdateTextNote(singleSelectedText.id, { noteColor: p.id })}
            title={p.label}
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: p.bg,
              border: `2px solid ${singleSelectedText.noteColor === p.id ? '#fff' : p.border}`,
              cursor: 'pointer',
              padding: 0
            }}
          />
        ))}
        <div style={{ width: 1, height: 12, background: '#333a4a', margin: '0 2px' }} />
        <button
          className="icon-btn"
          onClick={() =>
            onUpdateTextNote(singleSelectedText.id, {
              fontSize: Math.max(10, (singleSelectedText.fontSize || 13) - 2)
            })
          }
          style={{ height: 20, padding: '0 5px', fontSize: 10.5 }}
        >
          A-
        </button>
        <span style={{ fontFamily: 'monospace', color: '#d1d5db' }}>{singleSelectedText.fontSize || 13}px</span>
        <button
          className="icon-btn"
          onClick={() =>
            onUpdateTextNote(singleSelectedText.id, {
              fontSize: Math.min(36, (singleSelectedText.fontSize || 13) + 2)
            })
          }
          style={{ height: 20, padding: '0 5px', fontSize: 10.5 }}
        >
          A+
        </button>
      </div>
    )}
  </>
);
