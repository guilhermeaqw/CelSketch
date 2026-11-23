import React from 'react';
import {
  MousePointer2,
  Spline,
  Lasso,
  Pentagon,
  Paintbrush,
  Pencil,
  Eraser,
  PaintBucket,
  Minus,
  Square,
  Circle,
  Pipette,
  Hand,
  ZoomIn
} from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { ToolId } from '../types/harmony';

const TOOLS: { id: ToolId; label: string; shortcut: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 size={16} /> },
  { id: 'contour', label: 'Contour Editor', shortcut: 'A', icon: <Spline size={16} /> },
  { id: 'lasso', label: 'Lasso (Hold Alt = Polygonal)', shortcut: 'Q', icon: <Lasso size={16} /> },
  { id: 'polylasso', label: 'Polygonal Lasso', shortcut: 'Shift+Q', icon: <Pentagon size={15} /> },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: <Paintbrush size={16} /> },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', icon: <Pencil size={16} /> },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <Eraser size={16} /> },
  { id: 'paint', label: 'Paint Bucket', shortcut: 'G', icon: <PaintBucket size={16} /> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus size={16} style={{ transform: 'rotate(-45deg)' }} /> },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: <Square size={15} /> },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: <Circle size={15} /> },
  { id: 'eyedropper', label: 'Dropper', shortcut: 'I', icon: <Pipette size={16} /> },
  { id: 'hand', label: 'Hand (Pan)', shortcut: 'H', icon: <Hand size={16} /> },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: <ZoomIn size={16} /> }
];

export const ToolsBar: React.FC = () => {
  const activeTool = useHarmonyStore((s) => s.activeTool);
  const setTool = useHarmonyStore((s) => s.setTool);

  return (
    <div className="tools-rail">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool-btn ${activeTool === t.id ? 'active' : ''}`}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.shortcut})`}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
};
