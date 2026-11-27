import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import {
  checkForUpdates,
  downloadUpdate,
  cancelActiveDownload,
  installDownloadedUpdate,
  detectInstallMode,
  type UpdateCheckResult,
  type InstallMode
} from './updater';

const fsp = fs.promises;

// Stable GPU acceleration (avoid enable-zero-copy which causes 2D canvas context loss/blanking on Windows Electron 33)
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let launcherWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let hasUnsavedChanges = false;
let forceClosing = false;
let pendingLaunchFile: string | null = null;
let lastUpdateCheck: UpdateCheckResult | null = null;

interface LauncherPrefs {
  autoLaunchIfUpToDate: boolean;
}

function getLauncherPrefsPath(): string {
  return path.join(app.getPath('userData'), 'launcher_prefs.json');
}

async function readLauncherPrefs(): Promise<LauncherPrefs> {
  try {
    const raw = await fsp.readFile(getLauncherPrefsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      autoLaunchIfUpToDate: Boolean(parsed?.autoLaunchIfUpToDate)
    };
  } catch {
    return { autoLaunchIfUpToDate: false };
  }
}

async function writeLauncherPrefs(prefs: Partial<LauncherPrefs>): Promise<LauncherPrefs> {
  const current = await readLauncherPrefs();
  const next: LauncherPrefs = {
    autoLaunchIfUpToDate:
      typeof prefs.autoLaunchIfUpToDate === 'boolean' ? prefs.autoLaunchIfUpToDate : current.autoLaunchIfUpToDate
  };
  try {
    await writeFileAtomic(getLauncherPrefsPath(), JSON.stringify(next, null, 2));
  } catch {
    // ignore
  }
  return next;
}

const PROJECT_EXTS = new Set(['.celsketch', '.nexo', '.hrm']);

function extractProjectPathFromArgv(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (PROJECT_EXTS.has(ext) && fs.existsSync(arg)) {
      return path.resolve(arg);
    }
  }
  return null;
}

function sanitizeFilename(name: string, fallback = 'Untitled'): string {
  const cleaned = (name || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return cleaned || fallback;
}

async function writeFileAtomic(targetPath: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(targetPath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fsp.writeFile(tmpPath, data);
    await fsp.rename(tmpPath, targetPath);
  } catch (err) {
    try {
      await fsp.unlink(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

function getRecoveryPath(): string {
  return path.join(app.getPath('userData'), 'autosave_recovery.celsketch');
}

// Single-instance lock so double-clicking a .celsketch file reuses the open window
pendingLaunchFile = extractProjectPathFromArgv(process.argv);
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const filePath = extractProjectPathFromArgv(commandLine);
    if (filePath) {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        if (mainWindow.webContents.isLoading()) {
          pendingLaunchFile = filePath;
        } else {
          mainWindow.webContents.send('file:openExternalPath', filePath);
        }
      } else {
        createEditorWindow(filePath);
      }
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (launcherWindow) {
      if (launcherWindow.isMinimized()) launcherWindow.restore();
      launcherWindow.focus();
    } else {
      createLauncherWindow();
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('file:openExternalPath', filePath);
  } else if (mainWindow) {
    pendingLaunchFile = filePath;
  } else {
    createEditorWindow(filePath);
  }
});

function createLauncherWindow() {
  if (launcherWindow) {
    if (launcherWindow.isMinimized()) launcherWindow.restore();
    launcherWindow.focus();
    return;
  }

  launcherWindow = new BrowserWindow({
    width: 900,
    height: 580,
    resizable: false,
    maximizable: false,
    center: true,
    show: false,
    title: 'CelSketch Launcher',
    icon: path.join(__dirname, '../dist/icon.png'),
    backgroundColor: '#16181d',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);

  launcherWindow.webContents.on('will-navigate', (event, url) => {
    const isDevLocal = !app.isPackaged && url.startsWith('http://localhost:5173');
    if (!isDevLocal) {
      event.preventDefault();
    }
  });
  launcherWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  launcherWindow.once('ready-to-show', () => {
    launcherWindow?.show();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    launcherWindow.loadURL('http://localhost:5173/?mode=launcher');
  } else {
    launcherWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { mode: 'launcher' }
    });
  }

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

function createEditorWindow(initialFile?: string | null) {
  if (initialFile) {
    pendingLaunchFile = initialFile;
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    if (initialFile) {
      if (!mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('file:openExternalPath', initialFile);
        pendingLaunchFile = null;
      }
    }
    if (launcherWindow) {
      launcherWindow.close();
    }
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'CelSketch',
    icon: path.join(__dirname, '../dist/icon.png'),
    backgroundColor: '#232323',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);

  // Prevent accidental drag-and-drop navigation away from CelSketch
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDevLocal = !app.isPackaged && url.startsWith('http://localhost:5173');
    if (!isDevLocal) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  let shown = false;
  const revealEditor = () => {
    if (shown || !mainWindow) return;
    shown = true;
    mainWindow.maximize();
    mainWindow.show();
    if (launcherWindow) {
      launcherWindow.close();
    }
  };

  mainWindow.once('ready-to-show', revealEditor);
  setTimeout(revealEditor, 3500);

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (forceClosing || !hasUnsavedChanges || !mainWindow) return;
    event.preventDefault();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    // Show our custom CelSketch UnsavedCloseModal instead of the ugly native OS dialog!
    mainWindow.webContents.send('window:requestClose');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    forceClosing = false;
    hasUnsavedChanges = false;
  });
}

app.whenReady().then(() => {
  if (!gotTheLock) return;
  if (pendingLaunchFile) {
    createEditorWindow(pendingLaunchFile);
  } else {
    createLauncherWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls & dirty state (targets whichever window sent the IPC: Launcher or Editor)
ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow || launcherWindow;
  win?.minimize();
});
ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win || !win.isMaximizable()) return false;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return win.isMaximized();
});
ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow || launcherWindow;
  win?.close();
});
ipcMain.handle('window:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return win?.isMaximized() ?? false;
});
ipcMain.handle('window:setDirty', (_event, dirty: boolean) => {
  hasUnsavedChanges = Boolean(dirty);
});
ipcMain.handle('window:confirmClose', (_event, discardRecovery: boolean) => {
  forceClosing = true;
  if (discardRecovery) {
    try {
      if (fs.existsSync(getRecoveryPath())) fs.unlinkSync(getRecoveryPath());
    } catch {
      // ignore
    }
  }
  mainWindow?.close();
});

