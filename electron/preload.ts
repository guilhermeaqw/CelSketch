import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('harmonyAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setDirty: (dirty: boolean) => ipcRenderer.invoke('window:setDirty', dirty),
  confirmClose: (discardRecovery = true) => ipcRenderer.invoke('window:confirmClose', discardRecovery),
  onRequestClose: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('window:requestClose', listener);
    return () => ipcRenderer.removeListener('window:requestClose', listener);
  },
  getLaunchFile: () => ipcRenderer.invoke('file:getLaunchFile'),
  onOpenExternalFile: (callback: (filePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('file:openExternalPath', listener);
    return () => ipcRenderer.removeListener('file:openExternalPath', listener);
  },
  saveProject: (content: string, currentPath?: string | null, defaultName?: string) =>
    ipcRenderer.invoke('file:saveProject', { content, currentPath, defaultName }),
  saveProjectAs: (content: string, defaultName?: string) =>
    ipcRenderer.invoke('file:saveProjectAs', { content, defaultName }),
  autoSave: (content: string, currentPath?: string | null) =>
    ipcRenderer.invoke('file:autoSave', { content, currentPath }),
  checkRecovery: () => ipcRenderer.invoke('file:checkRecovery'),
  clearRecovery: () => ipcRenderer.invoke('file:clearRecovery'),
  openProject: () => ipcRenderer.invoke('file:openProject'),
  openProjectByPath: (filePath: string) => ipcRenderer.invoke('file:openProjectByPath', { filePath }),
  importExternal: () => ipcRenderer.invoke('file:importExternal'),
  importAudio: () => ipcRenderer.invoke('file:importAudio'),
  readAudioByPath: (filePath: string) => ipcRenderer.invoke('file:readAudioByPath', { filePath }),
  exportPng: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke('file:exportPng', { dataUrl, defaultName }),
  pickDirectory: (title?: string) => ipcRenderer.invoke('file:pickDirectory', title),
  getNextStepNumber: (dirPath: string, subFolder: string) =>
    ipcRenderer.invoke('file:getNextStepNumber', { dirPath, subFolder }),
  writeFrameToDir: (dirPath: string, name: string, dataUrl: string) =>
    ipcRenderer.invoke('file:writeFrameToDir', { dirPath, name, dataUrl }),
  saveBinaryFile: (defaultName: string, filterName: string, extensions: string[], bytes: Uint8Array) =>
    ipcRenderer.invoke('file:saveBinaryFile', { defaultName, filterName, extensions, bytes }),
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:openPath', targetPath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  listFonts: () => ipcRenderer.invoke('system:listFonts')
});
