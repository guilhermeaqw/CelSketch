import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { isTextEditingTarget } from '../utils/appUtils';
import {
  GROUP_COLORS,
  REF_BOARD_STORAGE_KEY,
  getNoteStyle,
  type PersistedBoardState,
  type RefGroup,
  type RefItem
} from './reference/types';
import { RefGifCard } from './reference/RefGifCard';
import { RefVideoCard } from './reference/RefVideoCard';
import { RefToolbar } from './reference/RefToolbar';
import { RefGroupFrame } from './reference/RefGroupFrame';

export const ReferenceWindow: React.FC<{ standalone?: boolean }> = ({ standalone = false }) => {
  const referenceWindowOpen = useHarmonyStore((s) => s.referenceWindowOpen);
  const toggleReferenceWindow = useHarmonyStore((s) => s.toggleReferenceWindow);
  const setActiveColor = useHarmonyStore((s) => s.setActiveColor);
  const pushRecentColor = useHarmonyStore((s) => s.pushRecentColor);

  const isVisible = standalone || referenceWindowOpen;

  const [winPos, setWinPos] = useState({ x: 86, y: 88 });
  const [winSize, setWinSize] = useState({ w: 460, h: 480 });
  const [winOpacity, setWinOpacity] = useState(1);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [grayscaleBoard, setGrayscaleBoard] = useState(false);

  const [boardZoom, setBoardZoom] = useState(1);
  const [boardPan, setBoardPan] = useState({ x: 0, y: 0 });
  const [items, setItems] = useState<RefItem[]>([]);
  const [groups, setGroups] = useState<RefGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [dropperMode, setDropperMode] = useState(false);
  const [pickedHex, setPickedHex] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDomFocused, setIsDomFocused] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [stepSignal, setStepSignal] = useState<{ id: string; delta: number; seq: number } | null>(null);
  const [togglePlaySignal, setTogglePlaySignal] = useState<{ id: string; seq: number } | null>(null);

  const isFocused = standalone || isHovered || isDomFocused;

  const boardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickedTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activeCleanupRef = useRef<(() => void) | null>(null);
  const internalClipboardRef = useRef<{ items: RefItem[]; groups: RefGroup[] } | null>(null);
  const hydratedRef = useRef(false);
  const boardZoomRef = useRef<number>(boardZoom);
  const boardPanRef = useRef(boardPan);
  boardZoomRef.current = boardZoom;
  boardPanRef.current = boardPan;

  const itemsRef = useRef(items);
  const groupsRef = useRef(groups);
  const selectedIdsRef = useRef(selectedIds);
  itemsRef.current = items;
  groupsRef.current = groups;
  selectedIdsRef.current = selectedIds;

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setStatusToast(null), 1600);
  }, []);

  const emitPickedColor = useCallback(
    (hex: string) => {
      if (standalone) {
        window.harmonyAPI?.refPickColor?.(hex);
      } else {
        setActiveColor(hex);
        pushRecentColor(hex);
      }
      setPickedHex(hex);
      if (pickedTimerRef.current) window.clearTimeout(pickedTimerRef.current);
      pickedTimerRef.current = window.setTimeout(() => setPickedHex(null), 1300);
    },
    [standalone, setActiveColor, pushRecentColor]
  );

  const hydrateBoard = useCallback(async () => {
    try {
      let raw = await window.harmonyAPI?.refGetBoardState?.();
      if (!raw) raw = localStorage.getItem(REF_BOARD_STORAGE_KEY);
      if (raw) {
        const parsed: PersistedBoardState = JSON.parse(raw);
        if (Array.isArray(parsed.items)) {
          setItems(parsed.items.filter((it) => !it.src || !it.src.startsWith('blob:')));
        }
        if (Array.isArray(parsed.groups)) setGroups(parsed.groups);
        if (typeof parsed.grayscale === 'boolean') setGrayscaleBoard(parsed.grayscale);
      }
    } catch {
      // ignore corrupted storage
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (isVisible && !hydratedRef.current) hydrateBoard();
  }, [isVisible, hydrateBoard]);

  useEffect(() => {
    if (standalone) return;
    const unsub = window.harmonyAPI?.onRefPopoutClosed?.(() => {
      hydratedRef.current = false;
    });
    return () => {
      unsub?.();
    };
  }, [standalone]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = window.setTimeout(() => {
      const payload: PersistedBoardState = { items, groups, grayscale: grayscaleBoard };
      const json = JSON.stringify(payload);
      window.harmonyAPI?.refSetBoardState?.(json).catch(() => {});
      if (json.length < 3_800_000) {
        try {
          localStorage.setItem(REF_BOARD_STORAGE_KEY, json);
        } catch {
          // ignore localStorage quota overflow
        }
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [items, groups, grayscaleBoard]);

  useEffect(() => {
    if (standalone || !isVisible || !isDomFocused) return;
    const onOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target?.closest('[data-ref-window]')) {
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-ref-window]')) {
          document.activeElement.blur();
        }
        setIsDomFocused(false);
        setEditingNoteId(null);
        setEditingGroupId(null);
      }
    };
    window.addEventListener('pointerdown', onOutsidePointerDown, true);
    return () => window.removeEventListener('pointerdown', onOutsidePointerDown, true);
  }, [standalone, isVisible, isDomFocused]);

  useEffect(() => {
    return () => {
      if (pickedTimerRef.current) window.clearTimeout(pickedTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      activeCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isVisible) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = board.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const prevZ = boardZoomRef.current;
      const nextZ = Math.max(0.15, Math.min(6, prevZ * factor));
      const ratio = nextZ / prevZ;
      boardZoomRef.current = nextZ;
      setBoardZoom(nextZ);
      setBoardPan((p) => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }));
    };
    board.addEventListener('wheel', onWheel, { passive: false });
    return () => board.removeEventListener('wheel', onWheel);
  }, [isVisible]);

  const getSpawnPos = useCallback((offsetIdx = 0) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const z = boardZoomRef.current || 1;
    const p = boardPanRef.current;
    const cx = rect ? (rect.width / 2 - p.x) / z : 180;
    const cy = rect ? (rect.height / 2 - p.y) / z : 160;
    const off = (offsetIdx % 7) * 22;
    return { x: Math.round(cx - 110 + off), y: Math.round(cy - 90 + off) };
  }, []);

  const addMediaDataUrl = useCallback(
    (dataUrl: string, kind: 'image' | 'gif', name?: string) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 300;
        const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth, img.naturalHeight));
        const w = Math.max(64, Math.round(img.naturalWidth * scale));
        const h = Math.max(64, Math.round(img.naturalHeight * scale));
        setItems((prev) => {
          const pos = getSpawnPos(prev.length);
          const item: RefItem = {
            id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind,
            src: dataUrl,
            name,
            x: pos.x,
            y: pos.y,
            w,
            h
          };
          setSelectedIds([item.id]);
          return [...prev, item];
        });
      };
      img.src = dataUrl;
    },
    [getSpawnPos]
  );

  const addVideoSrc = useCallback(
    (src: string, name?: string) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        const vw = v.videoWidth || 320;
        const vh = v.videoHeight || 180;
        const maxDim = 340;
        const scale = Math.min(1, maxDim / Math.max(1, vw, vh));
        const w = Math.max(140, Math.round(vw * scale));
        const h = Math.max(96, Math.round(vh * scale));
        setItems((prev) => {
          const pos = getSpawnPos(prev.length);
          const item: RefItem = {
            id: `ref-vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: 'video',
            src,
            name,
            x: pos.x,
            y: pos.y,
            w,
            h
          };
          setSelectedIds([item.id]);
          return [...prev, item];
        });
      };
      v.onerror = () => showToast('Formato de vídeo não suportado');
      v.src = src;
    },
    [getSpawnPos, showToast]
  );

  const addTextNote = useCallback(
    (initialText = 'Nova nota de referência...\n(Duplo clique para editar)') => {
      setItems((prev) => {
        const pos = getSpawnPos(prev.length);
        const item: RefItem = {
          id: `ref-txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'text',
          text: initialText,
          noteColor: 'slate',
          fontSize: 13,
          x: pos.x,
          y: pos.y,
          w: 210,
          h: 110
        };
        setSelectedIds([item.id]);
        setEditingNoteId(item.id);
        return [...prev, item];
      });
    },
    [getSpawnPos]
  );

  const readFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const lower = (file.name || '').toLowerCase();
        const isVideo =
          file.type.startsWith('video/') ||
          lower.endsWith('.mp4') ||
          lower.endsWith('.webm') ||
          lower.endsWith('.mov') ||
          lower.endsWith('.m4v');
        const isGif = file.type === 'image/gif' || lower.endsWith('.gif');
        const isImage = file.type.startsWith('image/');

        if (isVideo) {
          if (file.size <= 14 * 1024 * 1024) {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') addVideoSrc(reader.result, file.name);
            };
            reader.readAsDataURL(file);
          } else {
            addVideoSrc(URL.createObjectURL(file), file.name);
          }
        } else if (isGif) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') addMediaDataUrl(reader.result, 'gif', file.name);
          };
          reader.readAsDataURL(file);
        } else if (isImage) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') addMediaDataUrl(reader.result, 'image', file.name);
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [addMediaDataUrl, addVideoSrc]
  );

  const groupSelected = useCallback(() => {
    const sel = selectedIdsRef.current;
    if (sel.length === 0) return;
    const newGroup: RefGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `Grupo ${groupsRef.current.length + 1}`,
      color: GROUP_COLORS[groupsRef.current.length % GROUP_COLORS.length]
    };
    const selSet = new Set(sel);
    setGroups((prev) => [...prev, newGroup]);
    setItems((prev) => prev.map((it) => (selSet.has(it.id) ? { ...it, groupId: newGroup.id } : it)));
    showToast(`Grupo criado (${sel.length} ${sel.length === 1 ? 'item' : 'itens'})`);
  }, [showToast]);

  const ungroupSelected = useCallback(() => {
    const selSet = new Set(selectedIdsRef.current);
    if (selSet.size === 0) return;
    const nextItems = itemsRef.current.map((it) => (selSet.has(it.id) ? { ...it, groupId: null } : it));
    const remainingGroupIds = new Set(nextItems.map((it) => it.groupId).filter(Boolean));
    setItems(nextItems);
    setGroups((prev) => prev.filter((g) => remainingGroupIds.has(g.id)));
    showToast('Itens desagrupados');
  }, [showToast]);

  const copySelectedItems = useCallback(() => {
    const selSet = new Set(selectedIdsRef.current);
    const chosen = itemsRef.current.filter((it) => selSet.has(it.id));
    if (chosen.length === 0) return;
    const usedGroupIds = new Set(chosen.map((it) => it.groupId).filter(Boolean));
    const chosenGroups = groupsRef.current.filter((g) => usedGroupIds.has(g.id));
    internalClipboardRef.current = {
      items: chosen.map((it) => ({ ...it })),
      groups: chosenGroups.map((g) => ({ ...g }))
    };
    showToast(`Copiado (${chosen.length} ${chosen.length === 1 ? 'item' : 'itens'})`);
  }, [showToast]);

  const pasteInternalItems = useCallback(() => {
    const clip = internalClipboardRef.current;
    if (!clip || clip.items.length === 0) return false;
    const groupIdMap = new Map<string, string>();
    const clonedGroups: RefGroup[] = clip.groups.map((g, idx) => {
      const nid = `grp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
      groupIdMap.set(g.id, nid);
      return { ...g, id: nid, name: `${g.name} (cópia)` };
    });
    const clonedItems: RefItem[] = clip.items.map((it, idx) => ({
      ...it,
      id: `ref-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      x: Math.round(it.x + 26),
      y: Math.round(it.y + 26),
      groupId: it.groupId ? groupIdMap.get(it.groupId) || null : null
    }));
    internalClipboardRef.current = {
      items: clonedItems.map((it) => ({ ...it })),
      groups: clonedGroups.map((g) => ({ ...g }))
    };
    if (clonedGroups.length > 0) setGroups((prev) => [...prev, ...clonedGroups]);
    setItems((prev) => [...prev, ...clonedItems]);
    setSelectedIds(clonedItems.map((it) => it.id));
    showToast(`Colado (${clonedItems.length} ${clonedItems.length === 1 ? 'item' : 'itens'})`);
    return true;
  }, [showToast]);

  const fitAllItems = useCallback(() => {
    const cur = itemsRef.current;
    const board = boardRef.current;
    if (!board || cur.length === 0) {
      setBoardZoom(1);
      setBoardPan({ x: 0, y: 0 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const it of cur) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.w);
      maxY = Math.max(maxY, it.y + it.h);
    }
    const rect = board.getBoundingClientRect();
    const pad = 32;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const nextZ = Math.max(0.18, Math.min(2.5, Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh)));
    boardZoomRef.current = nextZ;
    setBoardZoom(nextZ);
    setBoardPan({
      x: (rect.width - bw * nextZ) / 2 - minX * nextZ,
      y: (rect.height - bh * nextZ) / 2 - minY * nextZ
    });
  }, []);

  const autoPackGrid = useCallback(() => {
    const cur = itemsRef.current;
    if (cur.length === 0) return;
    const selSet = new Set(selectedIdsRef.current);
    const targets = selSet.size > 1 ? cur.filter((it) => selSet.has(it.id)) : cur;
    const cols = Math.max(1, Math.ceil(Math.sqrt(targets.length)));
    const gap = 16;
    const startX = Math.min(...targets.map((t) => t.x));
    const startY = Math.min(...targets.map((t) => t.y));
    const colHeights = new Array(cols).fill(startY);
    const colWidth = Math.max(180, Math.round(targets.reduce((a, b) => a + b.w, 0) / targets.length));
    const placement = new Map<string, { x: number; y: number }>();

    for (const it of targets) {
      let bestCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[bestCol]) bestCol = c;
      }
      placement.set(it.id, {
        x: Math.round(startX + bestCol * (colWidth + gap)),
        y: Math.round(colHeights[bestCol])
      });
      colHeights[bestCol] += it.h + gap;
    }

    setItems((prev) =>
      prev.map((it) => {
        const p = placement.get(it.id);
        return p ? { ...it, x: p.x, y: p.y } : it;
      })
    );
    showToast('Referências organizadas em grade');
  }, [showToast]);

  useEffect(() => {
    if (!isVisible) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      if (!standalone && !isFocused && itemsRef.current.length > 0) return;
      const cbItems = e.clipboardData?.items;
      const mediaFiles: File[] = [];
      if (cbItems) {
        for (const it of Array.from(cbItems)) {
          if (it.type.startsWith('image/') || it.type.startsWith('video/')) {
            const f = it.getAsFile();
            if (f) mediaFiles.push(f);
          }
        }
      }
      if (mediaFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        readFiles(mediaFiles);
        return;
      }
      if (isFocused && internalClipboardRef.current && internalClipboardRef.current.items.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        pasteInternalItems();
        return;
      }
      const plainText = e.clipboardData?.getData('text/plain')?.trim();
      if (plainText && (standalone || isDomFocused)) {
        e.preventDefault();
        e.stopPropagation();
        addTextNote(plainText);
      }
    };
    window.addEventListener('paste', onPaste, { capture: true });
    return () => window.removeEventListener('paste', onPaste, { capture: true });
  }, [isVisible, standalone, isFocused, isDomFocused, readFiles, pasteInternalItems, addTextNote]);

  useEffect(() => {
    if (!isVisible || (!standalone && !isDomFocused)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'c' && selectedIdsRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        copySelectedItems();
        return;
      }
      if (ctrl && key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (ctrl && key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIds(itemsRef.current.map((it) => it.id));
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const delSet = new Set(selectedIdsRef.current);
        const nextItems = itemsRef.current.filter((it) => !delSet.has(it.id));
        const remGroups = new Set(nextItems.map((it) => it.groupId).filter(Boolean));
        setItems(nextItems);
        setGroups((prev) => prev.filter((g) => remGroups.has(g.id)));
        setSelectedIds([]);
        return;
      }
      if (!ctrl && key === 'h' && selectedIdsRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const selSet = new Set(selectedIdsRef.current);
        setItems((prev) => prev.map((it) => (selSet.has(it.id) ? { ...it, flipX: !it.flipX } : it)));
        return;
      }
      if (!ctrl && key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        fitAllItems();
        return;
      }
      if (!ctrl && (e.key === ',' || e.key === '.' || e.key === ' ') && selectedIdsRef.current.length === 1) {
        const active = itemsRef.current.find((it) => it.id === selectedIdsRef.current[0]);
        if (active && (active.kind === 'gif' || active.kind === 'video')) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === ' ') setTogglePlaySignal({ id: active.id, seq: Date.now() });
          else setStepSignal({ id: active.id, delta: e.key === ',' ? -1 : 1, seq: Date.now() });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [isVisible, standalone, isDomFocused, copySelectedItems, groupSelected, ungroupSelected, fitAllItems]);

  const sampleFromRefImage = (item: RefItem, imgEl: HTMLImageElement, clientX: number, clientY: number) => {
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
    const rect = imgEl.getBoundingClientRect();
    const natAspect = imgEl.naturalWidth / imgEl.naturalHeight;
    const boxAspect = rect.width / Math.max(1, rect.height);
    let drawW = rect.width,
      drawH = rect.height,
      drawLeft = rect.left,
      drawTop = rect.top;
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
    if (d[3] < 10) return;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    emitPickedColor(`#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`);
  };

  const handlePopOutToMonitor = async () => {
    const json = JSON.stringify({ items, groups, grayscale: grayscaleBoard } satisfies PersistedBoardState);
    await window.harmonyAPI?.refSetBoardState?.(json);
    try {
      if (json.length < 3_800_000) localStorage.setItem(REF_BOARD_STORAGE_KEY, json);
    } catch {
      // ignore
    }
    await window.harmonyAPI?.refOpenPopout?.();
    if (!standalone && referenceWindowOpen) toggleReferenceWindow();
  };

  const startWindowDrag = (e: React.PointerEvent) => {
    if (standalone || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX,
      startY = e.clientY;
    const orig = { ...winPos };
    let poppedOut = false;
    const onMove = (ev: PointerEvent) => {
      if (
        !poppedOut &&
        window.harmonyAPI?.refOpenPopout &&
        (ev.clientX < -18 ||
          ev.clientX > window.innerWidth + 18 ||
          ev.clientY < -18 ||
          ev.clientY > window.innerHeight + 18)
      ) {
        poppedOut = true;
        onUp();
        handlePopOutToMonitor();
        return;
      }
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

  const startWindowResize = (e: React.PointerEvent) => {
    if (standalone || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX,
      startY = e.clientY;
    const orig = { ...winSize };
    const onMove = (ev: PointerEvent) => {
      setWinSize({
        w: Math.max(280, Math.min(window.innerWidth - 32, orig.w + (ev.clientX - startX))),
        h: Math.max(220, Math.min(window.innerHeight - 50, orig.h + (ev.clientY - startY)))
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

  const handleBoardPointerDown = (e: React.PointerEvent) => {
    const refHost = (e.currentTarget as HTMLElement).closest('[data-ref-window]') as HTMLElement | null;
    refHost?.focus();
    setEditingNoteId(null);
    setEditingGroupId(null);

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      const startX = e.clientX,
        startY = e.clientY;
      const orig = { ...boardPanRef.current };
      const onMove = (ev: PointerEvent) =>
        setBoardPan({ x: orig.x + (ev.clientX - startX), y: orig.y + (ev.clientY - startY) });
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
      return;
    }

    if (e.button === 0 && !dropperMode) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (!e.shiftKey) setSelectedIds([]);
      const startClientX = e.clientX - rect.left;
      const startClientY = e.clientY - rect.top;
      const initialSel = e.shiftKey ? [...selectedIdsRef.current] : [];

      const onMove = (ev: PointerEvent) => {
        const curX = ev.clientX - rect.left;
        const curY = ev.clientY - rect.top;
        const rx = Math.min(startClientX, curX),
          ry = Math.min(startClientY, curY);
        const rw = Math.abs(curX - startClientX),
          rh = Math.abs(curY - startClientY);
        if (rw < 4 && rh < 4) return;
        setMarqueeBox({ x: rx, y: ry, w: rw, h: rh });
        const z = boardZoomRef.current || 1;
        const p = boardPanRef.current;
        const bx1 = (rx - p.x) / z,
          by1 = (ry - p.y) / z;
        const bx2 = (rx + rw - p.x) / z,
          by2 = (ry + rh - p.y) / z;
        const hits = itemsRef.current
          .filter((it) => it.x < bx2 && it.x + it.w > bx1 && it.y < by2 && it.y + it.h > by1)
          .map((it) => it.id);
        setSelectedIds(Array.from(new Set([...initialSel, ...hits])));
      };
      const onUp = () => {
        setMarqueeBox(null);
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
    }
  };

  const startItemsDrag = (targetIds: string[], e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const refHost = (e.currentTarget as HTMLElement).closest('[data-ref-window]') as HTMLElement | null;
    refHost?.focus();
    const startX = e.clientX,
      startY = e.clientY;
    const dragSet = new Set(targetIds);
    const origMap = new Map<string, { x: number; y: number }>();
    for (const it of itemsRef.current) {
      if (dragSet.has(it.id)) origMap.set(it.id, { x: it.x, y: it.y });
    }
    const onMove = (ev: PointerEvent) => {
      const z = boardZoomRef.current || 1;
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      setItems((prev) =>
        prev.map((it) => {
          const orig = origMap.get(it.id);
          return orig ? { ...it, x: orig.x + dx, y: orig.y + dy } : it;
        })
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

  const startItemResize = (item: RefItem, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX,
      startY = e.clientY;
    const origW = item.w,
      origH = item.h;
    const ratio = origH / Math.max(1, origW);

    const onMove = (ev: PointerEvent) => {
      const z = boardZoomRef.current || 1;
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      if (item.kind === 'text') {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, w: Math.max(120, Math.round(origW + dx)), h: Math.max(54, Math.round(origH + dy)) }
              : it
          )
        );
      } else {
        const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy / Math.max(0.1, ratio);
        const nextW = Math.max(48, origW + delta);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, w: Math.round(nextW), h: Math.round(nextW * ratio) } : it
          )
        );
      }
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

  if (!isVisible) return null;

  const selectedSet = new Set(selectedIds);
  const selectedHasGrouped = items.some((it) => selectedSet.has(it.id) && it.groupId);
  const singleSelectedText =
    selectedIds.length === 1 ? items.find((it) => it.id === selectedIds[0] && it.kind === 'text') || null : null;

  return (
    <div
      tabIndex={0}
      data-ref-window={isFocused ? 'active' : 'idle'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsDomFocused(true)}
      onBlur={() => setIsDomFocused(false)}
      style={
        standalone
          ? {
              width: '100vw',
              height: '100vh',
              background: '#16181e',
              border: isDragOver ? '2px dashed #3a86ff' : '1px solid #2b303c',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              outline: 'none'
            }
          : {
              position: 'fixed',
              left: winPos.x,
              top: winPos.y,
              width: winSize.w,
              height: winSize.h,
              zIndex: 900,
              opacity: winOpacity,
              background: '#16181e',
              border: isDragOver ? '2px dashed #3a86ff' : '1px solid #3c4252',
              borderRadius: 8,
              boxShadow: '0 14px 38px rgba(0,0,0,0.68)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              outline: 'none'
            }
      }
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files?.length) readFiles(e.dataTransfer.files);
      }}
    >
      <RefToolbar
        standalone={standalone}
        selectedCount={selectedIds.length}
        selectedHasGrouped={selectedHasGrouped}
        singleSelectedText={singleSelectedText}
        dropperMode={dropperMode}
        grayscaleBoard={grayscaleBoard}
        winOpacity={winOpacity}
        alwaysOnTop={alwaysOnTop}
        fileInputRef={fileInputRef}
        onStartWindowDrag={startWindowDrag}
        onReadFiles={readFiles}
        onAddTextNote={() => addTextNote()}
        onToggleDropper={() => setDropperMode((d) => !d)}
        onToggleGrayscale={() => setGrayscaleBoard((g) => !g)}
        onGroupSelected={groupSelected}
        onUngroupSelected={ungroupSelected}
        onFlipSelected={() => {
          const sel = new Set(selectedIds);
          setItems((prev) => prev.map((it) => (sel.has(it.id) ? { ...it, flipX: !it.flipX } : it)));
        }}
        onDeleteSelected={() => {
          const del = new Set(selectedIds);
          const next = items.filter((it) => !del.has(it.id));
          const remGroups = new Set(next.map((it) => it.groupId).filter(Boolean));
          setItems(next);
          setGroups((prev) => prev.filter((g) => remGroups.has(g.id)));
          setSelectedIds([]);
        }}
        onAutoPackGrid={autoPackGrid}
        onFitAll={fitAllItems}
        onChangeOpacity={(v) => {
          setWinOpacity(v);
          if (standalone) window.harmonyAPI?.refSetWindowOpacity?.(v);
        }}
        onToggleAlwaysOnTop={() => {
          const next = !alwaysOnTop;
          setAlwaysOnTop(next);
          window.harmonyAPI?.refSetAlwaysOnTop?.(next);
        }}
        onPopOut={handlePopOutToMonitor}
        onCloseDocked={toggleReferenceWindow}
        onUpdateTextNote={(id, patch) =>
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
        }
      />

      {/* PureRef Infinite Canvas Board */}
      <div
        ref={boardRef}
        onPointerDown={handleBoardPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#16181e',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          cursor: dropperMode ? 'crosshair' : 'default',
          touchAction: 'none'
        }}
      >
        {items.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7e8799',
              fontSize: 11.5,
              textAlign: 'center',
              padding: 24,
              pointerEvents: 'none',
              gap: 8
            }}
          >
            <ImagePlus size={28} style={{ opacity: 0.4 }} />
            <div style={{ fontWeight: 600, color: '#cbd5e1', fontSize: 12.5 }}>
              Arraste Imagens, GIFs ou Vídeos MP4 — ou dê Ctrl + V
            </div>
            <div style={{ fontSize: 10.5, lineHeight: 1.5, maxWidth: 320 }}>
              Scroll: Zoom • Botão Direito: Mover quadro • Arraste no vazio: Selecionar vários
              <br />
              Ctrl+G: Agrupar • Ctrl+C/V: Copiar/Colar • Alt+Clique: Pegar cor • Vídeos/GIFs: , e . quadro a quadro
            </div>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${boardPan.x}px, ${boardPan.y}px) scale(${boardZoom})`,
            transformOrigin: '0 0',
            filter: grayscaleBoard ? 'grayscale(100%)' : 'none'
          }}
        >
          {groups.map((grp) => {
            const members = items.filter((it) => it.groupId === grp.id);
            const allSelected = members.length > 0 && members.every((m) => selectedSet.has(m.id));
            return (
              <RefGroupFrame
                key={grp.id}
                group={grp}
                members={members}
                allSelected={allSelected}
                isEditing={editingGroupId === grp.id}
                onStartDrag={startItemsDrag}
                onSelectMembers={(memberIds, additive) =>
                  setSelectedIds(additive ? Array.from(new Set([...selectedIds, ...memberIds])) : memberIds)
                }
                onStartEdit={() => setEditingGroupId(grp.id)}
                onRename={(name) => setGroups((prev) => prev.map((g) => (g.id === grp.id ? { ...g, name } : g)))}
                onFinishEdit={() => setEditingGroupId(null)}
              />
            );
          })}

          {items.map((item) => {
            const isSel = selectedSet.has(item.id);
            const isEditingText = editingNoteId === item.id;
            const noteTheme = getNoteStyle(item.noteColor);

            return (
              <div
                key={item.id}
                onPointerDown={(e) => {
                  if (item.kind === 'image' && (dropperMode || e.altKey)) {
                    e.stopPropagation();
                    const imgEl = e.currentTarget.querySelector('img');
                    if (imgEl) sampleFromRefImage(item, imgEl, e.clientX, e.clientY);
                    return;
                  }
                  if ((item.kind === 'gif' || item.kind === 'video') && (dropperMode || e.altKey)) return;
                  if (isEditingText) {
                    e.stopPropagation();
                    return;
                  }

                  let nextDragIds: string[];
                  if (e.shiftKey) {
                    if (selectedSet.has(item.id)) {
                      setSelectedIds(selectedIds.filter((id) => id !== item.id));
                      return;
                    }
                    nextDragIds = [...selectedIds, item.id];
                    setSelectedIds(nextDragIds);
                  } else if (selectedSet.has(item.id)) {
                    nextDragIds = selectedIds;
                  } else if (item.groupId) {
                    nextDragIds = items.filter((it) => it.groupId === item.groupId).map((it) => it.id);
                    setSelectedIds(nextDragIds);
                  } else {
                    nextDragIds = [item.id];
                    setSelectedIds(nextDragIds);
                  }
                  startItemsDrag(nextDragIds, e);
                }}
                onDoubleClick={(e) => {
                  if (item.kind === 'text') {
                    e.stopPropagation();
                    setSelectedIds([item.id]);
                    setEditingNoteId(item.id);
                  }
                }}
                style={{
                  position: 'absolute',
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  height: item.h,
                  outline: isSel ? '2px solid #3a86ff' : 'none',
                  outlineOffset: 1,
                  borderRadius: item.kind === 'text' ? 7 : 3,
                  cursor: dropperMode ? 'crosshair' : isEditingText ? 'text' : 'move',
                  touchAction: 'none',
                  userSelect: isEditingText ? 'text' : 'none'
                }}
              >
                {item.kind === 'image' && (
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
                )}
                {item.kind === 'gif' && (
                  <RefGifCard
                    item={item}
                    isSelected={isSel}
                    dropperMode={dropperMode}
                    onSampleColor={emitPickedColor}
                    stepSignal={stepSignal}
                    togglePlaySignal={togglePlaySignal}
                  />
                )}
                {item.kind === 'video' && (
                  <RefVideoCard
                    item={item}
                    isSelected={isSel}
                    dropperMode={dropperMode}
                    onSampleColor={emitPickedColor}
                    stepSignal={stepSignal}
                    togglePlaySignal={togglePlaySignal}
                  />
                )}
                {item.kind === 'text' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: noteTheme.bg,
                      border: `1px solid ${noteTheme.border}`,
                      borderRadius: 7,
                      padding: '8px 10px',
                      boxSizing: 'border-box',
                      color: noteTheme.text,
                      fontSize: item.fontSize || 13,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.35)'
                    }}
                  >
                    {isEditingText ? (
                      <textarea
                        autoFocus
                        value={item.text || ''}
                        onChange={(e) =>
                          setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it)))
                        }
                        onBlur={() => setEditingNoteId(null)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') setEditingNoteId(null);
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'transparent',
                          border: 'none',
                          color: noteTheme.text,
                          fontSize: item.fontSize || 13,
                          lineHeight: 1.4,
                          fontFamily: 'inherit',
                          resize: 'none',
                          outline: 'none'
                        }}
                      />
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.text || ''}</div>
                    )}
                  </div>
                )}

                {isSel && !dropperMode && !isEditingText && (
                  <div
                    onPointerDown={(e) => startItemResize(item, e)}
                    title="Arraste para redimensionar"
                    style={{
                      position: 'absolute',
                      right: -5,
                      bottom: -5,
                      width: 11,
                      height: 11,
                      background: '#3a86ff',
                      border: '1.5px solid #fff',
                      borderRadius: 2,
                      cursor: 'nwse-resize',
                      touchAction: 'none',
                      zIndex: 5
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {marqueeBox && (
          <div
            style={{
              position: 'absolute',
              left: marqueeBox.x,
              top: marqueeBox.y,
              width: marqueeBox.w,
              height: marqueeBox.h,
              background: 'rgba(58, 134, 255, 0.16)',
              border: '1px solid rgba(96, 165, 250, 0.9)',
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 40
            }}
          />
        )}

        {pickedHex && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              background: 'rgba(20,22,28,0.94)',
              border: '1px solid #4b5563',
              borderRadius: 6,
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#f3f4f6',
              pointerEvents: 'none',
              zIndex: 50
            }}
          >
            <span
              style={{
                width: 13,
                height: 13,
                borderRadius: 3,
                background: pickedHex,
                border: '1px solid #fff'
              }}
            />
            {pickedHex.toUpperCase()}
          </div>
        )}

        {statusToast && (
          <div
            style={{
              position: 'absolute',
              right: 12,
              bottom: 10,
              background: 'rgba(20, 23, 30, 0.92)',
              border: '1px solid #3c4252',
              borderRadius: 6,
              padding: '4px 9px',
              fontSize: 10.5,
              color: '#cbd5e1',
              pointerEvents: 'none',
              zIndex: 50
            }}
          >
            {statusToast}
          </div>
        )}

        {!standalone && (
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
              background: 'linear-gradient(135deg, transparent 50%, #555c6e 50%)',
              touchAction: 'none'
            }}
          />
        )}
      </div>
    </div>
  );
};
