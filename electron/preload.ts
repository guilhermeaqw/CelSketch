import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('harmonyAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  saveProject: (content: string, currentPath?: string | null) =>
    ipcRenderer.invoke('file:saveProject', { content, currentPath }),
  saveProjectAs: (content: string) =>
    ipcRenderer.invoke('file:saveProjectAs', { content }),
  openProject: () => ipcRenderer.invoke('file:openProject'),
  exportPng: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke('file:exportPng', { dataUrl, defaultName }),
  pickDirectory: () => ipcRenderer.invoke('file:pickDirectory'),
  writeFrameToDir: (dirPath: string, name: string, dataUrl: string) =>
    ipcRenderer.invoke('file:writeFrameToDir', { dirPath, name, dataUrl }),
  saveBinaryFile: (defaultName: string, filterName: string, extensions: string[], bytes: Uint8Array) =>
    ipcRenderer.invoke('file:saveBinaryFile', { defaultName, filterName, extensions, bytes }),
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:openPath', targetPath)
});
