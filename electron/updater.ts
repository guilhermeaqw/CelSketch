import { app, shell } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';

const fsp = fs.promises;

export const GITHUB_OWNER = 'guilhermeaqw';
export const GITHUB_REPO = 'CelSketch';
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const API_LATEST_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export type InstallMode = 'installed' | 'portable' | 'unpacked' | 'dev';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  installMode: InstallMode;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  htmlUrl: string;
  assetName: string | null;
  assetUrl: string | null;
  assetSize: number;
  assetSha256: string | null;
  error?: string;
}

export interface DownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  stage: 'downloading' | 'verifying';
}

export interface DownloadResult {
  ok: boolean;
  canceled?: boolean;
  filePath?: string;
  sha256Verified?: boolean;
  error?: string;
}

export function detectInstallMode(): InstallMode {
  if (!app.isPackaged) return 'dev';
  if (process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  const exeDir = path.dirname(process.execPath);
  // electron-builder NSIS places "Uninstall CelSketch.exe" in the installation root
  try {
    const entries = fs.readdirSync(exeDir);
    if (entries.some((name) => /^uninstall.*\.exe$/i.test(name))) {
      return 'installed';
    }
  } catch {
    // ignore
  }
  return 'unpacked';
}

function parseSemver(raw: string): { major: number; minor: number; patch: number; pre: string } {
  const cleaned = (raw || '').trim().replace(/^v/i, '');
  const [core, ...preParts] = cleaned.split('-');
  const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
  return {
    major: nums[0] || 0,
    minor: nums[1] || 0,
    patch: nums[2] || 0,
    pre: preParts.join('-')
  };
}

/** Returns > 0 if a > b, < 0 if a < b, 0 if equal */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  // Release version > prerelease version (e.g. 1.2.0 > 1.2.0-beta.1)
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre);
}

function isAllowedGithubHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'github.com' ||
    h === 'api.github.com' ||
    h.endsWith('.githubusercontent.com') ||
    h === 'githubusercontent.com'
  );
}

function sanitizeAssetFilename(name: string): string {
  const base = path.basename(name || 'CelSketch-Update.exe');
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'CelSketch-Update.exe';
}

