import React, { useState, useRef, useEffect } from 'react';
import { Maximize2, Minimize2, GripHorizontal } from 'lucide-react';

interface DockablePanelProps {
  title: string;
  dockSide: 'right' | 'bottom' | 'left';
  defaultDockedSize: number;
  minDockedSize: number;
  maxDockedSize: number;
  defaultFloatPos: { x: number; y: number };
  defaultFloatSize: { w: number; h: number };
  children: React.ReactNode;
}

export const DockablePanel: React.FC<DockablePanelProps> = ({
  title,
  dockSide,
  defaultDockedSize,
  minDockedSize,
  maxDockedSize,
  defaultFloatPos,
  defaultFloatSize,
  children
}) => {
  const [isFloating, setIsFloating] = useState(false);
  const [dockedSize, setDockedSize] = useState(defaultDockedSize);
  const [floatPos, setFloatPos] = useState(defaultFloatPos);
  const [floatSize, setFloatSize] = useState(defaultFloatSize);

  const dragState = useRef<{
    type: 'dock-resize' | 'float-move' | 'float-resize' | null;
    startX: number;
    startY: number;
    startSize: number;
    startPos: { x: number; y: number };
    startFloatSize: { w: number; h: number };
  }>({
    type: null,
    startX: 0,
    startY: 0,
    startSize: defaultDockedSize,
    startPos: defaultFloatPos,
    startFloatSize: defaultFloatSize
  });

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const st = dragState.current;
      if (!st.type) return;

      if (st.type === 'dock-resize') {
        if (dockSide === 'right') {
          const delta = st.startX - e.clientX;
          setDockedSize(Math.max(minDockedSize, Math.min(maxDockedSize, st.startSize + delta)));
        } else if (dockSide === 'left') {
          const delta = e.clientX - st.startX;
          setDockedSize(Math.max(minDockedSize, Math.min(maxDockedSize, st.startSize + delta)));
        } else if (dockSide === 'bottom') {
          const delta = st.startY - e.clientY;
          setDockedSize(Math.max(minDockedSize, Math.min(maxDockedSize, st.startSize + delta)));
        }
      } else if (st.type === 'float-move') {
        const nx = Math.max(0, Math.min(window.innerWidth - 100, st.startPos.x + (e.clientX - st.startX)));
        const ny = Math.max(30, Math.min(window.innerHeight - 60, st.startPos.y + (e.clientY - st.startY)));
        setFloatPos({ x: nx, y: ny });
      } else if (st.type === 'float-resize') {
        const nw = Math.max(160, Math.min(window.innerWidth - 40, st.startFloatSize.w + (e.clientX - st.startX)));
        const nh = Math.max(120, Math.min(window.innerHeight - 60, st.startFloatSize.h + (e.clientY - st.startY)));
        setFloatSize({ w: nw, h: nh });
      }
    };

    const onMouseUp = () => {
      dragState.current.type = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dockSide, minDockedSize, maxDockedSize]);

  const startDockResize = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = {
      type: 'dock-resize',
      startX: e.clientX,
      startY: e.clientY,
      startSize: dockedSize,
      startPos: floatPos,
      startFloatSize: floatSize
    };
  };

  const startFloatMove = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = {
      type: 'float-move',
      startX: e.clientX,
      startY: e.clientY,
      startSize: dockedSize,
      startPos: { ...floatPos },
      startFloatSize: floatSize
    };
  };

  const startFloatResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = {
      type: 'float-resize',
      startX: e.clientX,
      startY: e.clientY,
      startSize: dockedSize,
      startPos: floatPos,
      startFloatSize: { ...floatSize }
    };
  };

  // FLOATING WINDOW MODE
  if (isFloating) {
    return (
      <div
        style={{
          position: 'fixed',
          left: floatPos.x,
          top: floatPos.y,
          width: floatSize.w,
          height: floatSize.h,
          background: '#2b2b2b',
          border: '1px solid #4c4c4c',
          borderRadius: 5,
          boxShadow: '0 10px 28px rgba(0,0,0,0.65)',
          zIndex: 800,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          onMouseDown={startFloatMove}
          onDoubleClick={() => setIsFloating(false)}
          style={{
            height: 24,
            background: '#202020',
            borderBottom: '1px solid #151515',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            cursor: 'grab',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#bbb' }}>
            <GripHorizontal size={12} />
            <span>{title}</span>
          </div>
          <button
            className="icon-btn"
            onClick={() => setIsFloating(false)}
            title="Encaixar painel de volta (Dock)"
            style={{ height: 18, minWidth: 18 }}
          >
            <Minimize2 size={11} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>

        {/* Bottom-Right Resize Handle */}
        <div
          onMouseDown={startFloatResize}
          title="Arraste para redimensionar"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 14,
            height: 14,
            cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 50%, #5b93e6 50%)',
            opacity: 0.75
          }}
        />
      </div>
    );
  }

  // DOCKED MODE WITH RESIZE SPLITTER + UNDOCK BUTTON
  const dockedStyle: React.CSSProperties =
    dockSide === 'right'
      ? { width: dockedSize, display: 'flex', flexDirection: 'row', position: 'relative', flexShrink: 0 }
      : dockSide === 'left'
      ? { width: dockedSize, display: 'flex', flexDirection: 'row', position: 'relative', flexShrink: 0 }
      : { height: dockedSize, display: 'flex', flexDirection: 'column', position: 'relative', flexShrink: 0 };

  return (
    <div style={dockedStyle}>
      {/* Splitter handle for right or bottom dock */}
      {dockSide === 'right' && (
        <div
          onMouseDown={startDockResize}
          title="Arraste para redimensionar"
          style={{
            width: 5,
            cursor: 'ew-resize',
            background: '#181818',
            flexShrink: 0
          }}
        />
      )}
      {dockSide === 'bottom' && (
        <div
          onMouseDown={startDockResize}
          title="Arraste para redimensionar"
          style={{
            height: 5,
            cursor: 'ns-resize',
            background: '#181818',
            flexShrink: 0
          }}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: '#2b2b2b' }}>
        {/* Compact Dock Header with Undock/Float button */}
        <div
          onDoubleClick={() => setIsFloating(true)}
          style={{
            height: 20,
            background: '#222222',
            borderBottom: '1px solid #181818',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          <button
            className="icon-btn"
            onClick={() => setIsFloating(true)}
            title="Soltar painel para arrastar livremente (Float)"
            style={{ height: 16, minWidth: 16, padding: 0 }}
          >
            <Maximize2 size={10} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>

      {dockSide === 'left' && (
        <div
          onMouseDown={startDockResize}
          title="Arraste para redimensionar"
          style={{
            width: 4,
            cursor: 'ew-resize',
            background: '#181818',
            flexShrink: 0
          }}
        />
      )}
    </div>
  );
};
