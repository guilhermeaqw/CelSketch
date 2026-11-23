import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { renderFrameToCanvas } from '../utils/canvasRenderer';
import { exportPngSequence, exportGifAnimation, exportVideoAnimation } from '../utils/exporter';

type ExportFormat = 'png' | 'png_seq' | 'gif' | 'mp4';

export const ExportModal: React.FC = () => {
  const {
    exportModalOpen,
    setExportModalOpen,
    projectName,
    canvasWidth,
    canvasHeight,
    fps,
    totalFrames,
    playStart,
    playEnd,
    currentFrame,
    layers
  } = useHarmonyStore();

  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [startFrame, setStartFrame] = useState(playStart);
  const [endFrame, setEndFrame] = useState(playEnd);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (exportModalOpen) {
      setStartFrame(playStart);
      setEndFrame(playEnd);
      setStatus('');
    }
  }, [exportModalOpen, playStart, playEnd]);

  if (!exportModalOpen) return null;

  const handleExport = async () => {
    setBusy(true);
    setStatus('Preparing export...');
    try {
      if (format === 'png') {
        const offscreen = document.createElement('canvas');
        renderFrameToCanvas(offscreen, layers, currentFrame, canvasWidth, canvasHeight, '#ffffff');
        const dataUrl = offscreen.toDataURL('image/png');
        const pad = String(currentFrame).padStart(4, '0');
        const res = await window.harmonyAPI?.exportPng(dataUrl, `${projectName}_${pad}.png`);
        setStatus(res?.canceled ? '' : 'PNG exported!');
      } else if (format === 'png_seq') {
        const res = await exportPngSequence(
          layers,
          startFrame,
          endFrame,
          canvasWidth,
          canvasHeight,
          projectName,
          setStatus
        );
        setStatus(res.canceled ? '' : `Exported ${res.count} PNG frames!`);
      } else if (format === 'gif') {
        const res = await exportGifAnimation(
          layers,
          startFrame,
          endFrame,
          fps,
          canvasWidth,
          canvasHeight,
          projectName,
          setStatus
        );
        setStatus(res.canceled ? '' : 'Animated GIF exported!');
      } else if (format === 'mp4') {
        const res = await exportVideoAnimation(
          layers,
          startFrame,
          endFrame,
          fps,
          canvasWidth,
          canvasHeight,
          projectName,
          setStatus
        );
        setStatus(res.canceled ? '' : 'Video exported!');
      }
    } catch (err) {
      console.error(err);
      setStatus('Export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
    >
      <div
        style={{
          width: 380,
          background: '#2b2b2b',
          border: '1px solid #4a4a4a',
          borderRadius: 6,
          boxShadow: '0 12px 36px rgba(0,0,0,0.65)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: 36,
            background: '#222',
            borderBottom: '1px solid #3a3a3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px'
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 12.5 }}>Export Animation — CelSketch</span>
          <button className="icon-btn" onClick={() => !busy && setExportModalOpen(false)}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="prop-label">Format</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { id: 'mp4', label: 'MP4 Video' },
                { id: 'gif', label: 'Animated GIF' },
                { id: 'png_seq', label: 'PNG Sequence' },
                { id: 'png', label: 'Current Frame (PNG)' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFormat(opt.id as ExportFormat)}
                  className={`icon-btn ${format === opt.id ? 'active' : ''}`}
                  style={{ height: 30, justifyContent: 'center' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {format !== 'png' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                Start Frame:
                <input
                  type="number"
                  min={1}
                  max={totalFrames}
                  value={startFrame}
                  onChange={(e) => setStartFrame(Math.max(1, Math.min(totalFrames, Number(e.target.value))))}
                  className="harmony-input"
                  style={{ width: 56 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                End Frame:
                <input
                  type="number"
                  min={startFrame}
                  max={totalFrames}
                  value={endFrame}
                  onChange={(e) => setEndFrame(Math.max(startFrame, Math.min(totalFrames, Number(e.target.value))))}
                  className="harmony-input"
                  style={{ width: 56 }}
                />
              </label>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#999' }}>
            Resolution: {canvasWidth}×{canvasHeight} • {fps} FPS
          </div>

          {status && (
            <div style={{ fontSize: 11.5, color: '#4ade80', fontWeight: 600 }}>
              {status}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              className="icon-btn"
              onClick={() => setExportModalOpen(false)}
              disabled={busy}
              style={{ padding: '4px 12px' }}
            >
              Close
            </button>
            <button
              className="icon-btn active"
              onClick={handleExport}
              disabled={busy}
              style={{ padding: '4px 16px', fontWeight: 600 }}
            >
              <Download size={13} />
              <span>{busy ? 'Exporting...' : 'Export'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
