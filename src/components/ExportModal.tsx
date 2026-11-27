import React, { useState, useEffect, useMemo } from 'react';
import { X, Download } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { preloadFrameImages, renderFrameToCanvas } from '../utils/canvasRenderer';
import {
  computeGifDimensions,
  exportPngSequence,
  exportGifAnimation,
  exportVideoAnimation,
  pickSupportedVideoCodec
} from '../utils/exporter';

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
    layers,
    postProcess
  } = useHarmonyStore(
    useShallow((s) => ({
      exportModalOpen: s.exportModalOpen,
      setExportModalOpen: s.setExportModalOpen,
      projectName: s.projectName,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      fps: s.fps,
      totalFrames: s.totalFrames,
      playStart: s.playStart,
      playEnd: s.playEnd,
      currentFrame: s.currentFrame,
      layers: s.layers,
      postProcess: s.postProcess
    }))
  );

  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [startFrame, setStartFrame] = useState(playStart);
  const [endFrame, setEndFrame] = useState(playEnd);
  const [transparentBg, setTransparentBg] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const videoCodec = useMemo(() => pickSupportedVideoCodec(), []);
  const gifDims = useMemo(() => computeGifDimensions(canvasWidth, canvasHeight), [canvasWidth, canvasHeight]);

  useEffect(() => {
    if (exportModalOpen) {
      setStartFrame(playStart);
      setEndFrame(playEnd);
      setStatus('');
      setIsError(false);
    }
  }, [exportModalOpen, playStart, playEnd]);

  useEffect(() => {
    if (!exportModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        setExportModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [exportModalOpen, busy, setExportModalOpen]);

  if (!exportModalOpen) return null;

  const safeStart = Math.max(1, Math.min(totalFrames, startFrame));
  const safeEnd = Math.max(safeStart, Math.min(totalFrames, endFrame));

  const handleExport = async () => {
    setBusy(true);
    setIsError(false);
    setStatus('Preparando exportação...');
    try {
      if (format === 'png') {
        await preloadFrameImages(layers, currentFrame, currentFrame);
        const offscreen = document.createElement('canvas');
        renderFrameToCanvas(
          offscreen,
          layers,
          currentFrame,
          canvasWidth,
          canvasHeight,
          transparentBg ? null : '#ffffff',
          true,
          postProcess
        );
        const dataUrl = offscreen.toDataURL('image/png');
        const pad = String(currentFrame).padStart(4, '0');
        const safeName = (projectName || 'CelSketch').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
        const res = await window.harmonyAPI?.exportPng(dataUrl, `${safeName}_${pad}.png`);
        if (res?.error) {
          setIsError(true);
          setStatus(`Erro: ${res.error}`);
        } else {
          setStatus(res?.canceled ? '' : 'PNG exportado com sucesso!');
        }
      } else if (format === 'png_seq') {
        const res = await exportPngSequence(
          layers,
          safeStart,
          safeEnd,
          canvasWidth,
          canvasHeight,
          projectName,
          setStatus,
          transparentBg,
          postProcess
        );
        if (res.error) {
          setIsError(true);
          setStatus(`Erro: ${res.error}`);
        } else {
          setStatus(res.canceled ? '' : `${res.count} frames PNG exportados!`);
        }
      } else if (format === 'gif') {
        const res = await exportGifAnimation(
          layers,
          safeStart,
          safeEnd,
          fps,
          canvasWidth,
          canvasHeight,
          projectName,
          setStatus,
          postProcess
        );
        if (res.error) {
          setIsError(true);
          setStatus(`Erro: ${res.error}`);
        } else {
          setStatus(res.canceled ? '' : 'GIF animado exportado!');
        }
      } else if (format === 'mp4') {
        const res = await exportVideoAnimation(
          layers,
          safeStart,
          safeEnd,
          fps,
          canvasWidth,
          canvasHeight,
          projectName,
          setStatus,
          postProcess
        );
        if (res.error) {
          setIsError(true);
          setStatus(`Erro: ${res.error}`);
        } else {
          setStatus(res.canceled ? '' : `${videoCodec.label} exportado!`);
        }
      }
    } catch (err: any) {
      console.error(err);
      setIsError(true);
      setStatus(err?.message ? `Falha: ${err.message}` : 'Falha na exportação.');
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
          width: 390,
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
          <span style={{ fontWeight: 600, fontSize: 12.5 }}>Exportar Animação — CelSketch</span>
          <button className="icon-btn" onClick={() => !busy && setExportModalOpen(false)}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="prop-label">Formato</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { id: 'mp4', label: videoCodec.label },
                { id: 'gif', label: 'GIF Animado' },
                { id: 'png_seq', label: 'Sequência PNG' },
                { id: 'png', label: 'Frame Atual (PNG)' }
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
                Início:
                <input
                  type="number"
                  min={1}
                  max={totalFrames}
                  value={startFrame}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(totalFrames, Number(e.target.value) || 1));
                    setStartFrame(v);
                    if (v > endFrame) setEndFrame(v);
                  }}
                  className="harmony-input"
                  style={{ width: 56 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                Fim:
                <input
                  type="number"
                  min={startFrame}
                  max={totalFrames}
                  value={endFrame}
                  onChange={(e) => {
                    const v = Math.max(startFrame, Math.min(totalFrames, Number(e.target.value) || startFrame));
                    setEndFrame(v);
                  }}
                  className="harmony-input"
                  style={{ width: 56 }}
                />
              </label>
            </div>
          )}

          {(format === 'png' || format === 'png_seq') && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11.5,
                color: '#d4d4d4',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={(e) => setTransparentBg(e.target.checked)}
              />
              <span>Fundo Transparente (Alpha)</span>
            </label>
          )}

          <div style={{ fontSize: 11, color: '#999' }}>
            Resolução:{' '}
            {format === 'gif' ? `${gifDims.gifW}×${gifDims.gifH} (otimizado)` : `${canvasWidth}×${canvasHeight}`} •{' '}
            {fps} FPS {format !== 'png' ? `• ${safeEnd - safeStart + 1} frames` : ''}
          </div>

          {status && (
            <div style={{ fontSize: 11.5, color: isError ? '#f87171' : '#4ade80', fontWeight: 600 }}>
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
              Fechar
            </button>
            <button
              className="icon-btn active"
              onClick={handleExport}
              disabled={busy}
              style={{ padding: '4px 16px', fontWeight: 600 }}
            >
              <Download size={13} />
              <span>{busy ? 'Exportando...' : 'Exportar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
