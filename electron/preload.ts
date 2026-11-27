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
  listFonts: () => ipcRenderer.invoke('system:listFonts'),

  // Launcher & Auto-Updater APIs
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getLauncherPrefs: () => ipcRenderer.invoke('launcher:getPrefs'),
  setLauncherPrefs: (prefs: { autoLaunchIfUpToDate?: boolean }) => ipcRenderer.invoke('launcher:setPrefs', prefs),
  launchEditor: (opts?: { projectPath?: string | null }) => ipcRenderer.invoke('launcher:launchEditor', opts),
  openLauncher: () => ipcRenderer.invoke('launcher:openLauncher'),
  pickProjectFile: () => ipcRenderer.invoke('launcher:pickProjectFile'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getLastUpdateCheck: () => ipcRenderer.invoke('updater:getLastCheck'),
  downloadUpdate: (assetUrl: string, assetName: string, expectedSha256: string | null) =>
    ipcRenderer.invoke('updater:download', { assetUrl, assetName, expectedSha256 }),
  cancelDownload: () => ipcRenderer.invoke('updater:cancelDownload'),
  installUpdate: (filePath: string, installMode: string) =>
    ipcRenderer.invoke('updater:install', { filePath, installMode }),
  onUpdateProgress: (callback: (progress: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },
  onUpdateStatusChanged: (callback: (result: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: any) => callback(result);
    ipcRenderer.on('updater:statusChanged', listener);
    return () => ipcRenderer.removeListener('updater:statusChanged', listener);
  },

  // Multi-monitor Reference Window APIs
  refOpenPopout: () => ipcRenderer.invoke('ref:openPopout'),
  refClosePopout: () => ipcRenderer.invoke('ref:closePopout'),
  refSetAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('ref:setAlwaysOnTop', flag),
  refSetWindowOpacity: (alpha: number) => ipcRenderer.invoke('ref:setWindowOpacity', alpha),
  refPickColor: (hex: string) => ipcRenderer.invoke('ref:pickColor', hex),
  refSetBoardState: (json: string) => ipcRenderer.invoke('ref:setBoardState', json),
  refGetBoardState: () => ipcRenderer.invoke('ref:getBoardState'),
  onRefColorPicked: (callback: (hex: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, hex: string) => callback(hex);
    ipcRenderer.on('ref:colorPicked', listener);
    return () => ipcRenderer.removeListener('ref:colorPicked', listener);
  },
  onRefPopoutClosed: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('ref:popoutClosed', listener);
    return () => ipcRenderer.removeListener('ref:popoutClosed', listener);
  }
});
