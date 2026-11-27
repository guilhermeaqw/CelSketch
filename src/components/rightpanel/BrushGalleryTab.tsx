import React, { useEffect, useRef, useState } from 'react';
import { renderStroke } from '../../utils/canvasRenderer';
import type { BrushPresetId, Stroke, ToolId } from '../../types/harmony';

const DEFAULT_BRUSHES: { id: BrushPresetId; label: string; previewSize: number; minRatio: number; opacity: number }[] = [
  { id: 'csp_line', label: 'Line (Seu Brush)', previewSize: 13, minRatio: 0.05, opacity: 1 },
  { id: 'csp_sketch', label: 'Sketch (Seu Brush)', previewSize: 15, minRatio: 0.15, opacity: 0.85 },
  { id: 'sai_pen', label: 'G-Pen Lineart', previewSize: 10, minRatio: 0.04, opacity: 1 },
  { id: 'sai_inkpen', label: 'Nanquim Dinâmico', previewSize: 14, minRatio: 0.02, opacity: 1 },
  { id: 'sai_pencil', label: 'Lápis 2B', previewSize: 11, minRatio: 0.18, opacity: 0.88 },
  { id: 'sai_water', label: 'Aquarela', previewSize: 18, minRatio: 0.2, opacity: 0.72 },
  { id: 'sai_airbrush', label: 'Aerógrafo Suave', previewSize: 22, minRatio: 0.25, opacity: 0.75 },
  { id: 'sai_binary', label: 'Caneta Binária', previewSize: 5, minRatio: 1, opacity: 1 },
  { id: 'sai_opacity_pen', label: 'Caneta Opacidade (Valor)', previewSize: 12, minRatio: 0.08, opacity: 0.85 }
];

const BLUR_BRUSHES: { id: BrushPresetId; label: string; previewSize: number; minRatio: number; opacity: number }[] = [
  { id: 'blur_soft', label: 'Esfumar Suave', previewSize: 24, minRatio: 0.3, opacity: 0.7 },
  { id: 'blur_smudge', label: 'Borrar / Misturar', previewSize: 20, minRatio: 0.2, opacity: 0.8 }
];

const BrushStrokeThumbnail: React.FC<{
  preset: BrushPresetId;
  size: number;
  minRatio: number;
  opacity: number;
}> = ({ preset, size, minRatio, opacity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgTick, setImgTick] = useState(0);

  useEffect(() => {
    const onImgLoaded = () => setImgTick((t) => t + 1);
    window.addEventListener('celsketch:image-loaded', onImgLoaded);
    return () => window.removeEventListener('celsketch:image-loaded', onImgLoaded);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (preset === 'blur_soft' || preset === 'blur_smudge') {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(14, 7, canvas.width - 28, 12);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(14, 19, canvas.width - 28, 12);
    }

    const points = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = 16 + t * (canvas.width - 32);
      const y = canvas.height / 2 + Math.sin(t * Math.PI * 2) * 10;
      const pressure = Math.sin(t * Math.PI);
      points.push({ x, y, pressure: Math.max(0.08, pressure) });
    }

    const demoStroke: Stroke = {
      id: `preview-${preset}`,
      tool: 'brush',
      preset,
      artLayer: 'LA',
      swatchId: 'preview',
      color: '#f0f0f0',
      size,
      minSizeRatio: minRatio,
      opacity,
      smoothing: 40,
      points
    };
    renderStroke(ctx, demoStroke);
  }, [preset, size, minRatio, opacity, imgTick]);

  return <canvas ref={canvasRef} width={220} height={38} style={{ display: 'block', width: '100%', height: 38 }} />;
};

export interface BrushGalleryTabProps {
  activeTool: ToolId;
  activeBrushPreset: BrushPresetId;
  eraserPreset: BrushPresetId;
  onSelectBrush: (id: BrushPresetId) => void;
  onSelectEraser: (id: BrushPresetId) => void;
}

export const BrushGalleryTab: React.FC<BrushGalleryTabProps> = ({
  activeTool,
  activeBrushPreset,
  eraserPreset,
  onSelectBrush,
  onSelectEraser
}) => {
  const [brushCategory, setBrushCategory] = useState<'padrao' | 'borrar'>('padrao');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 8px 4px 8px' }}>
        <button
          onClick={() => setBrushCategory('padrao')}
          className={`icon-btn ${brushCategory === 'padrao' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center', height: 24 }}
        >
          Padrão
        </button>
        <button
          onClick={() => setBrushCategory('borrar')}
          className={`icon-btn ${brushCategory === 'borrar' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center', height: 24 }}
        >
          Borrar
        </button>
      </div>

      {activeTool === 'eraser' && (
        <div style={{ padding: '4px 10px 0 10px', fontSize: 10.5, color: '#93c5fd', fontWeight: 600 }}>
          Modo Borracha (E) — escolha a ponta da borracha:
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(brushCategory === 'padrao' ? DEFAULT_BRUSHES : BLUR_BRUSHES).map((brush) => {
          const active = activeTool === 'eraser' ? eraserPreset === brush.id : activeBrushPreset === brush.id;
          return (
            <button
              key={brush.id}
              onClick={() => (activeTool === 'eraser' ? onSelectEraser(brush.id) : onSelectBrush(brush.id))}
              title={brush.label}
              style={{
                padding: '4px 6px 2px 6px',
                borderRadius: 5,
                cursor: 'pointer',
                background: active ? '#284a7a' : '#202020',
                border: `1.5px solid ${active ? '#5b93e6' : '#353535'}`,
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'left'
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, color: active ? '#e0f2fe' : '#a8a8a8', marginBottom: 1 }}>
                {brush.label}
              </div>
              <BrushStrokeThumbnail
                preset={brush.id}
                size={brush.previewSize}
                minRatio={brush.minRatio}
                opacity={brush.opacity}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
