import React from 'react';
import { Plus } from 'lucide-react';
import { ColorWheel } from '../ColorWheel';

export interface ColorPanelTabProps {
  activeColor: string;
  secondaryColor: string;
  recentColors: string[];
  onChangeColor: (hex: string) => void;
  onPushRecentColor: (hex: string) => void;
  onSwapColors: () => void;
}

export const ColorPanelTab: React.FC<ColorPanelTabProps> = ({
  activeColor,
  secondaryColor,
  recentColors,
  onChangeColor,
  onPushRecentColor,
  onSwapColors
}) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
    <ColorWheel
      hex={activeColor}
      onChange={onChangeColor}
      onCommit={onPushRecentColor}
    />

    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '4px 12px 10px 12px'
      }}
    >
      <div style={{ position: 'relative', width: 42, height: 34 }}>
        <div
          onClick={onSwapColors}
          title={`Cor Secundária (${secondaryColor.toUpperCase()}) — Clique ou aperte X para alternar`}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 24,
            height: 24,
            borderRadius: 3,
            background: secondaryColor,
            border: '1.5px solid #666',
            cursor: 'pointer'
          }}
        />
        <div
          title={`Cor Principal (${activeColor.toUpperCase()})`}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 24,
            height: 24,
            borderRadius: 3,
            background: activeColor,
            border: '2px solid #ffffff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.6)'
          }}
        />
      </div>
      <button
        className="icon-btn"
        onClick={onSwapColors}
        title="Alternar Cor Principal e Secundária (X)"
        style={{ fontSize: 11, padding: '2px 8px' }}
      >
        ⇄ Alternar (X)
      </button>
    </div>

    <div className="prop-group" style={{ borderTop: '1px solid #383838', borderBottom: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, color: '#999' }}>Cores Recentes</span>
        <button
          className="icon-btn"
          onClick={() => onPushRecentColor(activeColor)}
          title="Adicionar cor atual às recentes"
        >
          <Plus size={12} />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {recentColors.map((hex, idx) => {
          const selected = hex.toLowerCase() === activeColor.toLowerCase();
          return (
            <button
              key={`${hex}-${idx}`}
              onClick={() => onChangeColor(hex)}
              title={hex.toUpperCase()}
              style={{
                width: 24,
                height: 24,
                borderRadius: 3,
                background: hex,
                border: selected ? '2px solid #ffffff' : '1px solid #555',
                cursor: 'pointer',
                boxShadow: selected ? '0 0 0 1px #3a86ff' : 'none'
              }}
            />
          );
        })}
      </div>
    </div>
  </div>
);
