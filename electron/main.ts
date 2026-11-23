import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'CelSketch',
    backgroundColor: '#232323',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
  return mainWindow?.isMaximized() ?? false;
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// Save Project (.celsketch)
ipcMain.handle('file:saveProject', async (_event, { content, currentPath }: { content: string; currentPath?: string | null }) => {
  let filePath = currentPath;
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save CelSketch Project',
      defaultPath: 'Untitled.celsketch',
      filters: [{ name: 'CelSketch Project', extensions: ['celsketch'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = result.filePath;
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return { canceled: false, filePath };
});

// Save Project As (.celsketch)
ipcMain.handle('file:saveProjectAs', async (_event, { content }: { content: string }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save CelSketch Project As',
    defaultPath: 'Untitled.celsketch',
    filters: [{ name: 'CelSketch Project', extensions: ['celsketch'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return { canceled: false, filePath: result.filePath };
});

// Auto-Save (silent: updates currentPath or saves recovery backup in userData)
ipcMain.handle('file:autoSave', async (_event, { content, currentPath }: { content: string; currentPath?: string | null }) => {
  const targetPath = currentPath || path.join(app.getPath('userData'), 'autosave_recovery.celsketch');
  fs.writeFileSync(targetPath, content, 'utf-8');
  return { ok: true, filePath: targetPath };
});

// Open Project (.celsketch)
ipcMain.handle('file:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open CelSketch Project',
    filters: [{ name: 'CelSketch Project', extensions: ['celsketch', 'nexo', 'hrm'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { canceled: false, filePath, content };
});

// Open Project by exact path (Recent Projects)
ipcMain.handle('file:openProjectByPath', async (_event, { filePath }: { filePath: string }) => {
  if (!filePath || !fs.existsSync(filePath)) return { canceled: true, error: 'File not found' };
  const content = fs.readFileSync(filePath, 'utf-8');
  return { canceled: false, filePath, content };
});

// Import external drawing/animation files (.psd, .kra, .clip, .png, .jpg, .webp, .svg)
ipcMain.handle('file:importExternal', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import Artwork (.psd, .kra, .clip, .png, .jpg, .webp, .svg)',
    filters: [
      { name: 'All Supported Artwork', extensions: ['psd', 'kra', 'clip', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg'] },
      { name: 'Layered Projects (PSD / KRA / CLIP)', extensions: ['psd', 'kra', 'clip'] },
      { name: 'Images (PNG / JPG / WEBP / SVG)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const bytes = fs.readFileSync(filePath);
  return { canceled: false, filePath, ext, bytes: new Uint8Array(bytes) };
});

// Export Single PNG
ipcMain.handle('file:exportPng', async (_event, { dataUrl, defaultName }: { dataUrl: string; defaultName: string }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Frame as PNG',
    defaultPath: defaultName || 'frame_0001.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(result.filePath, Buffer.from(base64Data, 'base64'));
  return { canceled: false, filePath: result.filePath };
});

// Pick directory for PNG Sequence
ipcMain.handle('file:pickDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Folder for PNG Sequence Export',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  return { canceled: false, dirPath: result.filePaths[0] };
});

// Write a single frame PNG to a chosen directory (streams frame-by-frame)
ipcMain.handle('file:writeFrameToDir', async (_event, { dirPath, name, dataUrl }: { dirPath: string; name: string; dataUrl: string }) => {
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(dirPath, name), Buffer.from(base64Data, 'base64'));
  return { ok: true };
});

// Save binary file (GIF / MP4 / WebM)
ipcMain.handle('file:saveBinaryFile', async (_event, { defaultName, filterName, extensions, bytes }: { defaultName: string; filterName: string; extensions: string[]; bytes: Uint8Array }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: `Export ${filterName}`,
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, Buffer.from(bytes));
  return { canceled: false, filePath: result.filePath };
});

// Open exported folder or file in Explorer
ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  await shell.openPath(targetPath);
});
