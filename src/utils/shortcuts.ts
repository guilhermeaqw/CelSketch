export type ShortcutActionId =
  | 'tool_brush'
  | 'tool_eraser'
  | 'tool_pencil'
  | 'tool_paint'
  | 'tool_gradient'
  | 'tool_lasso'
  | 'tool_magicwand'
  | 'tool_liquify'
  | 'tool_line'
  | 'tool_rectangle'
  | 'tool_ellipse'
  | 'tool_text'
  | 'tool_eyedropper'
  | 'tool_hand'
  | 'tool_zoom'
  | 'brush_size_dec'
  | 'brush_size_inc'
  | 'swap_colors'
  | 'crop_mode'
  | 'flip_x'
  | 'reset_view'
  | 'toggle_play'
  | 'toggle_onion'
  | 'toggle_light_table'
  | 'toggle_ref';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  category: 'Ferramentas' | 'Pincel & Tela' | 'Animação & Visualização';
  defaultKey: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // Ferramentas
  { id: 'tool_brush', label: 'Pincel (Brush)', category: 'Ferramentas', defaultKey: 'b' },
  { id: 'tool_eraser', label: 'Borracha (Eraser)', category: 'Ferramentas', defaultKey: 'e' },
  { id: 'tool_pencil', label: 'Lápis (Pencil)', category: 'Ferramentas', defaultKey: 'p' },
  { id: 'tool_paint', label: 'Balde de Tinta (Paint Bucket)', category: 'Ferramentas', defaultKey: 'g' },
  { id: 'tool_gradient', label: 'Degradê (Gradiente)', category: 'Ferramentas', defaultKey: 'k' },
  { id: 'tool_lasso', label: 'Laço de Seleção', category: 'Ferramentas', defaultKey: 'q' },
  { id: 'tool_magicwand', label: 'Varinha Mágica', category: 'Ferramentas', defaultKey: 'w' },
  { id: 'tool_liquify', label: 'Liquify (Deformar)', category: 'Ferramentas', defaultKey: 'j' },
  { id: 'tool_line', label: 'Linha', category: 'Ferramentas', defaultKey: 'l' },
  { id: 'tool_rectangle', label: 'Retângulo', category: 'Ferramentas', defaultKey: 'u' },
  { id: 'tool_ellipse', label: 'Elipse', category: 'Ferramentas', defaultKey: 'o' },
  { id: 'tool_text', label: 'Texto', category: 'Ferramentas', defaultKey: 't' },
  { id: 'tool_eyedropper', label: 'Conta-gotas', category: 'Ferramentas', defaultKey: 'i' },
  { id: 'tool_hand', label: 'Mão (Mover Tela)', category: 'Ferramentas', defaultKey: 'h' },
  { id: 'tool_zoom', label: 'Lupa (Zoom)', category: 'Ferramentas', defaultKey: 'z' },

  // Pincel & Tela
  { id: 'brush_size_dec', label: 'Diminuir Tamanho do Pincel', category: 'Pincel & Tela', defaultKey: 'BracketLeft' },
  { id: 'brush_size_inc', label: 'Aumentar Tamanho do Pincel', category: 'Pincel & Tela', defaultKey: 'BracketRight' },
  { id: 'swap_colors', label: 'Trocar Cor Principal / Secundária', category: 'Pincel & Tela', defaultKey: 'x' },
  { id: 'crop_mode', label: 'Recortar / Redimensionar Tela', category: 'Pincel & Tela', defaultKey: 'c' },
  { id: 'flip_x', label: 'Espelhar Tela Horizontalmente', category: 'Pincel & Tela', defaultKey: 'f1' },
  { id: 'reset_view', label: 'Resetar Zoom / Visualização', category: 'Pincel & Tela', defaultKey: '5' },

  // Animação & Visualização
  { id: 'toggle_play', label: 'Reproduzir / Pausar (Play)', category: 'Animação & Visualização', defaultKey: 'shift+space' },
  { id: 'toggle_onion', label: 'Ligar / Desligar Onion Skin', category: 'Animação & Visualização', defaultKey: 'alt+o' },
  { id: 'toggle_light_table', label: 'Ligar / Desligar Light Table', category: 'Animação & Visualização', defaultKey: 'alt+l' },
  { id: 'toggle_ref', label: 'Abrir / Fechar Janela de Referência', category: 'Animação & Visualização', defaultKey: 'alt+r' }
];

export type ShortcutMap = Record<ShortcutActionId, string>;

const STORAGE_KEY = 'celsketch_custom_shortcuts_v1';

export function getDefaultShortcuts(): ShortcutMap {
  const map = {} as ShortcutMap;
  for (const def of SHORTCUT_DEFINITIONS) {
    map[def.id] = def.defaultKey;
  }
  return map;
}

export function loadCustomShortcuts(): ShortcutMap {
  const defaults = getDefaultShortcuts();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const def of SHORTCUT_DEFINITIONS) {
        if (typeof parsed[def.id] === 'string' && parsed[def.id].trim()) {
          defaults[def.id] = parsed[def.id].trim();
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return defaults;
}

export function saveCustomShortcuts(map: ShortcutMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/** Converts a KeyboardEvent into a canonical shortcut string (e.g. "b", "shift+space", "BracketLeft", "ctrl+alt+r") */
export function keyboardEventToCombo(e: KeyboardEvent): string | null {
  if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
    return null;
  }
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');

  let base: string;
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    base = e.code;
  } else if (e.key === ' ') {
    base = 'space';
  } else {
    base = e.key.toLowerCase();
  }
  return mods.length > 0 ? `${mods.join('+')}+${base}` : base;
}

export function matchesShortcutCombo(e: KeyboardEvent, combo: string | undefined): boolean {
  if (!combo) return false;
  const parts = combo.split('+');
  const keyPart = parts[parts.length - 1];
  const needCtrl = parts.includes('ctrl');
  const needAlt = parts.includes('alt');
  const needShift = parts.includes('shift');

  if ((e.ctrlKey || e.metaKey) !== needCtrl) return false;
  if (e.altKey !== needAlt) return false;
  if (e.shiftKey !== needShift) return false;

  if (keyPart === 'BracketLeft' || keyPart === 'BracketRight') {
    return e.code === keyPart;
  }
  if (keyPart === 'space') {
    return e.key === ' ' || e.code === 'Space';
  }
  return e.key.toLowerCase() === keyPart.toLowerCase();
}

export function formatShortcutLabel(combo: string | undefined): string {
  if (!combo) return '';
  return combo
    .split('+')
    .map((p) => {
      if (p === 'BracketLeft') return '[ / ´';
      if (p === 'BracketRight') return '] / [';
      if (p === 'space') return 'Space';
      if (p === 'ctrl') return 'Ctrl';
      if (p === 'alt') return 'Alt';
      if (p === 'shift') return 'Shift';
      return p.toUpperCase();
    })
    .join('+');
}
