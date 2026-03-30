import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const BASE_URL = process.env.WDTT_VISIBLE_BASE_URL || 'http://127.0.0.1:3001/';
export const SERVER_BOOT_TIMEOUT_MS = 10000;
export const DESKTOP_VIEWPORT = { width: 1512, height: 982 };
export const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};

export async function waitForServer(url, timeoutMs, abortState = null) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (abortState?.exited) {
      const details = [
        abortState.code != null ? `code ${abortState.code}` : null,
        abortState.signal ? `signal ${abortState.signal}` : null,
        abortState.stderr?.trim() ? abortState.stderr.trim() : null,
      ].filter(Boolean).join('\n');
      throw new Error(`Dev server exited before becoming ready${details ? `:\n${details}` : ''}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Dev server did not start within ${timeoutMs}ms`);
}

export async function ensureViteServer(rootDir) {
  let server = null;
  let stderr = '';
  const serverState = {
    exited: false,
    code: null,
    signal: null,
    stderr: '',
  };

  try {
    await waitForServer(BASE_URL, 500);
  } catch {
    server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'], {
      cwd: rootDir,
      env: {
        ...process.env,
        WDTT_VITE_OPEN: '0',
        BROWSER: 'none',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const captureStderr = (chunk) => {
      stderr += chunk.toString();
      serverState.stderr = stderr;
    };
    server.stdout.on('data', () => {});
    server.stderr.on('data', captureStderr);
    server.once('exit', (code, signal) => {
      serverState.exited = true;
      serverState.code = code;
      serverState.signal = signal;
    });
  }

  try {
    await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS, serverState);
  } catch (error) {
    if (serverState.stderr.includes('Port 3001 is already in use')) {
      await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS);
    } else {
      throw error;
    }
  }
  return { server, serverState };
}

export async function waitForBridgeReady(page) {
  await page.waitForFunction(
    () => Boolean(window.__wdttgukjiPhaser?.isReady?.()),
    undefined,
    { timeout: 10000 },
  );
}

export async function gotoApp(page, viewport = DESKTOP_VIEWPORT) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await waitForBridgeReady(page);
}

export async function clearSaves(page) {
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key === 'game-save' || key === 'wdttgukji_save_meta' || key.startsWith('wdttgukji_save_')) {
        window.localStorage.removeItem(key);
      }
    }
  });
}

export async function freshStart(page, viewport = DESKTOP_VIEWPORT) {
  await gotoApp(page, viewport);
  await clearSaves(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForBridgeReady(page);
  await waitForRoute(page, 'start');
}

export async function callBridge(page, method, ...args) {
  return page.evaluate(({ method, args }) => {
    const bridge = window.__wdttgukjiPhaser;
    if (!bridge || typeof bridge[method] !== 'function') {
      throw new Error(`Bridge method missing: ${method}`);
    }
    return bridge[method](...args);
  }, { method, args });
}

export async function waitForRoute(page, route, timeout = 10000) {
  await page.waitForFunction(
    (expectedRoute) => window.__wdttgukjiPhaser?.getRoute?.() === expectedRoute,
    route,
    { timeout },
  );
}

export async function enterBattlefield(page, faction = 'shu') {
  await callBridge(page, 'startNewGame');
  await waitForRoute(page, 'faction');
  await callBridge(page, 'selectFaction', faction);
  await waitForRoute(page, 'battlefield');
  await page.waitForFunction(
    (expectedFaction) => {
      const snapshot = window.__wdttgukjiPhaser?.getSnapshot?.();
      return snapshot?.selectedFaction === expectedFaction && snapshot?.turn === 1;
    },
    faction,
    { timeout: 10000 },
  );
}

export async function enterCommand(page, { faction = 'shu', cityId = 'xiangyang', tab = 'government' } = {}) {
  await enterBattlefield(page, faction);
  await callBridge(page, 'selectCity', cityId);
  await page.waitForFunction(
    (expectedCityId) => window.__wdttgukjiPhaser?.getSelectedCity?.() === expectedCityId,
    cityId,
    { timeout: 5000 },
  );
  await callBridge(page, 'openActionPanel', cityId, tab);
  await waitForRoute(page, 'command', 5000);
  await page.waitForFunction(
    ({ expectedCityId, expectedTab }) => {
      const snapshot = window.__wdttgukjiPhaser?.getSnapshot?.();
      return snapshot?.actionPanel?.open
        && snapshot.actionPanel.cityId === expectedCityId
        && snapshot.actionPanel.activeTab === expectedTab;
    },
    { expectedCityId: cityId, expectedTab: tab },
    { timeout: 5000 },
  );
}

export async function advanceTurn(page, expectedTurn = 2) {
  await callBridge(page, 'advanceTurn');
  await page.waitForFunction(
    (turn) => window.__wdttgukjiPhaser?.getSnapshot?.()?.turn === turn,
    expectedTurn,
    { timeout: 10000 },
  );
}

export async function collectAudit(page, sceneName, forbiddenTerms = [], generatedSelectors = []) {
  return page.evaluate(({ sceneName, forbiddenTerms, generatedSelectors }) => {
    const normalize = (value = '') => `${value}`.replace(/\s+/g, ' ').trim().toLowerCase();
    const bridge = window.__wdttgukjiPhaser;
    const snapshot = bridge?.getSnapshot?.() || null;
    const canvas = document.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect?.();
    const visibleText = normalize(document.body.innerText || '');

    return {
      scene: sceneName,
      route: snapshot?.route || null,
      selectedFaction: snapshot?.selectedFaction || null,
      selectedCity: snapshot?.selectedCity || null,
      turn: snapshot?.turn || null,
      year: snapshot?.year || null,
      month: snapshot?.month || null,
      actionsRemaining: snapshot?.actionsRemaining ?? null,
      hud: snapshot?.hud || null,
      actionPanel: snapshot?.actionPanel || null,
      canvas: snapshot?.canvas || {
        width: rect?.width || 0,
        height: rect?.height || 0,
        top: rect?.top || 0,
        left: rect?.left || 0,
        right: rect?.right || 0,
        bottom: rect?.bottom || 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
      canvasFitsViewport: !!rect
        && rect.left >= -1
        && rect.top >= -1
        && rect.right <= window.innerWidth + 1
        && rect.bottom <= window.innerHeight + 1,
      commandPanelFitsViewport: !snapshot?.actionPanel?.bounds || (
        snapshot.actionPanel.bounds.x >= 0
        && snapshot.actionPanel.bounds.y >= 0
        && snapshot.actionPanel.bounds.x + snapshot.actionPanel.bounds.width <= 1600
        && snapshot.actionPanel.bounds.y + snapshot.actionPanel.bounds.height <= 900
      ),
      overflow_x: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      overflow_y: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      forbidden_terms: forbiddenTerms.filter((term) => visibleText.includes(term)),
      generated_artifacts_present: generatedSelectors.some((selector) => document.querySelector(selector)),
      viteClientPresent: !!document.querySelector('script[src*="/@vite/client"]'),
    };
  }, { sceneName, forbiddenTerms, generatedSelectors });
}
