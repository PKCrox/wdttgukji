#!/usr/bin/env node
/**
 * GitHub 삼국지 데이터 리포지토리 크롤러
 *
 * GitHub API로 리포 파일 트리를 탐색하고, JSON/CSV/data 파일을 다운로드.
 *
 * Target repos:
 *   1. PythWare/ROTK-XI-Tools   — ROTK11 관련 도구/데이터
 *   2. junqdu/LTKDEX             — Legends of Three Kingdoms 카드 데이터
 *   3. dmanolidis/three-kingdoms — Three Kingdoms 소셜 네트워크 데이터
 *
 * Usage:
 *   node scripts/crawl/crawl-github-rotk-data.js                         # 전체 리포
 *   node scripts/crawl/crawl-github-rotk-data.js --repo all              # 전체
 *   node scripts/crawl/crawl-github-rotk-data.js --repo rotk-xi          # PythWare/ROTK-XI-Tools만
 *   node scripts/crawl/crawl-github-rotk-data.js --repo ltkdex           # junqdu/LTKDEX만
 *   node scripts/crawl/crawl-github-rotk-data.js --repo network          # dmanolidis/three-kingdoms만
 *   node scripts/crawl/crawl-github-rotk-data.js --delay 1000            # 요청 간격 (ms, 기본 1000)
 *   node scripts/crawl/crawl-github-rotk-data.js --resume                # 이미 존재하면 스킵
 *
 * Output: data/raw/github/{repo-name}/
 *
 * Note: GitHub API rate limit = 60 req/hr (unauthenticated).
 *       Set GITHUB_TOKEN env for 5000 req/hr.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_BASE = join(ROOT, 'data', 'raw', 'github');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const repoFilter = getArg('--repo') || 'all';
const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '1000', 10);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Repo definitions ──
const REPOS = [
  {
    key: 'rotk-xi',
    owner: 'PythWare',
    repo: 'ROTK-XI-Tools',
    branch: 'master',
    description: 'ROTK XI modding tools and data files',
    dataExtensions: ['.json', '.csv', '.tsv', '.txt', '.xml', '.dat', '.bin', '.yaml', '.yml', '.toml', '.ini', '.cfg'],
    // Also include specific directories that likely contain data
    dataPaths: ['data', 'Data', 'resources', 'Resources', 'src/data', 'assets'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },
  {
    key: 'ltkdex',
    owner: 'junqdu',
    repo: 'LTKDEX',
    branch: 'master',
    description: 'Legends of Three Kingdoms (三国杀) card database',
    dataExtensions: ['.json', '.csv', '.tsv', '.txt', '.xml', '.yaml', '.yml', '.html', '.md'],
    dataPaths: [],
    maxFileSize: 10 * 1024 * 1024,
  },
  {
    key: 'network',
    owner: 'dmanolidis',
    repo: 'three-kingdoms',
    branch: 'master',
    description: 'Three Kingdoms social network/graph data',
    dataExtensions: ['.json', '.csv', '.tsv', '.gexf', '.graphml', '.txt', '.xml', '.net', '.gml', '.edgelist'],
    dataPaths: ['data', 'Data', 'network', 'graph'],
    maxFileSize: 10 * 1024 * 1024,
  },
];

// ── HTTP helpers ──
function buildHeaders() {
  const headers = {
    'User-Agent': 'WdttGukjiBot/1.0',
    'Accept': 'application/vnd.github.v3+json',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  return headers;
}

function buildRawHeaders() {
  const headers = {
    'User-Agent': 'WdttGukjiBot/1.0',
    'Accept': 'application/octet-stream',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchJson(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: buildHeaders() });

      if (res.status === 404) return { status: 404, data: null };
      if (res.status === 403) {
        // Rate limit
        const resetHeader = res.headers.get('x-ratelimit-reset');
        const remaining = res.headers.get('x-ratelimit-remaining');
        console.log(`   403 Forbidden (remaining: ${remaining})`);
        if (resetHeader) {
          const waitSec = Math.max(0, parseInt(resetHeader, 10) - Math.floor(Date.now() / 1000));
          if (waitSec < 120) {
            console.log(`   Rate limited. Waiting ${waitSec}s for reset...`);
            await sleep(waitSec * 1000 + 1000);
            continue;
          }
        }
        return { status: 403, data: null, error: 'Rate limited' };
      }
      if (res.status === 409) {
        // Empty repo
        return { status: 409, data: null, error: 'Empty repository' };
      }
      if (!res.ok) {
        if (attempt < retries) { await sleep(2000); continue; }
        return { status: res.status, data: null };
      }

      const data = await res.json();
      return { status: 200, data };
    } catch (err) {
      if (attempt < retries) { await sleep(2000); continue; }
      return { status: 0, data: null, error: err.message };
    }
  }
  return { status: 0, data: null };
}

async function fetchRaw(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: buildRawHeaders(), redirect: 'follow' });

      if (res.status === 404) return { status: 404, content: null };
      if (res.status === 403) {
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          const resetHeader = res.headers.get('x-ratelimit-reset');
          const waitSec = resetHeader ? Math.max(0, parseInt(resetHeader, 10) - Math.floor(Date.now() / 1000)) : 60;
          if (waitSec < 120) {
            console.log(`   Rate limited. Waiting ${waitSec}s...`);
            await sleep(waitSec * 1000 + 1000);
            continue;
          }
        }
        return { status: 403, content: null };
      }
      if (!res.ok) {
        if (attempt < retries) { await sleep(2000); continue; }
        return { status: res.status, content: null };
      }

      // Check content type — text or binary?
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text') || contentType.includes('json') || contentType.includes('csv')
          || contentType.includes('xml') || contentType.includes('yaml')) {
        return { status: 200, content: await res.text(), binary: false };
      }

      // Binary content — save as buffer
      const arrayBuf = await res.arrayBuffer();
      return { status: 200, content: Buffer.from(arrayBuf), binary: true };
    } catch (err) {
      if (attempt < retries) { await sleep(2000); continue; }
      return { status: 0, content: null, error: err.message };
    }
  }
  return { status: 0, content: null };
}

// ── Check rate limit ──
async function checkRateLimit() {
  const result = await fetchJson('https://api.github.com/rate_limit');
  if (result.status === 200 && result.data) {
    const core = result.data.resources?.core || {};
    console.log(`   Rate limit: ${core.remaining}/${core.limit} remaining`);
    if (core.remaining < 10) {
      const resetTime = new Date(core.reset * 1000).toLocaleTimeString();
      console.log(`   WARNING: Low rate limit. Resets at ${resetTime}`);
      console.log(`   Set GITHUB_TOKEN env for higher limits (5000/hr)`);
    }
    return core.remaining || 0;
  }
  return -1; // unknown
}

// ── File tree filtering ──
function isDataFile(path, repoConfig) {
  const ext = extname(path).toLowerCase();

  // Check by extension
  if (repoConfig.dataExtensions.includes(ext)) return true;

  // Check by path prefix
  const lowerPath = path.toLowerCase();
  for (const dataPath of repoConfig.dataPaths) {
    if (lowerPath.startsWith(dataPath.toLowerCase() + '/')) return true;
  }

  return false;
}

function shouldSkipPath(path) {
  const lowerPath = path.toLowerCase();
  // Skip common non-data paths
  const skipPatterns = [
    'node_modules/', '.git/', '__pycache__/', '.github/',
    'venv/', '.venv/', 'dist/', 'build/', '.idea/', '.vscode/',
    'test/', 'tests/', 'spec/', '.tox/',
    'package-lock.json', 'yarn.lock', 'poetry.lock',
    '.DS_Store', 'Thumbs.db',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
    '.woff', '.woff2', '.ttf', '.eot',
    '.pyc', '.pyo', '.class', '.o', '.so', '.dylib',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
    '.exe', '.dll', '.app',
  ];

  for (const pattern of skipPatterns) {
    if (lowerPath.includes(pattern)) return true;
  }

  return false;
}

// ══════════════════════════════════════════════
// Crawl a single repo
// ══════════════════════════════════════════════

async function crawlRepo(repoConfig) {
  const { owner, repo, branch, key, description } = repoConfig;
  const outDir = join(OUT_BASE, key);
  mkdirSync(outDir, { recursive: true });

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  ${owner}/${repo} (${key})`);
  console.log(`  ${description}`);
  console.log(`${'─'.repeat(55)}`);

  // ── Step 1: Fetch repo file tree ──
  console.log(`\n  [1/3] Fetching file tree...`);

  // Try primary branch, then fallback
  const branches = [branch, 'main', 'master'];
  let tree = null;
  let usedBranch = '';

  for (const b of branches) {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${b}?recursive=1`;
    console.log(`   Trying branch: ${b}`);
    const result = await fetchJson(treeUrl);

    if (result.status === 200 && result.data?.tree) {
      tree = result.data.tree;
      usedBranch = b;
      break;
    }

    if (result.status === 404) {
      console.log(`   Branch '${b}' not found`);
    } else if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    await sleep(delay);
  }

  if (!tree) {
    console.log(`   FAILED: Could not fetch file tree for ${owner}/${repo}`);
    console.log(`   The repository may not exist, be private, or have been removed.`);
    return { success: 0, failed: 0, skipped: 0, totalBytes: 0 };
  }

  console.log(`   Branch: ${usedBranch}`);
  console.log(`   Total files in tree: ${tree.length}`);

  // ── Step 2: Filter data files ──
  console.log(`\n  [2/3] Filtering data files...`);

  const dataFiles = tree.filter(item => {
    if (item.type !== 'blob') return false;
    if (shouldSkipPath(item.path)) return false;
    if (item.size > repoConfig.maxFileSize) return false;
    return isDataFile(item.path, repoConfig);
  });

  console.log(`   Data files found: ${dataFiles.length}`);

  if (dataFiles.length === 0) {
    console.log(`   No matching data files. Listing all files for reference:`);
    const allFiles = tree.filter(i => i.type === 'blob').slice(0, 30);
    for (const f of allFiles) {
      console.log(`     ${f.path} (${formatBytes(f.size)})`);
    }
    if (tree.filter(i => i.type === 'blob').length > 30) {
      console.log(`     ... and ${tree.filter(i => i.type === 'blob').length - 30} more`);
    }

    // Save the file listing as metadata
    const meta = {
      repo: `${owner}/${repo}`,
      branch: usedBranch,
      crawled_at: new Date().toISOString(),
      total_files: tree.filter(i => i.type === 'blob').length,
      all_files: tree.filter(i => i.type === 'blob').map(f => ({ path: f.path, size: f.size })),
      note: 'No data files matched filter criteria. Full file listing saved for manual review.',
    };
    writeFileSync(join(outDir, '_metadata.json'), JSON.stringify(meta, null, 2), 'utf-8');
    return { success: 0, failed: 0, skipped: 0, totalBytes: 0 };
  }

  // Print what we'll download
  let totalSize = 0;
  for (const f of dataFiles) {
    totalSize += f.size || 0;
  }
  console.log(`   Total download size: ${formatBytes(totalSize)}`);
  console.log(`   Files:`);
  for (const f of dataFiles.slice(0, 20)) {
    console.log(`     ${f.path} (${formatBytes(f.size)})`);
  }
  if (dataFiles.length > 20) {
    console.log(`     ... and ${dataFiles.length - 20} more`);
  }

  // ── Step 3: Download files ──
  console.log(`\n  [3/3] Downloading ${dataFiles.length} files...`);

  const results = { success: 0, failed: 0, skipped: 0, totalBytes: 0, errors: [] };

  for (let i = 0; i < dataFiles.length; i++) {
    const file = dataFiles[i];
    const outPath = join(outDir, file.path);
    const outDirPath = dirname(outPath);

    // Resume check
    if (resume && existsSync(outPath)) {
      results.skipped++;
      continue;
    }

    mkdirSync(outDirPath, { recursive: true });

    // Download raw content from GitHub
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${usedBranch}/${file.path}`;

    try {
      const rawResult = await fetchRaw(rawUrl);

      if (rawResult.status !== 200 || rawResult.content === null) {
        console.log(`   [${i + 1}/${dataFiles.length}] ${file.path} — FAILED (HTTP ${rawResult.status})`);
        results.failed++;
        results.errors.push({ path: file.path, error: `HTTP ${rawResult.status}` });
        continue;
      }

      if (rawResult.binary) {
        writeFileSync(outPath, rawResult.content);
      } else {
        writeFileSync(outPath, rawResult.content, 'utf-8');
      }

      const sizeStr = formatBytes(rawResult.content.length || file.size);
      results.success++;
      results.totalBytes += rawResult.content.length || file.size;

      // Log every file (or every 10 if many)
      if (dataFiles.length <= 30 || (i + 1) % 5 === 0 || i === dataFiles.length - 1) {
        console.log(`   [${i + 1}/${dataFiles.length}] ${file.path} — OK (${sizeStr})`);
      }
    } catch (err) {
      console.log(`   [${i + 1}/${dataFiles.length}] ${file.path} — ERROR: ${err.message}`);
      results.failed++;
      results.errors.push({ path: file.path, error: err.message });
    }

    if (i < dataFiles.length - 1) await sleep(delay);
  }

  // ── Save metadata ──
  const meta = {
    repo: `${owner}/${repo}`,
    branch: usedBranch,
    description: repoConfig.description,
    crawled_at: new Date().toISOString(),
    total_files_in_repo: tree.filter(i => i.type === 'blob').length,
    data_files_found: dataFiles.length,
    downloaded: results.success,
    skipped: results.skipped,
    failed: results.failed,
    total_bytes: results.totalBytes,
    files: dataFiles.map(f => ({
      path: f.path,
      size: f.size,
      sha: f.sha,
    })),
  };
  writeFileSync(join(outDir, '_metadata.json'), JSON.stringify(meta, null, 2), 'utf-8');

  return results;
}

// ── Utilities ──
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ══════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════

async function main() {
  mkdirSync(OUT_BASE, { recursive: true });

  const startTime = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  GitHub Three Kingdoms Data Crawler`);
  console.log(`  Repos: ${repoFilter} | Delay: ${delay}ms | Resume: ${resume}`);
  console.log(`  Auth: ${GITHUB_TOKEN ? 'Token set (5000 req/hr)' : 'None (60 req/hr — set GITHUB_TOKEN for more)'}`);
  console.log(`${'='.repeat(60)}`);

  // Check rate limit
  const remaining = await checkRateLimit();
  if (remaining === 0) {
    console.log('\n   ERROR: GitHub API rate limit exhausted. Set GITHUB_TOKEN or wait for reset.');
    process.exit(1);
  }

  // Select repos
  const targetRepos = repoFilter === 'all'
    ? REPOS
    : REPOS.filter(r => r.key === repoFilter);

  if (targetRepos.length === 0) {
    console.error(`   Unknown repo: "${repoFilter}". Options: all, ${REPOS.map(r => r.key).join(', ')}`);
    process.exit(1);
  }

  // Crawl each repo
  const allResults = {};
  for (const repoConfig of targetRepos) {
    allResults[repoConfig.key] = await crawlRepo(repoConfig);
    if (targetRepos.indexOf(repoConfig) < targetRepos.length - 1) {
      await sleep(delay);
    }
  }

  // ── Summary ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SUMMARY (${elapsed}s)`);
  console.log(`${'='.repeat(60)}`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalBytes = 0;

  for (const [key, r] of Object.entries(allResults)) {
    const repo = REPOS.find(x => x.key === key);
    console.log(`\n  ${repo.owner}/${repo.repo}:`);
    console.log(`    Downloaded: ${r.success} | Skipped: ${r.skipped} | Failed: ${r.failed} | Size: ${formatBytes(r.totalBytes)}`);
    if (r.errors?.length > 0) {
      console.log(`    Errors:`);
      for (const e of r.errors.slice(0, 5)) {
        console.log(`      - ${e.path}: ${e.error}`);
      }
    }
    totalSuccess += r.success;
    totalFailed += r.failed;
    totalSkipped += r.skipped;
    totalBytes += r.totalBytes;
  }

  console.log(`\n  Total: ${totalSuccess} files (${formatBytes(totalBytes)}) | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  console.log(`  Output: ${OUT_BASE}/`);
  console.log(`${'='.repeat(60)}\n`);

  // Check remaining rate limit
  await checkRateLimit();

  if (totalSuccess === 0 && totalFailed > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
