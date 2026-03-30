#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCK_PATH = path.join(REPO_ROOT, 'runs', 'playwright-visible.lock.json');
const BRIEF_PATH = path.join(REPO_ROOT, 'runs', 'ui-pass', 'latest-brief.json');
const PHILOSOPHY_PATH = path.join(REPO_ROOT, 'docs', 'game-philosophy.md');

const SCENE_CARDS = {
  start: {
    dramaticQuestion: '누구의 깃발을 들 것인가',
    protagonist: '세력 선택과 출정 CTA',
    lead: 'koei-systems-designer',
    cell: ['koei-systems-designer', 'ux-stage-director', 'engine-integrator', 'content-planner'],
    cutFirst: ['장식성 문장 반복', '중복 약속 카드', 'UI 플로우 설명'],
  },
  battlefield: {
    dramaticQuestion: '지금 어느 거점을 붙잡아야 하는가',
    protagonist: '맵',
    lead: 'koei-systems-designer',
    cell: ['koei-systems-designer', 'ux-stage-director', 'map-art-director', 'engine-integrator'],
    cutFirst: ['맵과 중복되는 rail', 'selection 상세 장문', '패널끼리의 이중 내레이션'],
  },
  command: {
    dramaticQuestion: '이번 턴 무엇을 실행할 것인가',
    protagonist: '카드 선택과 확정 버튼',
    lead: 'koei-systems-designer',
    cell: ['koei-systems-designer', 'ux-stage-director', 'engine-integrator', 'content-planner'],
    cutFirst: ['패널 상태 설명', '상단 요약 중복', '결정보다 먼저 읽히는 메타 문구'],
  },
};

function parseArgs(argv) {
  const args = {
    scene: 'battlefield',
    replace: false,
    noOpen: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--scene') args.scene = argv[++index] || args.scene;
    else if (token === '--replace') args.replace = true;
    else if (token === '--no-open') args.noOpen = true;
  }

  if (!SCENE_CARDS[args.scene]) {
    throw new Error(`Unsupported --scene value: ${args.scene}`);
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ensureRepoRoot() {
  const cwd = path.resolve(process.cwd());
  if (cwd !== REPO_ROOT) {
    throw new Error([
      'Run `ui:pass` from the wdttgukji repo root.',
      `cwd: ${cwd}`,
      `expected: ${REPO_ROOT}`,
    ].join('\n'));
  }

  const packageJson = await readJson(path.join(REPO_ROOT, 'package.json'));
  if (packageJson.name !== 'wdttgukji') {
    throw new Error(`Unexpected package name: ${packageJson.name}`);
  }

  await access(PHILOSOPHY_PATH);
}

async function readVisibleLock() {
  try {
    const lock = await readJson(LOCK_PATH);
    return isProcessAlive(lock.pid) ? lock : null;
  } catch {
    return null;
  }
}

async function writeBrief(sceneCard, scene) {
  await mkdir(path.dirname(BRIEF_PATH), { recursive: true });
  const payload = {
    scene,
    dramaticQuestion: sceneCard.dramaticQuestion,
    protagonist: sceneCard.protagonist,
    lead: sceneCard.lead,
    cell: sceneCard.cell,
    cutFirst: sceneCard.cutFirst,
    viewport: '1512x982',
    philosophyPath: PHILOSOPHY_PATH,
    createdAt: new Date().toISOString(),
  };
  await writeFile(BRIEF_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function launchVisibleScene(scene, replace) {
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'qa', 'open-visible-playwright.js');
  const child = spawn(
    process.execPath,
    [scriptPath, '--scene', scene, ...(replace ? ['--replace'] : [])],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: 'ignore',
    },
  );
  child.unref();

  for (let index = 0; index < 40; index += 1) {
    await delay(250);
    const lock = await readVisibleLock();
    if (lock && lock.scene === scene) return lock;
  }

  return await readVisibleLock();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureRepoRoot();

  const sceneCard = SCENE_CARDS[args.scene];
  const currentLock = await readVisibleLock();
  if (currentLock && !args.replace && !args.noOpen) {
    throw new Error(
      `Visible Playwright session already active (pid ${currentLock.pid}, scene ${currentLock.scene || 'start'}). Re-run with --replace to recycle it.`,
    );
  }

  await writeBrief(sceneCard, args.scene);

  const lines = [
    'wdttgukji UI pass',
    `scene: ${args.scene}`,
    `dramatic_question: ${sceneCard.dramaticQuestion}`,
    `protagonist: ${sceneCard.protagonist}`,
    `lead: ${sceneCard.lead}`,
    `cell: ${sceneCard.cell.join(', ')}`,
    `cut_first: ${sceneCard.cutFirst.join(' / ')}`,
    `philosophy: ${PHILOSOPHY_PATH}`,
    `brief_artifact: ${BRIEF_PATH}`,
    'order: philosophy -> visible Playwright -> inspect -> patch -> visible Playwright -> ui:pass:verify',
  ];

  if (args.noOpen) {
    console.log([...lines, 'visible_playwright: skipped (--no-open)'].join('\n'));
    return;
  }

  const lock = await launchVisibleScene(args.scene, args.replace);
  console.log([
    ...lines,
    `visible_playwright: ${lock ? `pid=${lock.pid} scene=${lock.scene}` : 'launch requested'}`,
    'next_verify: npm run ui:pass:verify',
  ].join('\n'));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
