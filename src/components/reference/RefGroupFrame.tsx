import React from 'react';
import type { RefGroup, RefItem } from './types';

export interface RefGroupFrameProps {
  group: RefGroup;
  members: RefItem[];
  allSelected: boolean;
  isEditing: boolean;
  onStartDrag: (memberIds: string[], e: React.PointerEvent) => void;
  onSelectMembers: (memberIds: string[], additive: boolean) => void;
  onStartEdit: () => void;
  onRename: (name: string) => void;
  onFinishEdit: () => void;
}

export const RefGroupFrame: React.FC<RefGroupFrameProps> = ({
  group,
  members,
  allSelected,
  isEditing,
  onStartDrag,
  onSelectMembers,
  onStartEdit,
  onRename,
  onFinishEdit
}) => {
  if (members.length === 0) return null;
  const pad = 12;
  const headerH = 22;
  const minX = Math.min(...members.map((m) => m.x)) - pad;
  const minY = Math.min(...members.map((m) => m.y)) - pad - headerH;
  const maxX = Math.max(...members.map((m) => m.x + m.w)) + pad;
  const maxY = Math.max(...members.map((m) => m.y + m.h)) + pad;
  const memberIds = members.map((m) => m.id);

  return (
    <div
      style={{
        position: 'absolute',
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY,
        background: `${group.color}12`,
        border: `1.5px dashed ${allSelected ? '#ffffff' : group.color}`,
        borderRadius: 8,
        pointerEvents: 'none'
      }}
    >
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelectMembers(memberIds, e.shiftKey);
          onStartDrag(memberIds, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          height: headerH,
          background: `${group.color}33`,
          borderBottom: `1px solid ${group.color}55`,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'move',
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
      >
        {isEditing ? (
          <input
            autoFocus
            value={group.name}
            onChange={(e) => onRename(e.target.value)}
            onBlur={onFinishEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') onFinishEdit();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              border: '1px solid #fff',
              borderRadius: 3,
              fontSize: 10.5,
              padding: '0 4px',
              width: 140,
              outline: 'none'
            }}
          />
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#f3f4f6' }}>
            {group.name} ({members.length})
          </span>
        )}
      </div>
    </div>
  );
};
