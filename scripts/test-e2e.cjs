const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const distHtml = path.join(rootDir, 'dist', 'index.html');
const preloadJs = path.join(rootDir, 'dist-electron', 'preload.js');
const reportPath = process.env.CELSKETCH_TEST_REPORT || path.join(rootDir, 'test-report.json');

app.on('window-all-closed', () => {
  // Keep alive while switching test windows
});

// Minimal IPC stubs so the renderer boots cleanly in headless test mode
ipcMain.handle('file:getLaunchFile', () => null);
ipcMain.handle('file:checkRecovery', () => ({ exists: false }));
ipcMain.handle('app:getInfo', () => ({ version: '1.4.0', installMode: 'installed', platform: process.platform, editorOpen: false }));
ipcMain.handle('launcher:getPrefs', () => ({ autoLaunchIfUpToDate: false }));
ipcMain.handle('launcher:setPrefs', (_e, p) => ({ autoLaunchIfUpToDate: Boolean(p?.autoLaunchIfUpToDate) }));
ipcMain.handle('updater:check', () => ({ updateAvailable: false, currentVersion: '1.4.0', latestVersion: '1.4.0' }));
ipcMain.handle('updater:getLastCheck', () => null);
ipcMain.handle('window:setDirty', () => {});
ipcMain.handle('system:listFonts', () => ['Segoe UI', 'Arial']);
let sharedBoard = null;
let lastSavedPayload = null;
ipcMain.handle('file:saveProject', (_e, { content }) => {
  lastSavedPayload = content;
  return { canceled: false, filePath: 'C:\\Temp\\test_scene.celsketch' };
});
ipcMain.handle('ref:getBoardState', () => sharedBoard);
ipcMain.handle('ref:setBoardState', (_e, j) => {
  sharedBoard = j;
  return { ok: true };
});
ipcMain.handle('ref:pickColor', () => ({ ok: true }));
ipcMain.handle('ref:setAlwaysOnTop', () => ({ ok: true }));
ipcMain.handle('ref:setWindowOpacity', () => ({ ok: true }));