// App metadata, Launcher navigation & Auto-Updater IPCs
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  installMode: detectInstallMode(),
  platform: process.platform,
  editorOpen: Boolean(mainWindow)
}));

ipcMain.handle('launcher:getPrefs', async () => readLauncherPrefs());
ipcMain.handle('launcher:setPrefs', async (_event, prefs: Partial<LauncherPrefs>) => writeLauncherPrefs(prefs));

ipcMain.handle('launcher:launchEditor', (_event, opts?: { projectPath?: string | null }) => {
  createEditorWindow(opts?.projectPath || null);
  return { ok: true };
});

ipcMain.handle('launcher:openLauncher', () => {
  createLauncherWindow();
  return { ok: true };
});

ipcMain.handle('launcher:pickProjectFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || launcherWindow || mainWindow;
  if (!win) return { canceled: true };
  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Abrir Projeto CelSketch',
      filters: [{ name: 'CelSketch Project', extensions: ['celsketch', 'nexo', 'hrm'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  } catch (err: any) {
    return { canceled: true, error: err?.message || 'Erro ao escolher arquivo' };
  }
});

ipcMain.handle('updater:check', async () => {
  const res = await checkForUpdates();
  lastUpdateCheck = res;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:statusChanged', res);
  }
  return res;
});

ipcMain.handle('updater:getLastCheck', () => lastUpdateCheck);

ipcMain.handle(
  'updater:download',
  async (
    event,
    { assetUrl, assetName, expectedSha256 }: { assetUrl: string; assetName: string; expectedSha256: string | null }
  ) => {
    const sender = event.sender;
    return downloadUpdate(assetUrl, assetName, expectedSha256, (progress) => {
      if (!sender.isDestroyed()) {
        sender.send('updater:progress', progress);
      }
    });
  }
);

ipcMain.handle('updater:cancelDownload', () => {
  cancelActiveDownload();
  return { ok: true };
});

ipcMain.handle(
  'updater:install',
  async (_event, { filePath, installMode }: { filePath: string; installMode: InstallMode }) => {
    if (mainWindow && hasUnsavedChanges) {
      return {
        ok: false,
        needsSave: true,
        error: 'Você tem alterações não salvas no editor do CelSketch. Salve seu projeto antes de instalar a atualização.'
      };
    }
    const res = await installDownloadedUpdate(filePath, installMode);
    if (res.ok) {
      forceClosing = true;
      setTimeout(() => {
        app.quit();
      }, 250);
    }
    return res;
  }
);

// Launch file (double-click .celsketch)
ipcMain.handle('file:getLaunchFile', () => {
  const f = pendingLaunchFile;
  pendingLaunchFile = null;
  return f;
});

