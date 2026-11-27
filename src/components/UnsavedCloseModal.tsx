import React, { useEffect, useState } from 'react';
import { AlertTriangle, Save, LogOut, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useHarmonyStore } from '../store/useHarmonyStore';
import { saveProjectThumbnail } from './TitleBar';

interface UnsavedCloseModalProps {
  open: boolean;
  onClose: () => void;
}

export const UnsavedCloseModal: React.FC<UnsavedCloseModalProps> = ({ open, onClose }) => {
  const [saving, setSaving] = useState(false);
  const { projectName, projectPath, isDirty, openScenes, activeSceneId } = useHarmonyStore(
    useShallow((s) => ({
      projectName: s.projectName,
      projectPath: s.projectPath,
      isDirty: s.isDirty,
      openScenes: s.openScenes,
      activeSceneId: s.activeSceneId
    }))
  );

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, saving, onClose]);

  if (!open) return null;

  const dirtyScenes: string[] = [];
  if (isDirty) dirtyScenes.push(projectName || 'Cena sem título');
  for (const sc of openScenes) {
    if (sc.id !== activeSceneId && sc.isDirty) {
      dirtyScenes.push(sc.name || 'Cena sem título');
    }
  }

  const handleSaveAndQuit = async () => {
    if (saving || !window.harmonyAPI) return;
    setSaving(true);
    try {
      const s = useHarmonyStore.getState();
      if (s.isDirty) {
        const data = JSON.stringify(s.exportProjectData(), null, 2);
        const res = await window.harmonyAPI.saveProject(data, projectPath, projectName);
        if (res.canceled || !res.filePath) {
          setSaving(false);
          return;
        }
        const name =
          res.filePath.split(/[\\/]/).pop()?.replace(/\.(celsketch|nexo|hrm)$/i, '') || s.projectName;
        s.setProjectMeta(name, res.filePath);
        saveProjectThumbnail(res.filePath);
      }
      await window.harmonyAPI.confirmClose?.(true);
    } catch (err) {
      console.error('Failed to save before quit:', err);
      setSaving(false);
    }
  };

  const handleDiscardAndQuit = async () => {
    if (saving) return;
    await window.harmonyAPI?.confirmClose?.(true);
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 11, 15, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
        userSelect: 'none'
      }}
    >
      <div
        style={{
          width: 430,
          maxWidth: '92vw',
          background: '#1e2026',
          border: '1px solid #3c404b',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.72)',
          overflow: 'hidden',
          color: '#e5e7eb',
          fontFamily: "'Segoe UI', sans-serif"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 12px 16px',
            borderBottom: '1px solid #2c2f38',
            background: '#181a1f'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.14)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <AlertTriangle size={17} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f3f4f6' }}>
                Alterações não salvas
              </div>
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 1 }}>
                Deseja salvar seu trabalho antes de sair do CelSketch?
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            title="Cancelar (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: saving ? 'default' : 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'inline-flex'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body: list of unsaved scenes */}
        <div style={{ padding: '14px 16px' }}>
          {dirtyScenes.length > 0 && (
            <div
              style={{
                background: '#16181d',
                border: '1px solid #2b2e37',
                borderRadius: 8,
                padding: '9px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 130,
                overflowY: 'auto'
              }}
            >
              {dirtyScenes.map((name, idx) => (
                <div
                  key={`${name}-${idx}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#e5e7eb' }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#f59e0b',
                      flexShrink: 0
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#8b92a1', marginTop: 10, lineHeight: 1.45 }}>
            Se você sair sem salvar, todas as alterações recentes serão perdidas permanentemente.
          </div>
        </div>

        {/* Footer buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '12px 16px',
            background: '#181a1f',
            borderTop: '1px solid #2c2f38'
          }}
        >
          <button
            onClick={handleDiscardAndQuit}
            disabled={saving}
            style={{
              padding: '7px 12px',
              borderRadius: 7,
              border: '1px solid rgba(239, 68, 68, 0.35)',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#fca5a5',
              fontSize: 12,
              fontWeight: 500,
              cursor: saving ? 'default' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <LogOut size={13} />
            Sair sem salvar
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '7px 13px',
                borderRadius: 7,
                border: '1px solid #3f434e',
                background: '#272a33',
                color: '#d1d5db',
                fontSize: 12,
                fontWeight: 500,
                cursor: saving ? 'default' : 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveAndQuit}
              disabled={saving}
              style={{
                padding: '7px 15px',
                borderRadius: 7,
                border: 'none',
                background: saving ? '#1d4ed8' : '#2563eb',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 10px rgba(37, 99, 235, 0.35)'
              }}
            >
              <Save size={13} />
              {saving ? 'Salvando...' : 'Salvar e sair'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
