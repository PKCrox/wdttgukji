#!/usr/bin/env node

import { chromium } from 'playwright';
import { BASE_URL, DESKTOP_VIEWPORT, ensureViteServer, freshStart } from './phaser-playwright-helpers.js';

async function main() {
  let server = null;

  try {
    ({ server } = await ensureViteServer(process.cwd()));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: DESKTOP_VIEWPORT });
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await freshStart(page, DESKTOP_VIEWPORT);

    const hmrClientPresent = (await page.locator('script[src*="/@vite/client"]').count()) > 0;
    const snapshot = await page.evaluate(() => window.__wdttgukjiPhaser.getSnapshot());

    await browser.close();

    const report = {
      appMode: 'phaser',
      baseUrl: BASE_URL,
      hmrClientPresent,
      route: snapshot.route,
      canvas: snapshot.canvas,
      consoleErrors,
      legacyNote: 'Legacy custom live-reload smoke remains available at npm run qa:live-reload:legacy',
    };

    console.log(JSON.stringify(report, null, 2));

    const failures = [];
    if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join(' | ')}`);
    if (!hmrClientPresent) failures.push('vite HMR client was not injected');
    if (snapshot.route !== 'start') failures.push(`expected route=start got ${snapshot.route}`);
    if (!snapshot.canvas?.width) failures.push('missing phaser canvas metrics');

    if (failures.length > 0) {
      throw new Error(failures.join('; '));
    }
  } finally {
    server?.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
