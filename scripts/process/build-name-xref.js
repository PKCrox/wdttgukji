#!/usr/bin/env node
/**
 * Name Cross-Reference Builder
 *
 * Builds a fuzzy cross-reference map between ALL_CHARACTERS and external sources:
 *   - Kongming Encyclopedia (1100+ crawled files + 3200+ index entries)
 *   - Kongming SGZ translations (147 characters)
 *   - Fandom Koei wiki (108 characters)
 *   - ROTK 10/11/12 stats (kr→cn supplement)
 *
 * Matching strategies (in priority order):
 *   1. Exact slug match (name_en → lowercase-hyphenated)
 *   2. Chinese name match (name_cn → Traditional Chinese in kongming details/title)
 *   3. Index URL slug match (kongming _index-cache.json URL → slug)
 *   4. Fuzzy pinyin match (normalize both sides, strip hyphens/spaces, compare)
 *
 * Output: data/processed/name-xref.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RAW = join(ROOT, 'data', 'raw');
const PROCESSED = join(ROOT, 'data', 'processed');

// ── Helpers ──

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { return null; }
}

/** Normalize English name to slug: "Cao Cao" → "cao-cao" */
function toSlug(nameEn) {
  return nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Normalize for fuzzy comparison: strip hyphens, spaces, parens, lowercase */
function normalizePinyin(s) {
  return s.toLowerCase().replace(/[-\s()（）']/g, '');
}

/**
 * Generate romanization variants for fuzzy matching.
 * Handles common pinyin romanization differences:
 *   Lv/Lü ↔ Lu, Jiao ↔ Jue, etc.
 */
function pinyinVariants(nameEn) {
  const variants = new Set();
  const lower = nameEn.toLowerCase();
  variants.add(normalizePinyin(lower));

  // Lv/Lü → Lu and vice versa (呂/旅/律 can be Lv, Lu, or Lü)
  if (lower.includes('lv')) {
    variants.add(normalizePinyin(lower.replace(/\blv/g, 'lu')));
    variants.add(normalizePinyin(lower.replace(/\blv/g, 'lü')));
  }
  if (lower.includes('lu')) {
    variants.add(normalizePinyin(lower.replace(/\blu\b/g, 'lv')));
  }

  // Jiao ↔ Jue (角 can be romanized either way)
  if (lower.includes('jiao')) {
    variants.add(normalizePinyin(lower.replace('jiao', 'jue')));
  }
  if (lower.includes('jue')) {
    variants.add(normalizePinyin(lower.replace('jue', 'jiao')));
  }

  return variants;
}

/** Extract Chinese characters only (strip spaces, parens, courtesy names) */
function extractChinese(s) {
  if (!s) return '';
  return (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || []).join('');
}

/** Extract base name from kongming name: "Cao Cao (Mengde)" → "Cao Cao" */
function stripCourtesy(name) {
  return name.replace(/\s*\(.*?\)\s*$/, '').trim();
}

// ── Load Sources ──

function loadKongmingEncyclopedia() {
  const dir = join(RAW, 'kongming-encyclopedia');
  if (!existsSync(dir)) return { files: {}, index: [], cnMap: {}, nameMap: {} };

  // 1. Load crawled files
  const files = {};    // slug (filename without .json) → data
  const cnMap = {};    // Chinese name (Traditional, no courtesy) → slug
  const nameMap = {};  // normalized base name → slug

  const jsonFiles = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of jsonFiles) {
    const slug = f.slice(0, -5); // strip .json
    const data = loadJson(join(dir, f));
    if (!data) continue;

    files[slug] = data;
    const name = data.name || '';

    // Extract Traditional Chinese from sections.details
    const details = data.sections?.details || '';
    const tradMatch = details.match(/Traditional Chinese\s*\n?\t?([\u4e00-\u9fff\u3400-\u4dbf\s()（）]+)/);
    let tradCn = '';
    if (tradMatch) {
      // Clean: take the main name before any parenthetical courtesy name
      tradCn = extractChinese(tradMatch[1].replace(/\s*[（(].*?[）)]/, ''));
    }

    // Fallback: extract from page_title
    if (!tradCn) {
      const titleCn = extractChinese(data.page_title || '');
      if (titleCn) tradCn = titleCn;
    }

    if (tradCn) cnMap[tradCn] = slug;

    // Normalized base English name → slug
    const baseName = stripCourtesy(name);
    if (baseName) {
      nameMap[normalizePinyin(baseName)] = slug;
    }
  }

  // 2. Load index cache (has 3200+ entries, many uncrawled)
  const indexData = loadJson(join(dir, '_index-cache.json'));
  const index = indexData?.officers || [];

  // Build index slug map: URL slug → { name, baseName }
  // The URL slug is the definitive identifier for kongming entries
  const indexSlugMap = {};
  // Courtesy name → URL slug (e.g., "Gongda" → "xun-you" for 荀攸)
  const courtesyMap = {};
  // Bracket aliases: "Lady Sun ([Sun Shangxiang])" → slug
  const aliasMap = {};
  // Title-prefixed entries: "King Meng Huo" → "meng-huo" normalized
  const titlePrefixMap = {};

  for (const o of index) {
    const url = o.url || '';
    // Extract slug from URL: last path segment, lowercased
    const urlSlug = url.replace(/\/$/, '').split('/').pop().toLowerCase();
    const baseName = stripCourtesy(o.name);
    indexSlugMap[urlSlug] = { name: o.name, baseName, urlSlug };

    // Also map normalized base name → URL slug
    const normBase = normalizePinyin(baseName);
    // Prefer direct encyclopedia entries over /officers/ duplicates
    if (!indexSlugMap[normBase] || !url.includes('/officers/')) {
      indexSlugMap[normBase] = { name: o.name, baseName, urlSlug };
    }

    // Extract courtesy name: "Xun You (Gongda)" → courtesy = "Gongda"
    const courtesyMatch = o.name.match(/\(([^)]+)\)$/);
    if (courtesyMatch) {
      const courtesy = courtesyMatch[1].trim();
      // Map "surname + courtesy" to this slug
      const surname = baseName.split(/\s+/)[0];
      if (surname && courtesy) {
        courtesyMap[normalizePinyin(surname + courtesy)] = urlSlug;
      }
    }

    // Extract bracket aliases: "Lady Sun ([Sun Shangxiang])" → "Sun Shangxiang"
    const bracketMatch = o.name.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
      aliasMap[normalizePinyin(bracketMatch[1])] = urlSlug;
    }

    // Title-prefixed entries: "King Meng Huo", "Lady Sun", etc.
    const titleMatch = baseName.match(/^(King|Queen|Lady|Emperor|Empress|Lord|Prince|Princess|Duke)\s+(.+)/i);
    if (titleMatch) {
      titlePrefixMap[normalizePinyin(titleMatch[2])] = urlSlug;
    }
  }

  return { files, index, cnMap, nameMap, indexSlugMap, courtesyMap, aliasMap, titlePrefixMap };
}

