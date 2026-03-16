#!/usr/bin/env node
/**
 * P6 결합: chapter-summaries-parts/batch-*.json → novel-chapter-summaries.json
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PARTS = join(ROOT, 'data', 'processed', 'chapter-summaries-parts');
const OUT = join(ROOT, 'data', 'processed', 'novel-chapter-summaries.json');

const files = readdirSync(PARTS)
  .filter(f => f.startsWith('batch-') && f.endsWith('.json'))
  .sort();

console.log(`\n📚 P6 결합: ${files.length}개 배치 파일\n`);

const allChapters = [];
let errors = 0;

for (const f of files) {
  try {
    const data = JSON.parse(readFileSync(join(PARTS, f), 'utf-8'));
    const chapters = data.chapters || [];
    allChapters.push(...chapters);
    console.log(`  ✅ ${f}: ${chapters.length}개 회차`);
  } catch (err) {
    console.error(`  ❌ ${f}: ${err.message}`);
    errors++;
  }
}

// 회차 번호 순 정렬
allChapters.sort((a, b) => a.chapter_number - b.chapter_number);

// 누락 회차 체크
const have = new Set(allChapters.map(c => c.chapter_number));
const missing = [];
for (let i = 1; i <= 120; i++) {
  if (!have.has(i)) missing.push(i);
}

const result = {
  total: allChapters.length,
  generated_at: new Date().toISOString(),
  missing_chapters: missing,
  chapters: allChapters,
};

writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf-8');

console.log(`\n  총 ${allChapters.length}/120 회차`);
if (missing.length) console.log(`  ⚠️  누락: ${missing.join(', ')}`);
if (errors) console.log(`  ❌ 오류: ${errors}개 배치`);
console.log(`  ✅ → ${OUT}\n`);
