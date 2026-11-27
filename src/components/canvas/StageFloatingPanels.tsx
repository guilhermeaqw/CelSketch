import React from 'react';
import type { DrawingLayer, Point } from '../../types/harmony';
import { getActiveCameraLayer, getInterpolatedCamera } from '../../utils/cameraUtils';

export interface BrushSizeHudState {
  label: string;
  px: number;
  diameter: number;
  x: number;
  y: number;
}

export interface StageFloatingPanelsProps {
  containerHeight: number;
  brushSizeHud: BrushSizeHudState | null;
  transformActive: boolean;
  transformQuad: { tl: Point; tr: Point; br: Point; bl: Point } | null;
  transformSubMode: 'scale' | 'perspective';
  transformMenuPos: { x: number; y: number } | null;
  onSetTransformSubMode: (mode: 'scale' | 'perspective') => void;
  onCloseTransformMenu: () => void;
  onFlipQuadH: () => void;
  onFlipQuadV: () => void;
  onRotateQuadBy: (deg: number) => void;
  onCommitTransform: () => void;
  onCancelTransform: () => void;
  cameraViewMode: boolean;
  layers: DrawingLayer[];
  currentFrame: number;
  onExitCameraView: () => void;
  lassoClosed: boolean;
  selectionCount: number;
  cropMode: boolean;
  onFillSelection: () => void;
  onDeleteSelection: () => void;
  onClearSelection: () => void;
  cropRect: { left: number; top: number; right: number; bottom: number };
  canvasWidth: number;
  canvasHeight: number;
  onChangeCropRect: (updater: (r: { left: number; top: number; right: number; bottom: number }) => { left: number; top: number; right: number; bottom: number }) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onResetCrop: () => void;
}