function loadKongmingSgz() {
  const dir = join(RAW, 'kongming-sgz');
  if (!existsSync(dir)) return { files: {}, index: [] };

  const files = {};
  const jsonFiles = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of jsonFiles) {
    const slug = f.slice(0, -5);
    const data = loadJson(join(dir, f));
    if (!data) continue;
    files[slug] = data;
  }

  const indexData = loadJson(join(dir, '_index-cache.json'));
  const index = indexData?.characters || [];

  return { files, index };
}

function loadFandomKoei() {
  const dir = join(RAW, 'fandom-koei');
  if (!existsSync(dir)) return {};

  const map = {};
  const jsonFiles = readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of jsonFiles) {
    const slug = f.slice(0, -5);
    const data = loadJson(join(dir, f));
    if (!data) continue;
    // Fandom files use the character name directly
    const name = data.name || data.title || '';
    if (name) {
      map[toSlug(name)] = slug;
    }
    // Also store by filename slug
    map[slug] = slug;
  }

  return map;
}

function loadRotkCnMap() {
  // ROTK10 has name_cn for all 650 characters — best kr→cn source
  const kr2cn = {};
  const raw = loadJson(join(RAW, 'characters-rotk10-stats.json'));
  if (raw?.data) {
    for (const s of raw.data) {
      if (s.name_kr && s.name_cn) {
        kr2cn[s.name_kr] = s.name_cn;
      }
    }
  }
  return kr2cn;
}

// ── Matching Engine ──

