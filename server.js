// 우당탕탕삼국지 dev server — localhost:3001

import { createServer } from 'http';
import { watch } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3001;
const HOST = process.env.WDTT_SERVER_HOST || '127.0.0.1';
const LIVE_RELOAD_ENABLED = process.env.WDTT_DISABLE_LIVE_RELOAD !== '1';
const LIVE_RELOAD_ENDPOINT = '/__wdttgukji/live-reload';
const WATCH_TARGETS = ['public', 'engine', 'data'];
const DEV_NO_STORE_EXTENSIONS = new Set(['.html', '.css', '.js', '.json']);
const LIVE_RELOAD_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.ico',
  '.woff2',
]);
const LIVE_RELOAD_SNIPPET = `
<script>
(() => {
  if (window.__wdttLiveReloadInstalled) return;
  window.__wdttLiveReloadInstalled = true;

  const endpoint = '${LIVE_RELOAD_ENDPOINT}';
  const restoreKey = '__wdttgukji_live_reload_restore__';
  const badgeId = '__wdttgukji_live_reload_badge__';

  const flashBadge = (message, tone = 'sync') => {
    const existing = document.getElementById(badgeId);
    existing?.remove();
    const badge = document.createElement('div');
    badge.id = badgeId;
    badge.textContent = message;
    badge.dataset.tone = tone;
    badge.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:18px',
      'z-index:2147483647',
      'padding:9px 14px',
      'border-radius:999px',
      'font:700 12px/1.2 sans-serif',
      'letter-spacing:0.04em',
      'color:#f8ecd2',
      tone === 'error'
        ? 'background:rgba(121,28,28,0.92);border:1px solid rgba(239,154,154,0.45)'
        : 'background:rgba(27,45,38,0.9);border:1px solid rgba(195,161,94,0.45)',
      'box-shadow:0 14px 32px rgba(0,0,0,0.28)',
      'backdrop-filter:blur(8px)',
      'pointer-events:none',
      'opacity:0',
      'transform:translateY(-6px)',
      'transition:opacity 120ms ease, transform 120ms ease',
    ].join(';');
    document.body.appendChild(badge);
    requestAnimationFrame(() => {
      badge.style.opacity = '1';
      badge.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.transform = 'translateY(-4px)';
      setTimeout(() => badge.remove(), 160);
    }, tone === 'error' ? 2600 : 1600);
  };

  const waitFor = (test, timeoutMs = 6000, intervalMs = 80) => new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      try {
        const result = test();
        if (result) {
          resolve(result);
          return;
        }
      } catch {}
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('timeout'));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });

  const readVisibleScreen = () => (
    Array.from(document.querySelectorAll('.screen')).find((screen) => !screen.classList.contains('hidden'))?.id
      || null
  );

  const captureSnapshot = async () => {
    const api = window.__wdttgukji;
    const screenId = readVisibleScreen();
    const snapshot = {
      screenId,
      factionId: api?.getSelectedFaction?.() || null,
      cityId: api?.getSelectedCity?.() || null,
      commandOpen: api?.isCommandOpen?.() || false,
      commandScene: api?.getCommandScene?.() || null,
      hasState: !!api?.getState?.(),
      saved: false,
      capturedAt: Date.now(),
    };
    if (snapshot.hasState && api?.persistSave) {
      try {
        snapshot.saved = !!api.persistSave();
      } catch (error) {
        console.warn('[live-reload] failed to persist save before reload', error);
      }
    }
    sessionStorage.setItem(restoreKey, JSON.stringify(snapshot));
  };

  const restoreSnapshot = async () => {
    const raw = sessionStorage.getItem(restoreKey);
    if (!raw) return;
    sessionStorage.removeItem(restoreKey);

    let snapshot = null;
    try {
      snapshot = JSON.parse(raw);
    } catch {
      return;
    }

    const api = await waitFor(() => window.__wdttgukji, 10000).catch(() => null);
    if (!api || !snapshot) return;

    try {
      if (snapshot.screenId === 'faction-screen') {
        if (snapshot.factionId) api.selectFaction(snapshot.factionId);
        flashBadge('변경 반영', 'sync');
        return;
      }

      if (snapshot.screenId === 'intro-screen') {
        if (snapshot.factionId) {
          api.selectFaction(snapshot.factionId);
          await api.showIntro?.();
        }
        flashBadge('변경 반영', 'sync');
        return;
      }

      if (snapshot.screenId === 'game-screen' && snapshot.hasState && api.loadSave) {
        await api.loadSave();
        if (snapshot.cityId) {
          await waitFor(() => document.getElementById('game-screen') && !document.getElementById('game-screen').classList.contains('hidden'), 8000);
          api.selectCity(snapshot.cityId);
          if (snapshot.commandOpen) {
            await waitFor(() => document.getElementById('game-screen')?.classList.contains('selection-focus'), 5000).catch(() => null);
            api.openCommand(snapshot.cityId, snapshot.commandScene || undefined);
          }
        }
        flashBadge('변경 반영', 'sync');
        return;
      }

      flashBadge('변경 반영', 'sync');
    } catch (error) {
      console.warn('[live-reload] failed to restore scene', error);
      flashBadge('장면 복귀 실패', 'error');
    }
  };

  let connected = false;
  const stream = new EventSource(endpoint);
  stream.addEventListener('message', async (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data || '{}');
    } catch {
      payload = null;
    }
    if (!connected) {
      connected = true;
      return;
    }
    if (!payload || payload.type !== 'reload') return;
    await captureSnapshot();
    location.reload();
  });
  stream.addEventListener('error', () => {
    console.warn('[live-reload] stream disconnected');
  });

  window.addEventListener('load', () => {
    void restoreSnapshot();
  }, { once: true });
})();
</script>`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const liveReloadClients = new Set();
const watcherClosers = [];
let pendingReloadPath = null;
let pendingReloadTimer = null;
let liveReloadVersion = 0;