function createTestWin(w = 1366, h = 820) {
  return new BrowserWindow({
    width: w,
    height: h,
    show: false,
    webPreferences: {
      preload: preloadJs,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
}

app.whenReady().then(async () => {
  const report = {
    ok: false,
    launcher: {},
    editor: {},
    webglBenchmark: {},
    reference: {},
    errors: []
  };

  try {
    // 1. Launcher Window test (?mode=launcher)
    const launcherWin = createTestWin(460, 500);
    launcherWin.webContents.on('console-message', (_ev, level, msg) => {
      if (level >= 3) report.errors.push(`LAUNCHER: ${msg}`);
    });
    await launcherWin.loadFile(distHtml, { query: { mode: 'launcher' } });
    await new Promise((r) => setTimeout(r, 600));
    report.launcher = await launcherWin.webContents.executeJavaScript(`
      (() => ({
        hasTitle: document.body.innerText.includes('CelSketch'),
        hasOpenBtn: /Abrir CelSketch/i.test(document.body.innerText)
      }))()
    `);
    launcherWin.destroy();

    // 2. Editor Window + Lazy Modals + WebGL2 GPU Post-Process check
    const editorWin = createTestWin(1366, 820);
    editorWin.webContents.on('console-message', (_ev, level, msg) => {
      if (level >= 3) report.errors.push(`EDITOR: ${msg}`);
    });
    await editorWin.loadFile(distHtml);
    await new Promise((r) => setTimeout(r, 900));

    report.editor = await editorWin.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => /Novo Projeto|Criar/i.test(b.textContent || ''));
        if (startBtn) {
          startBtn.click();
          await sleep(400);
        }
        if (document.querySelectorAll('.menu-btn').length === 0) {
          const b2 = Array.from(document.querySelectorAll('button')).find(b => /Criar Cena|Criar/i.test(b.textContent || ''));
          if (b2) { b2.click(); await sleep(400); }
        }

        const menuTexts = Array.from(document.querySelectorAll('.menu-btn')).map(b => (b.textContent || '').trim());
        const toolbarTexts = Array.from(document.querySelectorAll('.top-toolbar button')).map(b => (b.textContent || '').trim()).filter(Boolean);

        // Test Filtros -> Lazy PostProcessModal (GPU WebGL2)
        const filtrosBtn = Array.from(document.querySelectorAll('.menu-btn')).find(b => b.textContent.trim() === 'Filtros');
        filtrosBtn && filtrosBtn.click();
        await sleep(120);
        const ppItem = Array.from(document.querySelectorAll('.dropdown-item')).find(b => /Pós-Produção/i.test(b.textContent || ''));
        ppItem && ppItem.click();
        await sleep(300);
        const postProcessOpened = document.body.innerText.includes('Acabamento visual ao vivo e no vídeo');
        const presetBtn = Array.from(document.querySelectorAll('button')).find(b => /Anime Bloom/i.test(b.textContent || ''));
        presetBtn && presetBtn.click();
        await sleep(200);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);

        // Test Lazy BlurModal (Ctrl+Shift+B -> GPU Motion/Radial Blur)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, shiftKey: true, bubbles: true }));
        await sleep(300);
        const blurModalOpened = /Desfoque/i.test(document.body.innerText);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);

        // Test Lazy HsvModal (Ctrl+U -> GPU HSL)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, bubbles: true }));
        await sleep(300);
        const hsvModalOpened = /Matiz|Hue/i.test(document.body.innerText);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);

        // Test Lazy LevelsModal (Ctrl+L -> GPU LUT Levels)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true }));
        await sleep(300);
        const levelsModalOpened = /Níveis|Brilho/i.test(document.body.innerText);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);

        // Test Opções -> Lazy SettingsModal
        const opcoesBtn = Array.from(document.querySelectorAll('.menu-btn')).find(b => b.textContent.trim() === 'Opções');
        opcoesBtn && opcoesBtn.click();
        await sleep(120);
        const settingsItem = Array.from(document.querySelectorAll('.dropdown-item')).find(b => /Configurações e Atalhos/i.test(b.textContent || ''));
        settingsItem && settingsItem.click();
        await sleep(300);
        const settingsOpened = document.body.innerText.includes('Configurações do CelSketch');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);

        // Test REC & Guias popovers
        const recBtn = Array.from(document.querySelectorAll('.top-toolbar button')).find(b => /REC/i.test(b.textContent || ''));
        recBtn && recBtn.click();
        await sleep(120);
        const recEl = document.querySelector('[data-tb-popover]');
        const recPopoverOpen = Boolean(recEl) && /timelapse/i.test(recEl.innerText);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);

        const guiasBtn = Array.from(document.querySelectorAll('.top-toolbar button')).find(b => /Guias/i.test(b.textContent || ''));
        guiasBtn && guiasBtn.click();
        await sleep(120);
        const guiasEl = document.querySelector('[data-tb-popover]');
        const guiasPopoverOpen = Boolean(guiasEl) && /grade 12-field/i.test(guiasEl.innerText);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);

        // Test Brush Size Visual HUD via ']'
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', code: 'BracketRight', bubbles: true }));
        await sleep(150);
        const brushHudVisible = /\\d+\\s*px/.test(document.body.innerText) && (document.body.innerText.includes('Pincel') || document.body.innerText.includes('Lápis'));

        // Test Ctrl+S -> Binary ZIP .celsketch v2 codec
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
        await sleep(300);

        // Test Horizontal Timeline Virtualization with 600 frames!
        const numInputs = Array.from(document.querySelectorAll('.timeline-num-input'));
        // Total frames input is the 4th numeric input (FPS, In, Out, Total)
        const totalInput = numInputs[3];
        if (totalInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          totalInput.focus();
          nativeSetter.call(totalInput, '600');
          totalInput.dispatchEvent(new Event('input', { bubbles: true }));
          totalInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          totalInput.blur();
          await sleep(250);
        }
        const renderedRulerFrames = document.querySelectorAll('[title^="Frame "]').length;

        return {
          menuTexts,
          toolbarTexts,
          postProcessOpened,
          blurModalOpened,
          hsvModalOpened,
          levelsModalOpened,
          settingsOpened,
          recPopoverOpen,
          guiasPopoverOpen,
          brushHudVisible,
          renderedRulerFramesFor600: renderedRulerFrames,
          timelineVirtualized: renderedRulerFrames > 10 && renderedRulerFrames < 140
        };
      })()
    `);

    // Measure WebGL2 context availability inside Chromium 130
    report.webglBenchmark = await editorWin.webContents.executeJavaScript(`
      (() => {
        const c = document.createElement('canvas');
        c.width = 1920; c.height = 1080;
        const gl = c.getContext('webgl2');
        const hasWebGL2 = Boolean(gl);
        let renderer = 'none';
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        }
        return { hasWebGL2, renderer };
      })()
    `);
    editorWin.destroy();

    // 3. Standalone Multi-Monitor Reference Window (?mode=reference)
    const refWin = createTestWin(600, 640);
    refWin.webContents.on('console-message', (_ev, level, msg) => {
      if (level >= 3) report.errors.push(`REF: ${msg}`);
    });
    await refWin.loadFile(distHtml, { query: { mode: 'reference' } });
    await new Promise((r) => setTimeout(r, 700));

    report.reference = await refWin.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const hasImageDecoder = typeof window.ImageDecoder === 'function';
        const gifBytes = new Uint8Array([
          0x47,0x49,0x46,0x38,0x39,0x61,
          0x02,0x00,0x02,0x00, 0x80,0x00,0x00,
          0xff,0x00,0x00, 0x00,0x00,0xff,
          0x21,0xff,0x0b, 0x4e,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2e,0x30, 0x03,0x01,0x00,0x00,0x00,
          0x21,0xf9,0x04, 0x04,0x0a,0x00,0x00,0x00,
          0x2c, 0x00,0x00,0x00,0x00, 0x02,0x00,0x02,0x00, 0x00,
          0x02, 0x02, 0x44, 0x01, 0x00,
          0x21,0xf9,0x04, 0x04,0x0a,0x00,0x00,0x00,
          0x2c, 0x00,0x00,0x00,0x00, 0x02,0x00,0x02,0x00, 0x00,
          0x02, 0x02, 0x4c, 0x01, 0x00,
          0x3b
        ]);
        let decodedGifFrames = 0;
        if (hasImageDecoder) {
          const dec = new window.ImageDecoder({ data: gifBytes, type: 'image/gif' });
          await dec.tracks.ready;
          decodedGifFrames = dec.tracks.selectedTrack.frameCount;
          dec.close();
        }

        const addTextBtn = document.querySelector('button[title="Adicionar Nota de Texto"]');
        addTextBtn && addTextBtn.click();
        await sleep(100);
        const ta1 = document.querySelector('textarea');
        if (ta1) ta1.blur();
        await sleep(80);
        addTextBtn && addTextBtn.click();
        await sleep(100);
        const ta2 = document.querySelector('textarea');
        if (ta2) ta2.blur();
        await sleep(80);

        const host = document.querySelector('[data-ref-window]');
        host && host.focus();
        await sleep(60);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
        await sleep(100);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true }));
        await sleep(150);
        const groupCreated = document.body.innerText.includes('Grupo 1 (2)');

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
        await sleep(100);
        window.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
        await sleep(150);
        const groupDuplicated = document.body.innerText.includes('Grupo 1 (cópia) (2)');

        return { rendered: Boolean(host), hasImageDecoder, decodedGifFrames, groupCreated, groupDuplicated };
      })()
    `);
    refWin.destroy();

    const savedBytes = lastSavedPayload instanceof Uint8Array ? lastSavedPayload : null;
    report.zipCodec = {
      savedAsBinary: Boolean(savedBytes),
      isValidZipHeader: Boolean(
        savedBytes &&
          savedBytes.length > 40 &&
          savedBytes[0] === 0x50 &&
          savedBytes[1] === 0x4b &&
          savedBytes[2] === 0x03 &&
          savedBytes[3] === 0x04
      ),
      byteLength: savedBytes ? savedBytes.length : 0
    };

    report.ok =
      report.errors.length === 0 &&
      report.launcher.hasTitle &&
      report.launcher.hasOpenBtn &&
      report.editor.postProcessOpened &&
      report.editor.blurModalOpened &&
      report.editor.hsvModalOpened &&
      report.editor.levelsModalOpened &&
      report.editor.settingsOpened &&
      report.editor.recPopoverOpen &&
      report.editor.guiasPopoverOpen &&
      report.editor.brushHudVisible &&
      report.editor.timelineVirtualized &&
      report.zipCodec.isValidZipHeader &&
      report.webglBenchmark.hasWebGL2 &&
      report.reference.rendered &&
      report.reference.decodedGifFrames === 2 &&
      report.reference.groupCreated &&
      report.reference.groupDuplicated;
  } catch (err) {
    report.errors.push(String(err && err.stack ? err.stack : err));
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  app.exit(report.ok ? 0 : 1);
});