function fetchJson(urlStr: string, timeoutMs = 12000): Promise<any> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      reject(new Error('URL inválida'));
      return;
    }
    if (parsed.protocol !== 'https:' || !isAllowedGithubHost(parsed.hostname)) {
      reject(new Error('Host não permitido'));
      return;
    }

    const req = https.get(
      parsed,
      {
        headers: {
          'User-Agent': `CelSketch-Launcher/${app.getVersion()}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        timeout: timeoutMs
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          fetchJson(res.headers.location, timeoutMs).then(resolve, reject);
          return;
        }
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 2 * 1024 * 1024) {
            req.destroy(new Error('Resposta muito grande'));
          }
        });
        res.on('end', () => {
          if (status === 403 && res.headers['x-ratelimit-remaining'] === '0') {
            reject(new Error('Limite de consultas da API do GitHub atingido. Tente novamente em alguns minutos.'));
            return;
          }
          if (status === 404) {
            reject(new Error('Nenhuma release publicada encontrada no GitHub.'));
            return;
          }
          if (status < 200 || status >= 300) {
            reject(new Error(`Erro HTTP ${status} ao verificar atualizações.`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Resposta inválida do GitHub.'));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Tempo limite excedido ao conectar ao GitHub.'));
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string | null;
}

function pickBestAsset(assets: GithubAsset[], installMode: InstallMode): GithubAsset | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  if (process.platform === 'win32') {
    // Prefer ultra-fast 1.4MB hot app.asar update for installed/unpacked apps (ZERO setup wizard, ~1s update!)
    if (installMode === 'installed' || installMode === 'unpacked') {
      const localAsar = path.join(path.dirname(process.execPath), 'resources', 'app.asar');
      if (fs.existsSync(localAsar)) {
        const asarAsset = assets.find((a) => /\.asar$/i.test(a.name) && a.browser_download_url);
        if (asarAsset) return asarAsset;
      }
    }

    const exeAssets = assets.filter((a) => /\.exe$/i.test(a.name) && a.browser_download_url);
    if (exeAssets.length === 0) return null;
    const setupAsset = exeAssets.find((a) => /setup/i.test(a.name));
    const portableAsset = exeAssets.find((a) => !/setup/i.test(a.name));
    if (installMode === 'portable') {
      return portableAsset || setupAsset || exeAssets[0];
    }
    return setupAsset || portableAsset || exeAssets[0];
  }

  // Linux fallback
  const appImage = assets.find((a) => /\.appimage$/i.test(a.name));
  const deb = assets.find((a) => /\.deb$/i.test(a.name));
  return appImage || deb || null;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const installMode = detectInstallMode();

  try {
    const data = await fetchJson(API_LATEST_URL, 12000);
    const tagName = String(data.tag_name || '').trim();
    const latestVersion = tagName.replace(/^v/i, '') || currentVersion;
    const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;
    const asset = pickBestAsset(data.assets || [], installMode);

    let assetSha256: string | null = null;
    if (asset?.digest && typeof asset.digest === 'string') {
      const m = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest.trim());
      if (m) assetSha256 = m[1].toLowerCase();
    }

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      installMode,
      releaseName: String(data.name || `CelSketch v${latestVersion}`),
      releaseNotes: String(data.body || ''),
      publishedAt: String(data.published_at || ''),
      htmlUrl: String(data.html_url || RELEASES_PAGE_URL),
      assetName: asset?.name || null,
      assetUrl: asset?.browser_download_url || null,
      assetSize: Number(asset?.size) || 0,
      assetSha256
    };
  } catch (err: any) {
    const msg =
      err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN' || err?.code === 'ENETUNREACH'
        ? 'Sem conexão com a internet. Você pode abrir o CelSketch normalmente.'
        : err?.message || 'Não foi possível verificar atualizações.';
    return {
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      installMode,
      releaseName: `CelSketch v${currentVersion}`,
      releaseNotes: '',
      publishedAt: '',
      htmlUrl: RELEASES_PAGE_URL,
      assetName: null,
      assetUrl: null,
      assetSize: 0,
      assetSha256: null,
      error: msg
    };
  }
}

let activeDownloadReq: http.ClientRequest | null = null;
let activeDownloadCanceled = false;

export function cancelActiveDownload(): void {
  activeDownloadCanceled = true;
  if (activeDownloadReq) {
    try {
      activeDownloadReq.destroy();
    } catch {
      // ignore
    }
    activeDownloadReq = null;
  }
}

export async function downloadUpdate(
  assetUrl: string,
  assetName: string,
  expectedSha256: string | null,
  onProgress: (p: DownloadProgress) => void
): Promise<DownloadResult> {
  cancelActiveDownload();
  activeDownloadCanceled = false;

  const updatesDir = path.join(app.getPath('temp'), 'CelSketch-Updates');
  await fsp.mkdir(updatesDir, { recursive: true });
  const safeName = sanitizeAssetFilename(assetName);
  const finalPath = path.join(updatesDir, safeName);
  const partPath = `${finalPath}.part`;

  // If already downloaded and SHA-256 matches, reuse immediately!
  if (expectedSha256 && fs.existsSync(finalPath)) {
    try {
      const existingHash = await computeFileSha256(finalPath);
      if (existingHash === expectedSha256.toLowerCase()) {
        const stat = await fsp.stat(finalPath);
        onProgress({
          percent: 100,
          downloadedBytes: stat.size,
          totalBytes: stat.size,
          speedBytesPerSec: 0,
          stage: 'verifying'
        });
        return { ok: true, filePath: finalPath, sha256Verified: true };
      }
    } catch {
      // proceed with fresh download
    }
  }

  return new Promise<DownloadResult>((resolve) => {
    const startRequest = (urlStr: string, redirectDepth: number) => {
      if (activeDownloadCanceled) {
        resolve({ ok: false, canceled: true });
        return;
      }
      if (redirectDepth > 6) {
        resolve({ ok: false, error: 'Muitos redirecionamentos durante o download.' });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(urlStr);
      } catch {
        resolve({ ok: false, error: 'URL de download inválida.' });
        return;
      }
      if (parsed.protocol !== 'https:' || !isAllowedGithubHost(parsed.hostname)) {
        resolve({ ok: false, error: `Origem de download não permitida: ${parsed.hostname}` });
        return;
      }

      const req = https.get(
        parsed,
        {
          headers: {
            'User-Agent': `CelSketch-Launcher/${app.getVersion()}`,
            Accept: 'application/octet-stream'
          },
          timeout: 30000
        },
        (res) => {
          const status = res.statusCode || 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            startRequest(res.headers.location, redirectDepth + 1);
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            resolve({ ok: false, error: `Falha no download (HTTP ${status}).` });
            return;
          }

          const totalBytes = parseInt(String(res.headers['content-length'] || '0'), 10) || 0;
          let downloadedBytes = 0;
          const hash = crypto.createHash('sha256');
          const fileStream = fs.createWriteStream(partPath);

          let lastEmitTime = Date.now();
          let lastSampleTime = Date.now();
          let lastSampleBytes = 0;
          let speedBytesPerSec = 0;
          let finished = false;

          const cleanupPart = () => {
            try {
              fileStream.close();
            } catch {
              // ignore
            }
            try {
              if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
            } catch {
              // ignore
            }
          };

          const finishWith = (result: DownloadResult) => {
            if (finished) return;
            finished = true;
            activeDownloadReq = null;
            resolve(result);
          };

          res.on('data', (chunk: Buffer) => {
            if (activeDownloadCanceled) {
              req.destroy();
              cleanupPart();
              finishWith({ ok: false, canceled: true });
              return;
            }
            downloadedBytes += chunk.length;
            hash.update(chunk);

            const now = Date.now();
            const dtSample = now - lastSampleTime;
            if (dtSample >= 400) {
              speedBytesPerSec = Math.round(((downloadedBytes - lastSampleBytes) * 1000) / dtSample);
              lastSampleTime = now;
              lastSampleBytes = downloadedBytes;
            }

            if (now - lastEmitTime >= 80 || (totalBytes > 0 && downloadedBytes >= totalBytes)) {
              lastEmitTime = now;
              const percent = totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
              onProgress({
                percent,
                downloadedBytes,
                totalBytes,
                speedBytesPerSec,
                stage: 'downloading'
              });
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', async () => {
            if (activeDownloadCanceled) {
              cleanupPart();
              finishWith({ ok: false, canceled: true });
              return;
            }
            try {
              onProgress({
                percent: 100,
                downloadedBytes,
                totalBytes: totalBytes || downloadedBytes,
                speedBytesPerSec: 0,
                stage: 'verifying'
              });
              const digestHex = hash.digest('hex').toLowerCase();
              let sha256Verified = false;
              if (expectedSha256) {
                if (digestHex !== expectedSha256.toLowerCase()) {
                  cleanupPart();
                  finishWith({
                    ok: false,
                    error: 'Falha na verificação de integridade (SHA-256). Tente baixar novamente.'
                  });
                  return;
                }
                sha256Verified = true;
              }
              try {
                if (fs.existsSync(finalPath)) await fsp.unlink(finalPath);
              } catch {
                // ignore
              }
              await fsp.rename(partPath, finalPath);
              finishWith({ ok: true, filePath: finalPath, sha256Verified });
            } catch (err: any) {
              cleanupPart();
              finishWith({ ok: false, error: err?.message || 'Erro ao finalizar arquivo baixado.' });
            }
          });

          fileStream.on('error', (err) => {
            cleanupPart();
            finishWith({ ok: false, error: err?.message || 'Erro ao gravar atualização no disco.' });
          });

          res.on('error', (err) => {
            cleanupPart();
            if (activeDownloadCanceled) {
              finishWith({ ok: false, canceled: true });
            } else {
              finishWith({ ok: false, error: err?.message || 'Conexão interrompida durante o download.' });
            }
          });
        }
      );

      activeDownloadReq = req;
      req.on('timeout', () => {
        req.destroy(new Error('Tempo limite excedido durante o download.'));
      });
      req.on('error', (err) => {
        activeDownloadReq = null;
        if (activeDownloadCanceled) {
          resolve({ ok: false, canceled: true });
        } else {
          resolve({ ok: false, error: err?.message || 'Erro de rede durante o download.' });
        }
      });
    };

    startRequest(assetUrl, 0);
  });
}

function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', reject);
  });
}

function escapePsSingleQuote(s: string): string {
  return s.replace(/'/g, "''");
}

export async function installDownloadedUpdate(
  downloadedFilePath: string,
  installMode: InstallMode
): Promise<{ ok: boolean; error?: string }> {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    return { ok: false, error: 'Arquivo de atualização não encontrado.' };
  }

  if (process.platform !== 'win32') {
    await shell.openPath(downloadedFilePath);
    return { ok: true };
  }

  const updatesDir = path.join(app.getPath('temp'), 'CelSketch-Updates');
  await fsp.mkdir(updatesDir, { recursive: true });
  const scriptPath = path.join(updatesDir, `apply_update_${Date.now()}.ps1`);
  const pid = process.pid;

  // 1. Ultra-fast hot app.asar swap (1.4MB, ZERO setup wizard, ~1s relaunch — only asks UAC if in Program Files!)
  if (/\.asar$/i.test(path.basename(downloadedFilePath))) {
    const currentExe = process.execPath;
    const resourcesDir = path.join(path.dirname(currentExe), 'resources');
    const targetAsar = path.join(resourcesDir, 'app.asar');

    const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$parentPid = ${pid}
$exePath = '${escapePsSingleQuote(currentExe)}'
$resourcesDir = '${escapePsSingleQuote(resourcesDir)}'
$srcAsar = '${escapePsSingleQuote(downloadedFilePath)}'
$dstAsar = '${escapePsSingleQuote(targetAsar)}'

# Wait for main process + all sibling Electron child processes from this exe to exit
for ($i = 0; $i -lt 50; $i++) {
  $aliveMain = Get-Process -Id $parentPid -ErrorAction SilentlyContinue
  $aliveSame = Get-Process -Name 'CelSketch' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exePath }
  if (-not $aliveMain -and -not $aliveSame) { break }
  if ($i -eq 15) {
    $aliveSame | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 150
}
Start-Sleep -Milliseconds 200

# Check if resources folder is writable without UAC
$needsAdmin = $false
try {
  $probe = Join-Path $resourcesDir ('.cs_write_test_' + [guid]::NewGuid().ToString('N'))
  [System.IO.File]::WriteAllText($probe, 'ok')
  Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
} catch {
  $needsAdmin = $true
}

if ($needsAdmin) {
  $copyCmd = "Copy-Item -LiteralPath '$srcAsar' -Destination '$dstAsar' -Force"
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-WindowStyle','Hidden','-Command',$copyCmd) -Verb RunAs -Wait
} else {
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Copy-Item -LiteralPath $srcAsar -Destination $dstAsar -Force -ErrorAction Stop
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
}

Remove-Item -LiteralPath $srcAsar -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $exePath) {
  Start-Process -FilePath $exePath
}
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
`;
    await fsp.writeFile(scriptPath, psScript, 'utf-8');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { detached: true, stdio: 'ignore', windowsHide: true }
    );
    child.unref();
    return { ok: true };
  }

  if (installMode === 'portable' && process.env.PORTABLE_EXECUTABLE_FILE) {
    const targetExe = process.env.PORTABLE_EXECUTABLE_FILE;
    const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$parentPid = ${pid}
for ($i = 0; $i -lt 60; $i++) {
  if (-not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 300
}
$src = '${escapePsSingleQuote(downloadedFilePath)}'
$dst = '${escapePsSingleQuote(targetExe)}'
$copied = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop
    $copied = $true
    break
  } catch {
    Start-Sleep -Milliseconds 350
  }
}
if ($copied) {
  Start-Process -FilePath $dst
} else {
  Start-Process -FilePath $src
}
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
`;
    await fsp.writeFile(scriptPath, psScript, 'utf-8');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { detached: true, stdio: 'ignore', windowsHide: true }
    );
    child.unref();
    return { ok: true };
  }

  if (/setup/i.test(path.basename(downloadedFilePath))) {
    const currentExe = process.execPath;
    const installDir = path.dirname(currentExe);
    const defaultInstalledExe = path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'celsketch',
      'CelSketch.exe'
    );
    // For dev mode (electron.exe in node_modules), install to default per-user dir silently
    const targetDir = installMode === 'dev' ? path.dirname(defaultInstalledExe) : installDir;
    const targetExe = installMode === 'dev' ? defaultInstalledExe : currentExe;

    // Wait for ALL CelSketch Electron processes (main + GPU/renderer children) to exit cleanly,
    // then run NSIS 100% silently (/S /D=<dir>) — NEVER showing the setup wizard!
    // Only triggers a single UAC prompt (-Verb RunAs) if the target folder requires admin rights.
    const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$parentPid = ${pid}
$exePath = '${escapePsSingleQuote(targetExe)}'
$targetDir = '${escapePsSingleQuote(targetDir)}'
$installer = '${escapePsSingleQuote(downloadedFilePath)}'
$fallbackExe = '${escapePsSingleQuote(defaultInstalledExe)}'

# 1. Wait for main process + all sibling Electron child processes from this exe to exit
for ($i = 0; $i -lt 50; $i++) {
  $aliveMain = Get-Process -Id $parentPid -ErrorAction SilentlyContinue
  $aliveSame = Get-Process -Name 'CelSketch' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exePath }
  if (-not $aliveMain -and -not $aliveSame) { break }
  if ($i -eq 15) {
    $aliveSame | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 200
}
Start-Sleep -Milliseconds 300

# 2. Check if target directory is writable without admin; if not, request UAC once with /S (still 100% silent!)
$needsAdmin = $false
try {
  if (Test-Path -LiteralPath $targetDir) {
    $probe = Join-Path $targetDir ('.cs_write_test_' + [guid]::NewGuid().ToString('N'))
    [System.IO.File]::WriteAllText($probe, 'ok')
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
  }
} catch {
  $needsAdmin = $true
}

# NSIS spec: /D=<dir> must be the LAST argument with NO quotes around the path
$nsArgs = "/S /D=$targetDir"
if ($needsAdmin) {
  $proc = Start-Process -FilePath $installer -ArgumentList $nsArgs -Verb RunAs -Wait -PassThru
} else {
  $proc = Start-Process -FilePath $installer -ArgumentList $nsArgs -Wait -PassThru
  if ($proc -and $null -ne $proc.ExitCode -and $proc.ExitCode -ne 0) {
    $proc = Start-Process -FilePath $installer -ArgumentList $nsArgs -Verb RunAs -Wait -PassThru
  }
}

Start-Sleep -Milliseconds 500
if (Test-Path -LiteralPath $exePath) {
  Start-Process -FilePath $exePath
} elseif (Test-Path -LiteralPath $fallbackExe) {
  Start-Process -FilePath $fallbackExe
}
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
`;
    await fsp.writeFile(scriptPath, psScript, 'utf-8');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { detached: true, stdio: 'ignore', windowsHide: true }
    );
    child.unref();
    return { ok: true };
  }

  // Fallback for non-setup single executable
  const child = spawn(downloadedFilePath, [], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { ok: true };
}
