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

// Dynamic z-index counter so clicking any floating panel brings it cleanly to the front
let globalFloatZ = 800;

function clampFloatPos(pos: { x: number; y: number }, size: { w: number; h: number }) {
  return {
    x: Math.max(0, Math.min(Math.max(0, window.innerWidth - Math.min(size.w, 120)), pos.x)),
    y: Math.max(30, Math.min(Math.max(30, window.innerHeight - 60), pos.y))
  };
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
  const [floatPos, setFloatPos] = useState(() => clampFloatPos(defaultFloatPos, defaultFloatSize));
  const [floatSize, setFloatSize] = useState(defaultFloatSize);
  const [floatZ, setFloatZ] = useState(() => ++globalFloatZ);

  const minFloatW = Math.min(160, defaultFloatSize.w);

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
    const onPointerMove = (e: PointerEvent) => {
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
        const nw = Math.max(minFloatW, Math.min(window.innerWidth - 40, st.startFloatSize.w + (e.clientX - st.startX)));
        const nh = Math.max(120, Math.min(window.innerHeight - 60, st.startFloatSize.h + (e.clientY - st.startY)));
        setFloatSize({ w: nw, h: nh });
      }
    };

    const stopDrag = () => {
      dragState.current.type = null;
    };

    const onResize = () => {
      setFloatPos((p) => clampFloatPos(p, floatSize));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    window.addEventListener('blur', stopDrag);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      window.removeEventListener('blur', stopDrag);
      window.removeEventListener('resize', onResize);
    };
  }, [dockSide, minDockedSize, maxDockedSize, minFloatW, floatSize]);

  const bringToFront = () => {
    globalFloatZ += 1;
    setFloatZ(globalFloatZ);
  };

  const enterFloat = () => {
    setFloatPos((p) => clampFloatPos(p, floatSize));
    bringToFront();
    setIsFloating(true);
  };

  const startDockResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
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

  const startFloatMove = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront();
    dragState.current = {
      type: 'float-move',
      startX: e.clientX,
      startY: e.clientY,
      startSize: dockedSize,
      startPos: { ...floatPos },
      startFloatSize: floatSize
    };
  };

  const startFloatResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront();
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
        onPointerDown={bringToFront}
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
          zIndex: floatZ,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          onPointerDown={startFloatMove}
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
            touchAction: 'none',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#bbb', overflow: 'hidden' }}>
            <GripHorizontal size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          </div>
          <button
            className="icon-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setIsFloating(false)}
            title="Encaixar painel de volta (Dock)"
            style={{ height: 18, minWidth: 18, flexShrink: 0 }}
          >
            <Minimize2 size={11} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>

        {/* Bottom-Right Resize Handle */}
        <div
          onPointerDown={startFloatResize}
          title="Arraste para redimensionar"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 14,
            height: 14,
            cursor: 'nwse-resize',
            touchAction: 'none',
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
      {dockSide === 'right' && (
        <div
          onPointerDown={startDockResize}
          title="Arraste para redimensionar"
          style={{
            width: 6,
            cursor: 'ew-resize',
            touchAction: 'none',
            background: '#181818',
            flexShrink: 0
          }}
        />
      )}
      {dockSide === 'bottom' && (
        <div
          onPointerDown={startDockResize}
          title="Arraste para redimensionar"
          style={{
            height: 6,
            cursor: 'ns-resize',
            touchAction: 'none',
            background: '#181818',
            flexShrink: 0
          }}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: '#2b2b2b' }}>
        <div
          onDoubleClick={enterFloat}
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
            onClick={enterFloat}
            title="Soltar painel para arrastar livremente (Float)"
            style={{ height: 16, minWidth: 16, padding: 0 }}
          >
            <Maximize2 size={10} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          {children}
        </div>
      </div>

      {dockSide === 'left' && (
        <div
          onPointerDown={startDockResize}
          title="Arraste para redimensionar"
          style={{
            width: 5,
            cursor: 'ew-resize',
            background: '#181818',
            flexShrink: 0,
            touchAction: 'none'
          }}
        />
      )}
    </div>
  );
};
