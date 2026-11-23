import React, { useState } from 'react';
import { useHarmonyStore } from '../store/useHarmonyStore';

export const NodeView: React.FC = () => {
  const { layers, activeLayerId, setActiveLayer, updateNodePosition } = useHarmonyStore();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const compositeX = 360;
  const compositeY = 260;
  const displayX = 270;
  const displayY = 360;
  const writeX = 450;
  const writeY = 360;

  const handleMouseDown = (e: React.MouseEvent, id: string, nodeX: number, nodeY: number) => {
    setActiveLayer(id);
    setDraggingId(id);
    setOffset({ x: e.clientX - nodeX, y: e.clientY - nodeY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId) return;
    updateNodePosition(draggingId, e.clientX - offset.x, e.clientY - offset.y);
  };

  const handleMouseUp = () => {
    setDraggingId(null);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        flex: 1,
        position: 'relative',
        background: '#1c1c1c',
        backgroundImage:
          'radial-gradient(#2f2f2f 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        overflow: 'hidden'
      }}
    >
      {/* SVG Cables */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {layers.map((layer) => {
          const x1 = layer.nodeX + 65;
          const y1 = layer.nodeY + 34;
          const x2 = compositeX + 70;
          const y2 = compositeY;
          const midY = (y1 + y2) / 2;
          return (
            <path
              key={`cable-${layer.id}`}
              d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
              stroke={layer.visible ? '#6ca6ff' : '#555'}
              strokeWidth={2}
              fill="none"
            />
          );
        })}

        {/* Composite to Display */}
        <path
          d={`M ${compositeX + 55} ${compositeY + 34} C ${compositeX + 55} ${compositeY + 70}, ${displayX + 55} ${displayY - 30}, ${displayX + 55} ${displayY}`}
          stroke="#4ade80"
          strokeWidth={2}
          fill="none"
        />
        {/* Composite to Write */}
        <path
          d={`M ${compositeX + 85} ${compositeY + 34} C ${compositeX + 85} ${compositeY + 70}, ${writeX + 55} ${writeY - 30}, ${writeX + 55} ${writeY}`}
          stroke="#f59e0b"
          strokeWidth={2}
          fill="none"
        />
      </svg>

      {/* Drawing Layer Nodes */}
      {layers.map((layer) => (
        <div
          key={layer.id}
          onMouseDown={(e) => handleMouseDown(e, layer.id, layer.nodeX, layer.nodeY)}
          style={{
            position: 'absolute',
            left: layer.nodeX,
            top: layer.nodeY,
            width: 130,
            height: 34,
            background: activeLayerId === layer.id ? '#2e4a73' : '#2e2e2e',
            border: `1.5px solid ${activeLayerId === layer.id ? '#5b93e6' : '#555'}`,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            gap: 6,
            cursor: 'grab',
            boxShadow: '0 3px 8px rgba(0,0,0,0.4)'
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: layer.visible ? layer.tagColor : '#555'
            }}
          />
          <span style={{ fontSize: 11, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {layer.name}
          </span>
        </div>
      ))}

      {/* Composite Node */}
      <div
        style={{
          position: 'absolute',
          left: compositeX,
          top: compositeY,
          width: 140,
          height: 34,
          background: '#2a4d5c',
          border: '1.5px solid #4fa3c7',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: '#e0f7ff',
          boxShadow: '0 3px 10px rgba(0,0,0,0.45)'
        }}
      >
        Composite
      </div>

      {/* Display Node */}
      <div
        style={{
          position: 'absolute',
          left: displayX,
          top: displayY,
          width: 110,
          height: 32,
          background: '#244731',
          border: '1.5px solid #4ade80',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: '#dcfce7'
        }}
      >
        Display
      </div>

      {/* Write Node */}
      <div
        style={{
          position: 'absolute',
          left: writeX,
          top: writeY,
          width: 110,
          height: 32,
          background: '#4d3a1e',
          border: '1.5px solid #f59e0b',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: '#fef3c7'
        }}
      >
        Write
      </div>
    </div>
  );
};