export const StageFloatingPanels: React.FC<StageFloatingPanelsProps> = ({
  containerHeight,
  brushSizeHud,
  transformActive,
  transformQuad,
  transformSubMode,
  transformMenuPos,
  onSetTransformSubMode,
  onCloseTransformMenu,
  onFlipQuadH,
  onFlipQuadV,
  onRotateQuadBy,
  onCommitTransform,
  onCancelTransform,
  cameraViewMode,
  layers,
  currentFrame,
  onExitCameraView,
  lassoClosed,
  selectionCount,
  cropMode,
  onFillSelection,
  onDeleteSelection,
  onClearSelection,
  cropRect,
  onChangeCropRect,
  onApplyCrop,
  onCancelCrop,
  onResetCrop
}) => {
  const activeCameraLayer = cameraViewMode ? getActiveCameraLayer(layers) : null;

  return (
    <>
      {/* Visual Brush Size Feedback HUD (live scaled circle + px badge on resize) */}
      {brushSizeHud && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            inset: 0,
            pointerEvents: 'none',
            zIndex: 75
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: brushSizeHud.x - Math.min(brushSizeHud.diameter, 520) / 2,
              top: brushSizeHud.y - Math.min(brushSizeHud.diameter, 520) / 2,
              width: Math.min(brushSizeHud.diameter, 520),
              height: Math.min(brushSizeHud.diameter, 520),
              borderRadius: '50%',
              border: '1.5px solid rgba(96, 165, 250, 0.95)',
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255, 255, 255, 0.35)',
              background: 'rgba(58, 134, 255, 0.08)'
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: brushSizeHud.x,
              top: Math.max(
                18,
                Math.min(containerHeight - 36, brushSizeHud.y + Math.min(brushSizeHud.diameter, 520) / 2 + 12)
              ),
              transform: 'translateX(-50%)',
              background: 'rgba(20, 23, 30, 0.92)',
              border: '1px solid rgba(96, 165, 250, 0.45)',
              borderRadius: 99,
              padding: '3px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#f3f4f6',
              whiteSpace: 'nowrap',
              boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ color: '#9ca3af', fontWeight: 500 }}>{brushSizeHud.label}</span>
            <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{brushSizeHud.px} px</span>
          </div>
        </div>
      )}

      {/* Floating Free Transform / Perspective Action Bar (Ctrl+T) */}
      {transformActive && transformQuad && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(34, 34, 34, 0.96)',
            border: '1px solid #4a4a4a',
            borderRadius: 5,
            padding: '5px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
            zIndex: 55
          }}
        >
          <span style={{ fontSize: 11, color: '#bbb', fontWeight: 600, marginRight: 4 }}>Transform:</span>
          <button
            className={`icon-btn ${transformSubMode === 'scale' ? 'active' : ''}`}
            onClick={() => onSetTransformSubMode('scale')}
          >
            Escala / Girar
          </button>
          <button
            className={`icon-btn ${transformSubMode === 'perspective' ? 'active' : ''}`}
            onClick={() => onSetTransformSubMode('perspective')}
          >
            Perspectiva
          </button>
          <div className="tb-sep" />
          <button className="icon-btn" onClick={onFlipQuadH}>
            Flip H
          </button>
          <button className="icon-btn" onClick={onFlipQuadV}>
            Flip V
          </button>
          <button className="icon-btn" onClick={() => onRotateQuadBy(90)} title="Girar 90° Horário">
            90° ↻
          </button>
          <div className="tb-sep" />
          <button className="icon-btn active" onClick={onCommitTransform} style={{ fontWeight: 600 }}>
            Aplicar (Enter)
          </button>
          <button className="icon-btn" onClick={onCancelTransform}>
            Cancelar (Esc)
          </button>
        </div>
      )}

      {/* Right-click Context Menu inside Free Transform */}
      {transformActive && transformMenuPos && (
        <div className="dropdown-menu" style={{ left: transformMenuPos.x, top: transformMenuPos.y, zIndex: 90 }}>
          <button
            className="dropdown-item"
            onClick={() => {
              onSetTransformSubMode('scale');
              onCloseTransformMenu();
            }}
          >
            <span>Escala / Girar</span>
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              onSetTransformSubMode('perspective');
              onCloseTransformMenu();
            }}
          >
            <span>Distorcer / Perspectiva (ou segure Ctrl)</span>
          </button>
          <div className="dropdown-sep" />
          <button
            className="dropdown-item"
            onClick={() => {
              onRotateQuadBy(90);
              onCloseTransformMenu();
            }}
          >
            <span>Girar 90° Horário</span>
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              onRotateQuadBy(-90);
              onCloseTransformMenu();
            }}
          >
            <span>Girar 90° Anti-horário</span>
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              onRotateQuadBy(180);
              onCloseTransformMenu();
            }}
          >
            <span>Girar 180°</span>
          </button>
          <div className="dropdown-sep" />
          <button
            className="dropdown-item"
            onClick={() => {
              onFlipQuadH();
              onCloseTransformMenu();
            }}
          >
            <span>Virar Horizontalmente</span>
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              onFlipQuadV();
              onCloseTransformMenu();
            }}
          >
            <span>Virar Verticalmente</span>
          </button>
        </div>
      )}

      {/* Floating 2D Camera View Mode Banner */}
      {activeCameraLayer && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(12, 26, 40, 0.94)',
            border: '1px solid #0284c7',
            borderRadius: 6,
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
            zIndex: 45,
            fontSize: 11.5,
            color: '#e0f2fe'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
            Visão da Câmera 2D
          </span>
          <span style={{ color: '#7dd3fc', fontFamily: 'monospace' }}>
            Zoom {getInterpolatedCamera(activeCameraLayer, currentFrame).zoom.toFixed(2)}x
          </span>
          <button
            className="icon-btn"
            onClick={onExitCameraView}
            style={{
              background: '#0284c7',
              borderColor: '#38bdf8',
              color: '#fff',
              fontSize: 11,
              padding: '2px 8px'
            }}
          >
            Voltar p/ Edição
          </button>
        </div>
      )}

      {/* Floating Selection Action Bar */}
      {lassoClosed && selectionCount > 0 && !cropMode && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(34, 34, 34, 0.95)',
            border: '1px solid #4a4a4a',
            borderRadius: 5,
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
            zIndex: 40
          }}
        >
          <span style={{ fontSize: 11, color: '#999', marginRight: 4 }}>Seleção ativa:</span>
          <button className="icon-btn active" onClick={onFillSelection} title="Preencher seleção (Alt+Backspace)">
            Preencher
          </button>
          <button
            className="icon-btn"
            onClick={onDeleteSelection}
            style={{ background: '#5c2626', borderColor: '#8c3b3b', color: '#ffdada' }}
            title="Apagar conteúdo da seleção na layer ativa (Delete)"
          >
            Apagar (Del)
          </button>
          <button className="icon-btn" onClick={onClearSelection} title="Desfazer seleção (Ctrl+D)">
            Desselecionar
          </button>
        </div>
      )}

      {/* Floating Canvas Resize / Crop Dialog (C key) */}
      {cropMode && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            width: 265,
            background: '#2b2b2b',
            border: '1px solid #4a4a4a',
            borderRadius: 5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.65)',
            zIndex: 50,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: 28,
              background: '#202020',
              borderBottom: '1px solid #3a3a3a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#e5e5e5'
            }}
          >
            <span>Alterar tamanho da tela</span>
            <span style={{ fontSize: 10, color: '#888' }}>C</span>
          </div>
          <div style={{ padding: 10, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span>Largura:</span>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  value={Math.round(cropRect.right - cropRect.left)}
                  onChange={(e) => {
                    const w = Math.max(64, Number(e.target.value) || 64);
                    onChangeCropRect((r) => ({ ...r, right: r.left + w }));
                  }}
                  className="harmony-input"
                  style={{ width: 72 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span>Altura:</span>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  value={Math.round(cropRect.bottom - cropRect.top)}
                  onChange={(e) => {
                    const h = Math.max(64, Number(e.target.value) || 64);
                    onChangeCropRect((r) => ({ ...r, bottom: r.top + h }));
                  }}
                  className="harmony-input"
                  style={{ width: 72 }}
                />
              </label>
              <div style={{ fontSize: 10, color: '#888' }}>Unidade: px • Arraste as alças</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 72 }}>
              <button
                className="icon-btn active"
                onClick={onApplyCrop}
                style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
              >
                OK
              </button>
              <button
                className="icon-btn"
                onClick={onCancelCrop}
                style={{ width: '100%', justifyContent: 'center', background: '#383838' }}
              >
                Cancelar
              </button>
              <button
                className="icon-btn"
                onClick={onResetCrop}
                style={{ width: '100%', justifyContent: 'center', background: '#383838' }}
              >
                Redefinir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
