import React, { useState } from 'react';
import {
  MousePointer2,
  Spline,
  Lasso,
  Pentagon,
  SquareDashed,
  CircleDashed,
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

const SELECTION_TOOLS: { id: ToolId; label: string; shortcut: string; icon: React.ReactNode }[] = [
  { id: 'lasso', label: 'Laço Livre (Alt = Poligonal)', shortcut: 'Q', icon: <Lasso size={16} /> },
  { id: 'polylasso', label: 'Laço Poligonal', shortcut: 'Shift+Q', icon: <Pentagon size={15} /> },
  { id: 'lassofill', label: 'Laço Fill (Preencher)', shortcut: 'Shift+G', icon: <PaintBucket size={15} /> },
  { id: 'polylassofill', label: 'Laço Poligonal Fill', shortcut: 'Alt+G', icon: <Pentagon size={15} style={{ fill: 'rgba(58,134,255,0.45)' }} /> },
  { id: 'rectselect', label: 'Seleção Retangular', shortcut: 'M', icon: <SquareDashed size={16} /> },
  { id: 'ellipseselect', label: 'Seleção Elipse', shortcut: 'Shift+M', icon: <CircleDashed size={16} /> }
];

const OTHER_TOOLS: { id: ToolId; label: string; shortcut: string; icon: React.ReactNode }[] = [
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: <Paintbrush size={16} /> },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', icon: <Pencil size={16} /> },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <Eraser size={16} /> },
  { id: 'paint', label: 'Paint Bucket', shortcut: 'G', icon: <PaintBucket size={16} /> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus size={16} style={{ transform: 'rotate(-45deg)' }} /> },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'U', icon: <Square size={15} /> },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: <Circle size={15} /> },
  { id: 'eyedropper', label: 'Dropper', shortcut: 'I', icon: <Pipette size={16} /> },
  { id: 'hand', label: 'Hand (Pan)', shortcut: 'H', icon: <Hand size={16} /> },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: <ZoomIn size={16} /> }
];

export const ToolsBar: React.FC = () => {
  const activeTool = useHarmonyStore((s) => s.activeTool);
  const lastSelectionTool = useHarmonyStore((s) => s.lastSelectionTool);
  const setTool = useHarmonyStore((s) => s.setTool);
  const [showSelectFlyout, setShowSelectFlyout] = useState(false);

  const isSelectActive = SELECTION_TOOLS.some((t) => t.id === activeTool);
  const currentSelectObj =
    SELECTION_TOOLS.find((t) => t.id === (isSelectActive ? activeTool : lastSelectionTool)) ||
    SELECTION_TOOLS[0];

  return (
    <div className="tools-rail" style={{ overflow: 'visible' }}>
      <button
        className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
        onClick={() => setTool('select')}
        title="Select (V)"
      >
        <MousePointer2 size={16} />
      </button>
      <button
        className={`tool-btn ${activeTool === 'contour' ? 'active' : ''}`}
        onClick={() => setTool('contour')}
        title="Contour Editor (A)"
      >
        <Spline size={16} />
      </button>

      {/* Grouped Selection Tool with Hover Flyout (Lasso / Poly / Rect / Ellipse) */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setShowSelectFlyout(true)}
        onMouseLeave={() => setShowSelectFlyout(false)}
      >
        <button
          className={`tool-btn ${isSelectActive ? 'active' : ''}`}
          onClick={() => setTool(currentSelectObj.id)}
          title={`${currentSelectObj.label} (M • Shift+M alterna)`}
        >
          {currentSelectObj.icon}
          <span
            style={{
              position: 'absolute',
              right: 2,
              bottom: 2,
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderBottom: '4px solid #aaa'
            }}
          />
        </button>

        {showSelectFlyout && (
          <div
            style={{
              position: 'absolute',
              left: 34,
              top: 0,
              background: '#2b2b2b',
              border: '1px solid #4a4a4a',
              borderRadius: 4,
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
              zIndex: 9999,
              minWidth: 185
            }}
          >
            {SELECTION_TOOLS.map((st) => (
              <button
                key={st.id}
                onClick={() => {
                  setTool(st.id);
                  setShowSelectFlyout(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  background: activeTool === st.id ? '#2f5fa8' : 'transparent',
                  color: '#eee',
                  fontSize: 11.5,
                  textAlign: 'left'
                }}
              >
                {st.icon}
                <span style={{ flex: 1 }}>{st.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {OTHER_TOOLS.map((t) => (
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