function findKongmingSlug(char, kongming, rotkCnMap) {
  const slug = toSlug(char.name_en);
  const nameCn = char.name_cn || rotkCnMap[char.name_kr] || '';
  const normTarget = normalizePinyin(char.name_en);
  const variants = pinyinVariants(char.name_en);

  // Strategy 1: Exact file slug match
  if (kongming.files[slug]) {
    return { slug, matched_by: 'exact_file' };
  }

  // Strategy 2: Chinese name match against crawled files
  if (nameCn) {
    const cnClean = extractChinese(nameCn);
    if (cnClean && kongming.cnMap[cnClean]) {
      return { slug: kongming.cnMap[cnClean], matched_by: 'chinese_name' };
    }
  }

  // Strategy 3: Index URL slug match (covers uncrawled entries too)
  if (kongming.indexSlugMap[slug]) {
    return { slug, matched_by: 'index_url' };
  }

  // Strategy 4: Fuzzy pinyin match against crawled file names
  if (kongming.nameMap[normTarget]) {
    return { slug: kongming.nameMap[normTarget], matched_by: 'fuzzy_pinyin_file' };
  }

  // Strategy 5: Fuzzy pinyin against index entries
  for (const [key, info] of Object.entries(kongming.indexSlugMap)) {
    if (info.baseName && normalizePinyin(info.baseName) === normTarget) {
      const urlSlug = info.urlSlug || key;
      return { slug: urlSlug, matched_by: 'fuzzy_pinyin_index' };
    }
  }

  // Strategy 6: Romanization variants (Lv↔Lu, Jiao↔Jue)
  for (const variant of variants) {
    if (variant === normTarget) continue; // already tried
    // Check crawled files
    if (kongming.nameMap[variant]) {
      return { slug: kongming.nameMap[variant], matched_by: 'romanization_variant_file' };
    }
    // Check index
    for (const [key, info] of Object.entries(kongming.indexSlugMap)) {
      if (info.baseName && normalizePinyin(info.baseName) === variant) {
        const urlSlug = info.urlSlug || key;
        return { slug: urlSlug, matched_by: 'romanization_variant_index' };
      }
    }
  }

  // Strategy 7: Title prefix match (King/Lady/Emperor + name)
  if (kongming.titlePrefixMap[normTarget]) {
    return { slug: kongming.titlePrefixMap[normTarget], matched_by: 'title_prefix' };
  }
  // Also try variants with title prefix
  for (const variant of variants) {
    if (kongming.titlePrefixMap[variant]) {
      return { slug: kongming.titlePrefixMap[variant], matched_by: 'title_prefix_variant' };
    }
  }

  // Strategy 8: Bracket alias match (e.g., "[Sun Shangxiang]" in "Lady Sun")
  if (kongming.aliasMap[normTarget]) {
    return { slug: kongming.aliasMap[normTarget], matched_by: 'bracket_alias' };
  }

  // Strategy 9: Courtesy name cross-reference
  // character-list name_en might be courtesy-based: "Xun Gongda" where Gongda is courtesy
  if (kongming.courtesyMap[normTarget]) {
    return { slug: kongming.courtesyMap[normTarget], matched_by: 'courtesy_crossref' };
  }

  // Strategy 10: Partial Chinese name match with pinyin verification
  if (nameCn) {
    const cnClean = extractChinese(nameCn);
    if (cnClean && cnClean.length >= 2) {
      for (const [kongCn, kongSlug] of Object.entries(kongming.cnMap)) {
        if (kongCn.startsWith(cnClean) || cnClean.startsWith(kongCn)) {
          const kongName = kongming.files[kongSlug]?.name || '';
          const kongBase = normalizePinyin(stripCourtesy(kongName));
          if (kongBase === normTarget || variants.has(kongBase)) {
            return { slug: kongSlug, matched_by: 'chinese_partial+pinyin' };
          }
        }
      }
    }
  }

  return null;
}

function findSgzSlug(char, sgz) {
  const slug = toSlug(char.name_en);

  // Exact file match
  if (sgz.files[slug]) {
    return { slug, matched_by: 'exact_file' };
  }

  // Index slug match
  for (const entry of sgz.index) {
    if (entry.slug === slug) {
      return { slug, matched_by: 'index' };
    }
    // Fuzzy: compare normalized names
    if (normalizePinyin(entry.name) === normalizePinyin(char.name_en)) {
      return { slug: entry.slug, matched_by: 'fuzzy_pinyin' };
    }
  }

  return null;
}

function findFandomSlug(char, fandomMap) {
  const slug = toSlug(char.name_en);
  if (fandomMap[slug]) {
    return { slug: fandomMap[slug], matched_by: 'exact' };
  }

  // Try normalized comparison
  const normTarget = normalizePinyin(char.name_en);
  for (const [key, val] of Object.entries(fandomMap)) {
    if (normalizePinyin(key) === normTarget) {
      return { slug: val, matched_by: 'fuzzy_pinyin' };
    }
  }

  return null;
}

// ── Main ──

