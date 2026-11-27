import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, Pipette, Trash2, RotateCcw, X, FlipHorizontal2 } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { isTextEditingTarget } from '../App';

interface RefImageItem {
  id: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flipX?: boolean;
}

export const ReferenceWindow: React.FC = () => {
  const referenceWindowOpen = useHarmonyStore((s) => s.referenceWindowOpen);
  const toggleReferenceWindow = useHarmonyStore((s) => s.toggleReferenceWindow);
  const setActiveColor = useHarmonyStore((s) => s.setActiveColor);
  const pushRecentColor = useHarmonyStore((s) => s.pushRecentColor);

  const [winPos, setWinPos] = useState({ x: 86, y: 88 });
  const [winSize, setWinSize] = useState({ w: 360, h: 420 });
  const [winOpacity, setWinOpacity] = useState(1);
  const [boardZoom, setBoardZoom] = useState(1);
  const [boardPan, setBoardPan] = useState({ x: 0, y: 0 });
  const [images, setImages] = useState<RefImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropperMode, setDropperMode] = useState(false);
  const [pickedHex, setPickedHex] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDomFocused, setIsDomFocused] = useState(false);
  const isFocused = isHovered || isDomFocused;

  const boardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickedTimerRef = useRef<number | null>(null);
  const activeCleanupRef = useRef<(() => void) | null>(null);
  const boardZoomRef = useRef<number>(boardZoom);
  boardZoomRef.current = boardZoom;

  // Blur ReferenceWindow when user clicks anywhere outside it (e.g. back on the non-focusable <canvas>) so Ctrl+V & Delete never stay trapped!
  useEffect(() => {
    if (!referenceWindowOpen || !isDomFocused) return;
    const onOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target?.closest('[data-ref-window]')) {
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-ref-window]')) {
          document.activeElement.blur();
        }
        setIsDomFocused(false);
      }
    };
    window.addEventListener('pointerdown', onOutsidePointerDown, true);
    return () => window.removeEventListener('pointerdown', onOutsidePointerDown, true);
  }, [referenceWindowOpen, isDomFocused]);

  useEffect(() => {
    return () => {
      if (pickedTimerRef.current) window.clearTimeout(pickedTimerRef.current);
      activeCleanupRef.current?.();
    };
  }, []);

  // Native non-passive wheel zoom toward mouse cursor inside the Reference board
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !referenceWindowOpen) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = board.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const prevZ = boardZoomRef.current;
      const nextZ = Math.max(0.2, Math.min(5, prevZ * factor));
      const ratio = nextZ / prevZ;
      boardZoomRef.current = nextZ;
      setBoardZoom(nextZ);
      setBoardPan((p) => ({
        x: mx - (mx - p.x) * ratio,
        y: my - (my - p.y) * ratio
      }));
    };
    board.addEventListener('wheel', onWheel, { passive: false });
    return () => board.removeEventListener('wheel', onWheel);
  }, [referenceWindowOpen]);

  const addImageFromDataUrl = useCallback((dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 260;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(48, Math.round(img.naturalWidth * scale));
      const h = Math.max(48, Math.round(img.naturalHeight * scale));
      setImages((prev) => {
        const offset = (prev.length % 6) * 20;
        const item: RefImageItem = {
          id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          src: dataUrl,
          x: 24 + offset,
          y: 24 + offset,
          w,
          h
        };
        setSelectedId(item.id);
        return [...prev, item];
      });
    };
    img.src = dataUrl;
  }, []);

  const readFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            addImageFromDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [addImageFromDataUrl]
  );

  // Paste images directly with Ctrl+V (PureRef-style!) whenever the window is open & focused/hovered
  useEffect(() => {
    if (!referenceWindowOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length > 0 && (isFocused || images.length === 0)) {
        e.preventDefault();
        e.stopPropagation();
        readFiles(imageFiles);
      }
    };
    window.addEventListener('paste', onPaste, { capture: true });
    return () => window.removeEventListener('paste', onPaste, { capture: true });
  }, [referenceWindowOpen, isFocused, images.length, readFiles]);

  // Delete selected reference image ONLY when ReferenceWindow holds real DOM focus and user isn't typing in an input
  useEffect(() => {
    if (!referenceWindowOpen || !isDomFocused || !selectedId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        setImages((prev) => prev.filter((im) => im.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [referenceWindowOpen, isDomFocused, selectedId]);

  // Sample exact pixel color from a reference image (accounts for objectFit:'contain' letterboxing & alpha!)
  const sampleFromRefImage = (
    item: RefImageItem,
    imgEl: HTMLImageElement,
    clientX: number,
    clientY: number
  ) => {
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
    const rect = imgEl.getBoundingClientRect();
    const natAspect = imgEl.naturalWidth / imgEl.naturalHeight;
    const boxAspect = rect.width / Math.max(1, rect.height);
    let drawW = rect.width;
    let drawH = rect.height;
    let drawLeft = rect.left;
    let drawTop = rect.top;
    if (natAspect > boxAspect) {
      drawH = rect.width / natAspect;
      drawTop = rect.top + (rect.height - drawH) / 2;
    } else {
      drawW = rect.height * natAspect;
      drawLeft = rect.left + (rect.width - drawW) / 2;
    }
    const u = (clientX - drawLeft) / Math.max(1, drawW);
    const v = (clientY - drawTop) / Math.max(1, drawH);
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const px = Math.max(0, Math.min(imgEl.naturalWidth - 1, Math.floor((item.flipX ? 1 - u : u) * imgEl.naturalWidth)));
    const py = Math.max(0, Math.min(imgEl.naturalHeight - 1, Math.floor(v * imgEl.naturalHeight)));
    const off = document.createElement('canvas');
    off.width = 1;
    off.height = 1;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgEl, px, py, 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] < 10) return; // Ignore fully transparent pixels!
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const hex = `#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`;
    setActiveColor(hex);
    pushRecentColor(hex);
    setPickedHex(hex);
    if (pickedTimerRef.current) window.clearTimeout(pickedTimerRef.current);
    pickedTimerRef.current = window.setTimeout(() => setPickedHex(null), 1200);
  };

  // Drag window header (pen-friendly PointerEvents)
  const startWindowDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...winPos };
    const onMove = (ev: PointerEvent) => {
      setWinPos({
        x: Math.max(0, Math.min(window.innerWidth - 120, orig.x + (ev.clientX - startX))),
        y: Math.max(30, Math.min(window.innerHeight - 80, orig.y + (ev.clientY - startY)))
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Resize window from bottom-right corner
  const startWindowResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...winSize };
    const onMove = (ev: PointerEvent) => {
      setWinSize({
        w: Math.max(240, Math.min(window.innerWidth - 40, orig.w + (ev.clientX - startX))),
        h: Math.max(200, Math.min(window.innerHeight - 60, orig.h + (ev.clientY - startY)))
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Pan board with right-click or middle-click drag
  const startBoardPan = (e: React.PointerEvent) => {
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...boardPan };
    const onMove = (ev: PointerEvent) => {
      setBoardPan({ x: orig.x + (ev.clientX - startX), y: orig.y + (ev.clientY - startY) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Drag a reference image inside the PureRef board
  const startImageDrag = (item: RefImageItem, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // Ensure ReferenceWindow receives focus so Delete/Backspace works immediately on the selected image
    const refHost = (e.currentTarget as HTMLElement).closest('[data-ref-window]') as HTMLElement | null;
    refHost?.focus();
    setSelectedId(item.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = item.x;
    const origY = item.y;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / boardZoom;
      const dy = (ev.clientY - startY) / boardZoom;
      setImages((prev) =>
        prev.map((im) => (im.id === item.id ? { ...im, x: origX + dx, y: origY + dy } : im))
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Resize a reference image proportionally from bottom-right corner (tracks BOTH X & Y!)
  const startImageResize = (item: RefImageItem, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = item.w;
    const origH = item.h;
    const ratio = origH / Math.max(1, origW);
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / boardZoom;
      const dy = (ev.clientY - startY) / boardZoom;
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy / Math.max(0.1, ratio);
      const nextW = Math.max(36, origW + delta);
      setImages((prev) =>
        prev.map((im) =>
          im.id === item.id ? { ...im, w: Math.round(nextW), h: Math.round(nextW * ratio) } : im
        )
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeCleanupRef.current = null;
    };
    activeCleanupRef.current?.();
    activeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  if (!referenceWindowOpen) return null;

  return (
    <div
      tabIndex={0}
      data-ref-window={isFocused ? 'active' : 'idle'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsDomFocused(true)}
      onBlur={() => setIsDomFocused(false)}
      style={{
        position: 'fixed',
        left: winPos.x,
        top: winPos.y,
        width: winSize.w,
        height: winSize.h,
        zIndex: 900,
        opacity: winOpacity,
        background: '#181818',
        border: isDragOver ? '2px dashed #3a86ff' : '1px solid #444',
        borderRadius: 6,
        boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        outline: 'none'
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files?.length) {
          readFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* PureRef-style slim header */}
      <div
        onPointerDown={startWindowDrag}
        style={{
          height: 28,
          background: '#242424',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 6px',
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
          gap: 4
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', paddingLeft: 2 }}>
          Referência
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }} onPointerDown={(e) => e.stopPropagation()}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) readFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Adicionar imagem (ou arraste / Ctrl+V)"
            style={{ height: 20, padding: '0 5px' }}
          >
            <ImagePlus size={12} />
          </button>
          <button
            className={`icon-btn ${dropperMode ? 'active' : ''}`}
            onClick={() => setDropperMode((d) => !d)}
            title="Modo Conta-gotas (ou segure Alt + Clique em qualquer imagem)"
            style={{ height: 20, padding: '0 5px' }}
          >
            <Pipette size={12} />
          </button>
          {selectedId && (
            <>
              <button
                className="icon-btn"
                onClick={() =>
                  setImages((prev) =>
                    prev.map((im) => (im.id === selectedId ? { ...im, flipX: !im.flipX } : im))
                  )
                }
                title="Espelhar imagem selecionada"
                style={{ height: 20, padding: '0 5px' }}
              >
                <FlipHorizontal2 size={12} />
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  setImages((prev) => prev.filter((im) => im.id !== selectedId));
                  setSelectedId(null);
                }}
                title="Remover imagem selecionada (Delete)"
                style={{ height: 20, padding: '0 5px' }}
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
          <input
            type="range"
            min={25}
            max={100}
            value={Math.round(winOpacity * 100)}
            onChange={(e) => setWinOpacity(Number(e.target.value) / 100)}
            title={`Opacidade da Janela: ${Math.round(winOpacity * 100)}%`}
            style={{ width: 44, accentColor: '#3a86ff' }}
          />
          <button
            className="icon-btn"
            onClick={() => {
              setBoardZoom(1);
              setBoardPan({ x: 0, y: 0 });
            }}
            title="Resetar Zoom/Pan da Referência"
            style={{ height: 20, padding: '0 4px' }}
          >
            <RotateCcw size={11} />
          </button>
          <button
            className="icon-btn"
            onClick={toggleReferenceWindow}
            title="Fechar Janela de Referência"
            style={{ height: 20, padding: '0 4px' }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* PureRef Infinite Canvas Board */}
      <div
        ref={boardRef}
        onPointerDown={(e) => {
          if (e.button === 0) setSelectedId(null);
          startBoardPan(e);
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#1a1a1a',
          cursor: dropperMode ? 'crosshair' : 'default',
          touchAction: 'none'
        }}
      >
        {images.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#737373',
              fontSize: 11.5,
              textAlign: 'center',
              padding: 20,
              pointerEvents: 'none',
              gap: 6
            }}
          >
            <ImagePlus size={26} style={{ opacity: 0.45 }} />
            <div style={{ fontWeight: 600, color: '#a3a3a3' }}>Arraste imagens aqui ou dê Ctrl + V</div>
            <div style={{ fontSize: 10.5 }}>
              Scroll: Zoom • Botão Direito: Mover quadro • Alt+Clique: Pegar cor
            </div>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${boardPan.x}px, ${boardPan.y}px) scale(${boardZoom})`,
            transformOrigin: '0 0'
          }}
        >
          {images.map((item) => {
            const isSel = item.id === selectedId;
            return (
              <div
                key={item.id}
                onPointerDown={(e) => {
                  if (dropperMode || e.altKey) {
                    e.stopPropagation();
                    const imgEl = e.currentTarget.querySelector('img');
                    if (imgEl) sampleFromRefImage(item, imgEl, e.clientX, e.clientY);
                    return;
                  }
                  startImageDrag(item, e);
                }}
                style={{
                  position: 'absolute',
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  height: item.h,
                  outline: isSel ? '2px solid #3a86ff' : 'none',
                  cursor: dropperMode ? 'crosshair' : 'move',
                  touchAction: 'none',
                  userSelect: 'none'
                }}
              >
                <img
                  src={item.src}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'contain',
                    transform: item.flipX ? 'scaleX(-1)' : 'none',
                    pointerEvents: 'none'
                  }}
                />
                {isSel && !dropperMode && (
                  <div
                    onPointerDown={(e) => startImageResize(item, e)}
                    title="Arraste para redimensionar"
                    style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -4,
                      width: 11,
                      height: 11,
                      background: '#3a86ff',
                      border: '1.5px solid #fff',
                      borderRadius: 2,
                      cursor: 'nwse-resize',
                      touchAction: 'none'
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Picked color toast */}
        {pickedHex && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              background: 'rgba(20,20,20,0.92)',
              border: '1px solid #555',
              borderRadius: 4,
              padding: '3px 7px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10.5,
              fontFamily: 'monospace',
              color: '#eee',
              pointerEvents: 'none'
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: pickedHex,
                border: '1px solid #fff'
              }}
            />
            {pickedHex.toUpperCase()}
          </div>
        )}

        {/* Window Resize Grip (Bottom-Right) */}
        <div
          onPointerDown={startWindowResize}
          title="Redimensionar janela"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 14,
            height: 14,
            cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 50%, #555 50%)',
            touchAction: 'none'
          }}
        />
      </div>
    </div>
  );
};
