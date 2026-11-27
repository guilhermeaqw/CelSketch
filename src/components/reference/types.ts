export const REF_BOARD_STORAGE_KEY = 'celsketch_ref_board_v2';

export type RefItemKind = 'image' | 'gif' | 'video' | 'text';

export interface RefGroup {
  id: string;
  name: string;
  color: string;
}

export interface RefItem {
  id: string;
  kind: RefItemKind;
  src?: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flipX?: boolean;
  groupId?: string | null;
  text?: string;
  noteColor?: string;
  fontSize?: number;
}

export interface PersistedBoardState {
  items: RefItem[];
  groups: RefGroup[];
  grayscale?: boolean;
}

export const NOTE_PALETTE = [
  { id: 'slate', bg: '#252933', border: '#3e4556', text: '#eef2f7', label: 'Neutro' },
  { id: 'blue', bg: '#1c2b45', border: '#3a86ff', text: '#e0f2fe', label: 'Azul' },
  { id: 'amber', bg: '#3b3018', border: '#d97706', text: '#fef3c7', label: 'Amarelo' },
  { id: 'green', bg: '#183428', border: '#10b981', text: '#d1fae5', label: 'Verde' },
  { id: 'rose', bg: '#3b1d2a', border: '#ec4899', text: '#fce7f3', label: 'Rosa' }
];

export const GROUP_COLORS = ['#3a86ff', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899'];

export function getNoteStyle(noteColor?: string) {
  return NOTE_PALETTE.find((p) => p.id === noteColor) || NOTE_PALETTE[0];
}