async function main() {
  console.log('\n🔗 Building Name Cross-Reference Map\n');

  // Load character list
  const { ALL_CHARACTERS } = await import('../crawl/character-list.js');
  console.log(`  Characters: ${ALL_CHARACTERS.length}`);

  // Load sources
  const kongming = loadKongmingEncyclopedia();
  console.log(`  Kongming files: ${Object.keys(kongming.files).length}, index: ${kongming.index.length}, CN map: ${Object.keys(kongming.cnMap).length}`);

  const sgz = loadKongmingSgz();
  console.log(`  SGZ files: ${Object.keys(sgz.files).length}, index: ${sgz.index.length}`);

  const fandomMap = loadFandomKoei();
  console.log(`  Fandom slugs: ${Object.keys(fandomMap).length}`);

  const rotkCnMap = loadRotkCnMap();
  console.log(`  ROTK10 kr→cn: ${Object.keys(rotkCnMap).length}`);

  // Build cross-reference
  const characters = [];
  const stats = {
    total: ALL_CHARACTERS.length,
    kongming_matched: 0,
    kongming_unmatched: 0,
    sgz_matched: 0,
    sgz_unmatched: 0,
    fandom_matched: 0,
    fandom_unmatched: 0,
    has_file_kongming: 0,  // actually crawled
    has_file_sgz: 0,
    has_file_fandom: 0,
    match_methods: {},
  };

  const unmatched = [];

  for (const char of ALL_CHARACTERS) {
    // Resolve Chinese name: prefer character-list, fallback to ROTK10
    const nameCn = char.name_cn || rotkCnMap[char.name_kr] || '';
    const nameCnSource = char.name_cn ? 'character_list' : (rotkCnMap[char.name_kr] ? 'rotk10' : null);

    const entry = {
      name_kr: char.name_kr,
      name_en: char.name_en,
      name_cn: nameCn,
      name_cn_source: nameCnSource,
      tier: char.tier,
      faction: char.faction,
      kongming_slug: null,
      kongming_matched_by: null,
      kongming_has_file: false,
      sgz_slug: null,
      sgz_matched_by: null,
      sgz_has_file: false,
      fandom_slug: null,
      fandom_matched_by: null,
      fandom_has_file: false,
    };

    // Kongming match
    const kongmingResult = findKongmingSlug(char, kongming, rotkCnMap);
    if (kongmingResult) {
      entry.kongming_slug = kongmingResult.slug;
      entry.kongming_matched_by = kongmingResult.matched_by;
      entry.kongming_has_file = !!kongming.files[kongmingResult.slug];
      stats.kongming_matched++;
      if (entry.kongming_has_file) stats.has_file_kongming++;
      stats.match_methods[kongmingResult.matched_by] = (stats.match_methods[kongmingResult.matched_by] || 0) + 1;
    } else {
      stats.kongming_unmatched++;
      unmatched.push(`${char.name_kr} (${char.name_en}) [Tier ${char.tier}]`);
    }

    // SGZ match
    const sgzResult = findSgzSlug(char, sgz);
    if (sgzResult) {
      entry.sgz_slug = sgzResult.slug;
      entry.sgz_matched_by = sgzResult.matched_by;
      entry.sgz_has_file = !!sgz.files[sgzResult.slug];
      stats.sgz_matched++;
      if (entry.sgz_has_file) stats.has_file_sgz++;
    } else {
      stats.sgz_unmatched++;
    }

    // Fandom match
    const fandomResult = findFandomSlug(char, fandomMap);
    if (fandomResult) {
      entry.fandom_slug = fandomResult.slug;
      entry.fandom_matched_by = fandomResult.matched_by;
      entry.fandom_has_file = existsSync(join(RAW, 'fandom-koei', `${fandomResult.slug}.json`));
      stats.fandom_matched++;
      if (entry.fandom_has_file) stats.has_file_fandom++;
    } else {
      stats.fandom_unmatched++;
    }

    characters.push(entry);
  }

  // Output
  mkdirSync(PROCESSED, { recursive: true });
  const output = {
    generated_at: new Date().toISOString(),
    stats,
    characters,
  };

  writeFileSync(
    join(PROCESSED, 'name-xref.json'),
    JSON.stringify(output, null, 2),
    'utf-8'
  );

  // Report
  console.log('\n  === Results ===');
  console.log(`  Total characters: ${stats.total}`);
  console.log(`  Kongming: ${stats.kongming_matched} matched (${stats.has_file_kongming} have file), ${stats.kongming_unmatched} unmatched`);
  console.log(`  SGZ:     ${stats.sgz_matched} matched (${stats.has_file_sgz} have file), ${stats.sgz_unmatched} unmatched`);
  console.log(`  Fandom:  ${stats.fandom_matched} matched (${stats.has_file_fandom} have file), ${stats.fandom_unmatched} unmatched`);
  console.log(`\n  Match methods:`, JSON.stringify(stats.match_methods, null, 4));

  if (unmatched.length > 0 && unmatched.length <= 30) {
    console.log(`\n  Kongming unmatched (${unmatched.length}):`);
    for (const u of unmatched) console.log(`    - ${u}`);
  } else if (unmatched.length > 30) {
    console.log(`\n  Kongming unmatched: ${unmatched.length} (showing first 30)`);
    for (const u of unmatched.slice(0, 30)) console.log(`    - ${u}`);
  }

  console.log(`\n  Output: data/processed/name-xref.json`);
  console.log();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
