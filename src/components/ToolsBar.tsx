import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
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
  ZoomIn,
  Wand2,
  Waves,
  Type,
  Contrast
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
  { id: 'magicwand', label: 'Varinha Mágica (W)', shortcut: 'W', icon: <Wand2 size={16} /> },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: <Paintbrush size={16} /> },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', icon: <Pencil size={16} /> },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <Eraser size={16} /> },
  { id: 'liquify', label: 'Liquify (Deformar)', shortcut: 'J', icon: <Waves size={16} /> },
  { id: 'paint', label: 'Paint Bucket', shortcut: 'G', icon: <PaintBucket size={16} /> },
  { id: 'gradient', label: 'Degradê (Gradiente)', shortcut: 'Shift+G', icon: <Contrast size={16} /> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus size={16} style={{ transform: 'rotate(-45deg)' }} /> },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'U', icon: <Square size={15} /> },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: <Circle size={15} /> },
  { id: 'text', label: 'Texto (Fontes do PC)', shortcut: 'T', icon: <Type size={16} /> },
  { id: 'eyedropper', label: 'Dropper', shortcut: 'I', icon: <Pipette size={16} /> },
  { id: 'hand', label: 'Hand (Pan)', shortcut: 'H', icon: <Hand size={16} /> },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: <ZoomIn size={16} /> }
];

export const ToolsBar: React.FC = () => {
  const activeTool = useHarmonyStore((s) => s.activeTool);
  const lastSelectionTool = useHarmonyStore((s) => s.lastSelectionTool);
  const setTool = useHarmonyStore((s) => s.setTool);
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const isSelectActive = SELECTION_TOOLS.some((t) => t.id === activeTool);
  const currentSelectObj =
    SELECTION_TOOLS.find((t) => t.id === (isSelectActive ? activeTool : lastSelectionTool)) ||
    SELECTION_TOOLS[0];

  const openFlyout = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = rect.right + 4 + 215 > window.innerWidth ? Math.max(8, rect.left - 219) : rect.right + 4;
    const top = Math.min(rect.top, window.innerHeight - 230);
    setFlyoutPos({ left, top: Math.max(8, top) });
  };

  const scheduleCloseFlyout = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setFlyoutPos(null);
      closeTimerRef.current = null;
    }, 140);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!flyoutPos) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (triggerRef.current && target && triggerRef.current.contains(target)) return;
      if (target instanceof HTMLElement && target.closest('[data-tools-flyout]')) return;
      setFlyoutPos(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlyoutPos(null);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [flyoutPos]);

  return (
    <div className="tools-rail">
      {/* Grouped Selection Tool with Portal Flyout (works in docked, floating & pen/touch modes!) */}
      <div
        ref={triggerRef}
        style={{ position: 'relative' }}
        onMouseEnter={openFlyout}
        onMouseLeave={scheduleCloseFlyout}
      >
        <button
          className={`tool-btn ${isSelectActive ? 'active' : ''}`}
          onClick={() => {
            if (isSelectActive && !flyoutPos) {
              openFlyout();
            } else {
              setTool(currentSelectObj.id);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            openFlyout();
          }}
          title={`${currentSelectObj.label} (${currentSelectObj.shortcut} • Shift+M alterna • Botão direito abre lista)`}
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

        {flyoutPos &&
          createPortal(
            <div
              data-tools-flyout="true"
              onMouseEnter={() => {
                if (closeTimerRef.current) {
                  window.clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = null;
                }
              }}
              onMouseLeave={scheduleCloseFlyout}
              style={{
                position: 'fixed',
                left: flyoutPos.left,
                top: flyoutPos.top,
                background: '#2b2b2b',
                border: '1px solid #4a4a4a',
                borderRadius: 4,
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                boxShadow: '0 8px 22px rgba(0,0,0,0.65)',
                zIndex: 9999,
                minWidth: 215
              }}
            >
              {SELECTION_TOOLS.map((st) => (
                <button
                  key={st.id}
                  onClick={() => {
                    setTool(st.id);
                    setFlyoutPos(null);
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
                  <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{st.shortcut}</span>
                </button>
              ))}
            </div>,
            document.body
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