// Save Project (.celsketch) — Atomic write
ipcMain.handle(
  'file:saveProject',
  async (_event, { content, currentPath, defaultName }: { content: string; currentPath?: string | null; defaultName?: string }) => {
    try {
      let filePath = currentPath;
      if (!filePath) {
        if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
        const base = sanitizeFilename(defaultName || 'Untitled', 'Untitled');
        const suggested = base.toLowerCase().endsWith('.celsketch') ? base : `${base}.celsketch`;
        const result = await dialog.showSaveDialog(mainWindow, {
          title: 'Save CelSketch Project',
          defaultPath: suggested,
          filters: [{ name: 'CelSketch Project', extensions: ['celsketch'] }]
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        filePath = result.filePath;
      }
      await writeFileAtomic(filePath, content);
      // Clear recovery backup after successful manual save
      fsp.unlink(getRecoveryPath()).catch(() => {});
      return { canceled: false, filePath };
    } catch (err: any) {
      return { canceled: true, error: err?.message || 'Erro ao salvar projeto' };
    }
  }
);

// Save Project As (.celsketch) — Atomic write
ipcMain.handle(
  'file:saveProjectAs',
  async (_event, { content, defaultName }: { content: string; defaultName?: string }) => {
    try {
      if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
      const base = sanitizeFilename(defaultName || 'Untitled', 'Untitled');
      const suggested = base.toLowerCase().endsWith('.celsketch') ? base : `${base}.celsketch`;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save CelSketch Project As',
        defaultPath: suggested,
        filters: [{ name: 'CelSketch Project', extensions: ['celsketch'] }]
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      await writeFileAtomic(result.filePath, content);
      fsp.unlink(getRecoveryPath()).catch(() => {});
      return { canceled: false, filePath: result.filePath };
    } catch (err: any) {
      return { canceled: true, error: err?.message || 'Erro ao salvar projeto' };
    }
  }
);

// Auto-Save (always writes atomically to recovery backup in userData; never silently overwrites user's real file)
ipcMain.handle('file:autoSave', async (_event, { content }: { content: string; currentPath?: string | null }) => {
  try {
    const targetPath = getRecoveryPath();
    await writeFileAtomic(targetPath, content);
    return { ok: true, filePath: targetPath };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Auto-save failed' };
  }
});

// Check / read / clear crash-recovery backup
ipcMain.handle('file:checkRecovery', async () => {
  try {
    const recoveryPath = getRecoveryPath();
    const stat = await fsp.stat(recoveryPath);
    const content = await fsp.readFile(recoveryPath, 'utf-8');
    return { exists: true, mtimeMs: stat.mtimeMs, content, filePath: recoveryPath };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle('file:clearRecovery', async () => {
  try {
    await fsp.unlink(getRecoveryPath());
  } catch {
    // ignore if absent
  }
  return { ok: true };
});

// Open Project (.celsketch)
ipcMain.handle('file:openProject', async () => {
  try {
    if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open CelSketch Project',
      filters: [{ name: 'CelSketch Project', extensions: ['celsketch', 'nexo', 'hrm'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = await fsp.readFile(filePath, 'utf-8');
    return { canceled: false, filePath, content };
  } catch (err: any) {
    return { canceled: true, error: err?.message || 'Erro ao abrir projeto' };
  }
});

// Open Project by exact path (Recent Projects / Explorer double-click)
ipcMain.handle('file:openProjectByPath', async (_event, { filePath }: { filePath: string }) => {
  try {
    if (!filePath) return { canceled: true, error: 'Caminho inválido' };
    const content = await fsp.readFile(filePath, 'utf-8');
    return { canceled: false, filePath, content };
  } catch (err: any) {
    return { canceled: true, error: err?.code === 'ENOENT' ? 'Arquivo não encontrado' : (err?.message || 'Erro ao ler arquivo') };
  }
});

// Import external drawing/animation files (.psd, .kra, .clip, .png, .jpg, .webp, .svg)
ipcMain.handle('file:importExternal', async () => {
  try {
    if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
    const result = await dialog.showOpenDialog(mainWindow, {
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
    const bytes = await fsp.readFile(filePath);
    return { canceled: false, filePath, ext, bytes: new Uint8Array(bytes) };
  } catch (err: any) {
    return { canceled: true, error: err?.message || 'Erro ao importar arquivo' };
  }
});

// Import audio file (.mp3, .wav, .ogg, .m4a) for Timeline lip-sync
ipcMain.handle('file:importAudio', async () => {
  try {
    if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Audio Track (.mp3, .wav, .ogg, .m4a)',
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const filePath = result.filePaths[0];
    const name = path.basename(filePath);
    const bytes = await fsp.readFile(filePath);
    return { canceled: false, filePath, name, bytes: new Uint8Array(bytes) };
  } catch (err: any) {
    return { canceled: true, error: err?.message || 'Erro ao importar áudio' };
  }
});

// Reload audio by saved file path when reopening a project
ipcMain.handle('file:readAudioByPath', async (_event, { filePath }: { filePath: string }) => {
  try {
    if (!filePath) return { canceled: true, error: 'Caminho inválido' };
    const bytes = await fsp.readFile(filePath);
    return { canceled: false, filePath, name: path.basename(filePath), bytes: new Uint8Array(bytes) };
  } catch (err: any) {
    return { canceled: true, error: err?.message || 'Áudio não encontrado' };
  }
});

// Export Single PNG
ipcMain.handle('file:exportPng', async (_event, { dataUrl, defaultName }: { dataUrl: string; defaultName: string }) => {
  try {
    if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
    const safeName = sanitizeFilename(defaultName || 'frame_0001.png', 'frame_0001.png');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Frame as PNG',
      defaultPath: safeName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    await writeFileAtomic(result.filePath, Buffer.from(base64Data, 'base64'));
    return { canceled: false, filePath: result.filePath };
  } catch (err: any) {
    return { canceled: true, error: err?.message || 'Erro ao exportar PNG' };
  }
});

// Pick directory for PNG Sequence or Auto-Rec Process Folder
ipcMain.handle('file:pickDirectory', async (_event, title?: string) => {
  try {
    if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Selecionar Pasta',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, dirPath: result.filePaths[0] };
  } catch (err: any) {
    return { canceled: true, error: err?.message || 'Erro ao selecionar pasta' };
  }
});

// Inspect existing Auto-Rec folder so step_XXXX.jpg continues instead of overwriting step_0001.jpg
ipcMain.handle('file:getNextStepNumber', async (_event, { dirPath, subFolder }: { dirPath: string; subFolder: string }) => {
  try {
    const resolvedBase = path.resolve(dirPath);
    const resolvedSub = path.resolve(resolvedBase, sanitizeFilename(subFolder, 'Scene'));
    if (!resolvedSub.startsWith(resolvedBase)) return 1;
    const entries = await fsp.readdir(resolvedSub);
    let maxStep = 0;
    for (const name of entries) {
      const m = /^step_(\d+)\.(jpg|jpeg|png)$/i.exec(name);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxStep) maxStep = num;
      }
    }
    return maxStep + 1;
  } catch {
    return 1;
  }
});

// Write a single frame PNG/JPG to a chosen directory (path-traversal safe!)
ipcMain.handle('file:writeFrameToDir', async (_event, { dirPath, name, dataUrl }: { dirPath: string; name: string; dataUrl: string }) => {
  try {
    const resolvedBase = path.resolve(dirPath);
    const fullPath = path.resolve(resolvedBase, name);
    if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
      return { ok: false, error: 'Invalid target path' };
    }
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    const base64Data = dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    await fsp.writeFile(fullPath, Buffer.from(base64Data, 'base64'));
    return { ok: true, fullPath };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Erro ao gravar frame' };
  }
});

// Save binary file (GIF / MP4 / WebM)
ipcMain.handle(
  'file:saveBinaryFile',
  async (
    _event,
    { defaultName, filterName, extensions, bytes }: { defaultName: string; filterName: string; extensions: string[]; bytes: Uint8Array }
  ) => {
    try {
      if (!mainWindow) return { canceled: true, error: 'Window unavailable' };
      const safeName = sanitizeFilename(defaultName || 'export', 'export');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: `Export ${filterName}`,
        defaultPath: safeName,
        filters: [{ name: filterName, extensions }]
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      await writeFileAtomic(result.filePath, Buffer.from(bytes));
      return { canceled: false, filePath: result.filePath };
    } catch (err: any) {
      return { canceled: true, error: err?.message || 'Erro ao salvar arquivo' };
    }
  }
);

// Open exported folder or file in Explorer (safely routes http/https URLs to openExternal)
ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  if (!targetPath) return;
  if (/^https?:\/\//i.test(targetPath)) {
    await shell.openExternal(targetPath);
    return;
  }
  await shell.openPath(targetPath);
});

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  if (!url || !/^https?:\/\//i.test(url)) return;
  await shell.openExternal(url);
});

// List installed system font families on the user's PC (cached!)
let cachedSystemFonts: string[] | null = null;
ipcMain.handle('system:listFonts', async () => {
  if (cachedSystemFonts) return cachedSystemFonts;
  const fallback = [
    'Segoe UI',
    'Arial',
    'Calibri',
    'Cambria',
    'Comic Sans MS',
    'Consolas',
    'Courier New',
    'Georgia',
    'Impact',
    'Tahoma',
    'Times New Roman',
    'Trebuchet MS',
    'Verdana'
  ];
  if (process.platform !== 'win32') {
    cachedSystemFonts = fallback;
    return cachedSystemFonts;
  }
  return new Promise<string[]>((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
      ],
      { timeout: 6000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          cachedSystemFonts = fallback;
          resolve(fallback);
          return;
        }
        const list = Array.from(
          new Set(
            stdout
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));
        cachedSystemFonts = list.length > 0 ? list : fallback;
        resolve(cachedSystemFonts);
      }
    );
  });
});
