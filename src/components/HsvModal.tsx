import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';

export const HsvModal: React.FC = () => {
  const { hsvModalOpen, setHsvModalOpen, applyLayerHsv, layers, activeLayerId } = useHarmonyStore();
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(0);
  const [val, setVal] = useState(0);

  if (!hsvModalOpen) return null;
  const activeLayer = layers.find((l) => l.id === activeLayerId);

  const handleApply = () => {
    applyLayerHsv(hue, sat, val);
    setHue(0);
    setSat(0);
    setVal(0);
    setHsvModalOpen(false);
  };

  const handleClose = () => {
    setHue(0);
    setSat(0);
    setVal(0);
    setHsvModalOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
    >
      <div
        style={{
          width: 340,
          background: '#2b2b2b',
          border: '1px solid #4a4a4a',
          borderRadius: 6,
          boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: 34,
            background: '#222',
            borderBottom: '1px solid #3a3a3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px'
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 12 }}>
            Hue / Saturation / Value — {activeLayer?.name}
          </span>
          <button className="icon-btn" onClick={handleClose}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="prop-label">
              <span>Hue (Matiz)</span>
              <span>{hue > 0 ? `+${hue}°` : `${hue}°`}</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              value={hue}
              onChange={(e) => setHue(Number(e.target.value))}
              className="harmony-slider"
            />
          </div>

          <div>
            <div className="prop-label">
              <span>Saturation (Saturação)</span>
              <span>{sat > 0 ? `+${sat}%` : `${sat}%`}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={sat}
              onChange={(e) => setSat(Number(e.target.value))}
              className="harmony-slider"
            />
          </div>

          <div>
            <div className="prop-label">
              <span>Value (Brilho / Valor)</span>
              <span>{val > 0 ? `+${val}%` : `${val}%`}</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={val}
              onChange={(e) => setVal(Number(e.target.value))}
              className="harmony-slider"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button className="icon-btn" onClick={handleClose} style={{ padding: '4px 12px' }}>
              Cancel
            </button>
            <button
              className="icon-btn active"
              onClick={handleApply}
              style={{ padding: '4px 14px', fontWeight: 600 }}
            >
              Apply to Layer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
