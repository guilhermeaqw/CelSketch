import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';

export const HsvModal: React.FC = () => {
  const {
    hsvModalOpen,
    setHsvModalOpen,
    setHsvPreview,
    applyLayerHsv,
    layers,
    activeLayerId
  } = useHarmonyStore();
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(0);
  const [val, setVal] = useState(0);
  const [allFrames, setAllFrames] = useState(false);

  // Push live real-time preview to CanvasStage whenever sliders change
  useEffect(() => {
    if (!hsvModalOpen) {
      setHsvPreview(null);
      return;
    }
    setHsvPreview({ h: hue, s: sat, v: val, allFrames });
  }, [hsvModalOpen, hue, sat, val, allFrames, setHsvPreview]);

  if (!hsvModalOpen) return null;
  const activeLayer = layers.find((l) => l.id === activeLayerId);

  const handleApply = () => {
    applyLayerHsv(hue, sat, val, allFrames);
    setHue(0);
    setSat(0);
    setVal(0);
    setAllFrames(false);
    setHsvModalOpen(false);
  };

  const handleClose = () => {
    setHue(0);
    setSat(0);
    setVal(0);
    setAllFrames(false);
    setHsvPreview(null);
    setHsvModalOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 74,
        right: 300,
        width: 320,
        background: '#2b2b2b',
        border: '1px solid #4a4a4a',
        borderRadius: 6,
        boxShadow: '0 10px 28px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        zIndex: 2000
      }}
    >
      <div
        style={{
          height: 32,
          background: '#202020',
          borderBottom: '1px solid #3a3a3a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px'
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 11.5 }}>
          HSV — {activeLayer?.name}
        </span>
        <button className="icon-btn" onClick={handleClose}>
          <X size={13} />
        </button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
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

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            color: '#ddd',
            cursor: 'pointer',
            marginTop: 2
          }}
        >
          <input
            type="checkbox"
            checked={allFrames}
            onChange={(e) => setAllFrames(e.target.checked)}
          />
          <span>Aplicar em todos os frames (All Frames)</span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button className="icon-btn" onClick={handleClose} style={{ padding: '4px 10px' }}>
            Cancelar
          </button>
          <button
            className="icon-btn active"
            onClick={handleApply}
            style={{ padding: '4px 14px', fontWeight: 600 }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};