function normalizeSlashes(value = '') {
  return `${value}`.replace(/\\/g, '/');
}

function isReloadableAsset(filePath = '') {
  const normalized = normalizeSlashes(filePath);
  return LIVE_RELOAD_EXTENSIONS.has(extname(normalized).toLowerCase());
}

function injectLiveReload(content) {
  if (!LIVE_RELOAD_ENABLED) return content;
  if (content.includes('__wdttLiveReloadInstalled')) return content;
  if (content.includes('</body>')) {
    return content.replace('</body>', `${LIVE_RELOAD_SNIPPET}\n</body>`);
  }
  return `${content}\n${LIVE_RELOAD_SNIPPET}`;
}

function getHeaders(ext) {
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
  };
  if (DEV_NO_STORE_EXTENSIONS.has(ext)) {
    headers['Cache-Control'] = 'no-store, max-age=0';
  }
  return headers;
}

function broadcastReload(relativePath = 'unknown') {
  liveReloadVersion += 1;
  const payload = JSON.stringify({
    type: 'reload',
    version: liveReloadVersion,
    path: relativePath,
    at: new Date().toISOString(),
  });
  for (const client of liveReloadClients) {
    client.write(`data: ${payload}\n\n`);
  }
  console.log(`[live-reload] ${relativePath}`);
}

function queueReload(relativePath) {
  pendingReloadPath = relativePath;
  clearTimeout(pendingReloadTimer);
  pendingReloadTimer = setTimeout(() => {
    broadcastReload(pendingReloadPath || 'unknown');
    pendingReloadPath = null;
  }, 90);
}

async function collectDirectories(rootPath) {
  const directories = [rootPath];
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    directories.push(...await collectDirectories(join(rootPath, entry.name)));
  }
  return directories;
}

function handleWatchEvent(rootPath, filename) {
  const candidate = filename ? join(rootPath, filename.toString()) : rootPath;
  const relativePath = normalizeSlashes(relative(__dirname, candidate));
  if (!isReloadableAsset(relativePath)) return;
  queueReload(relativePath);
}

async function registerWatchersForRoot(rootPath) {
  try {
    const recursiveWatcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
      handleWatchEvent(rootPath, filename);
    });
    watcherClosers.push(() => recursiveWatcher.close());
    return;
  } catch {}

  const directories = await collectDirectories(rootPath);
  for (const dirPath of directories) {
    const watcher = watch(dirPath, (_eventType, filename) => {
      handleWatchEvent(rootPath, filename ? join(relative(rootPath, dirPath), filename.toString()) : relative(rootPath, dirPath));
    });
    watcherClosers.push(() => watcher.close());
  }
}

async function registerLiveReloadWatchers() {
  if (!LIVE_RELOAD_ENABLED) return;
  for (const relativeRoot of WATCH_TARGETS) {
    await registerWatchersForRoot(join(__dirname, relativeRoot));
  }
}

const server = createServer(async (req, res) => {
  let url = req.url.split('?')[0];

  if (LIVE_RELOAD_ENABLED && url === LIVE_RELOAD_ENDPOINT) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', version: liveReloadVersion })}\n\n`);
    liveReloadClients.add(res);
    req.on('close', () => {
      liveReloadClients.delete(res);
    });
    return;
  }

  if (url === '/') url = '/public/index.html';
  else if (!url.includes('.')) url = '/public' + url + '.html';
  else if (url.startsWith('/js/') || url.startsWith('/css/') || url.startsWith('/assets/') || url.startsWith('/fragments/')) url = '/public' + url;

  // 그대로 매핑: /engine/*, /data/*, /public/* → 루트에서 서빙
  const filePath = join(__dirname, url);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('not file');

    const ext = extname(filePath).toLowerCase();
    if (ext === '.html') {
      const html = await readFile(filePath, 'utf8');
      res.writeHead(200, getHeaders(ext));
      res.end(injectLiveReload(html));
      return;
    }

    const content = await readFile(filePath);
    res.writeHead(200, getHeaders(ext));
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store, max-age=0' });
    res.end('Not Found: ' + url);
  }
});

server.listen(PORT, HOST, async () => {
  await registerLiveReloadWatchers();
  console.log(`\n  우당탕탕삼국지 — http://${HOST}:${PORT}\n`);
  if (LIVE_RELOAD_ENABLED) {
    console.log(`  live reload active: ${WATCH_TARGETS.join(', ')}\n`);
  }
});

process.on('SIGINT', () => {
  watcherClosers.forEach((close) => close());
  liveReloadClients.forEach((client) => client.end());
});

process.on('SIGTERM', () => {
  watcherClosers.forEach((close) => close());
  liveReloadClients.forEach((client) => client.end());
});
