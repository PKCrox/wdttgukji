#!/usr/bin/env node

import { chromium } from 'playwright';
import {
  DESKTOP_VIEWPORT,
  advanceTurn,
  callBridge,
  collectAudit,
  ensureViteServer,
  enterCommand,
  freshStart,
} from './phaser-playwright-helpers.js';

async function main() {
  let server = null;

  try {
    ({ server } = await ensureViteServer(process.cwd()));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: DESKTOP_VIEWPORT });
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await freshStart(page, DESKTOP_VIEWPORT);
    const startAudit = await collectAudit(page, 'start');

    await enterCommand(page, { faction: 'shu', cityId: 'xiangyang', tab: 'government' });
    const commandAudit = await collectAudit(page, 'command');

    await callBridge(page, 'closeActionPanel');
    await advanceTurn(page, 2);
    const turnAudit = await collectAudit(page, 'turn-2');
    const saveMeta = await page.evaluate(() => window.__wdttgukjiPhaser.getSaveMeta());

    await browser.close();

    const report = {
      appMode: 'phaser',
      consoleErrors,
      pageErrors,
      startAudit,
      commandAudit,
      turnAudit,
      saveMeta,
    };

    const failedChecks = [];
    const addFailure = (name, details) => {
      failedChecks.push(details ? `${name}: ${details}` : name);
    };

    if (consoleErrors.length > 0) addFailure('console errors', consoleErrors.join(' | '));
    if (pageErrors.length > 0) addFailure('page errors', pageErrors.join(' | '));
    if (startAudit.route !== 'start') addFailure('start route', startAudit.route || 'missing');
    if (!startAudit.canvasFitsViewport) addFailure('start fit', 'phaser canvas exceeds viewport bounds');
    if (commandAudit.route !== 'command') addFailure('command route', commandAudit.route || 'missing');
    if (commandAudit.selectedFaction !== 'shu') addFailure('selected faction', commandAudit.selectedFaction || 'missing');
    if (commandAudit.selectedCity !== 'xiangyang') addFailure('selected city', commandAudit.selectedCity || 'missing');
    if (!commandAudit.actionPanel?.open) addFailure('command panel', 'panel did not open');
    if (commandAudit.actionPanel?.activeTab !== 'government') addFailure('command tab', commandAudit.actionPanel?.activeTab || 'missing');
    if (!commandAudit.commandPanelFitsViewport) addFailure('command panel fit', 'panel bounds exceed 1600x900 scene');
    if (turnAudit.turn !== 2) addFailure('turn advance', `expected 2, got ${turnAudit.turn ?? 'missing'}`);
    if (!turnAudit.hud?.turnText) addFailure('turn HUD', 'missing HUD turn label');
    if (saveMeta?.turn !== 2) addFailure('save meta turn', `expected 2, got ${saveMeta?.turn ?? 'missing'}`);
    if (saveMeta?.factionId !== 'shu') addFailure('save meta faction', saveMeta?.factionId || 'missing');

    report.failedChecks = failedChecks;

    console.log(JSON.stringify(report, null, 2));

    if (failedChecks.length > 0) {
      console.error(`slice check failed (${failedChecks.length}): ${failedChecks.join('; ')}`);
      process.exitCode = 1;
    }
  } finally {
    server?.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
