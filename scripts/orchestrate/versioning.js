import fs from 'fs/promises';
import path from 'path';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function writeVersionSnapshot({
  baseDir,
  family,
  version,
  label,
  snapshot,
}) {
  const versionDir = path.join(baseDir, 'versions');
  const filePath = path.join(versionDir, `${family}-v${String(version).padStart(3, '0')}.json`);
  await writeJson(filePath, {
    family,
    version,
    label,
    created_at: new Date().toISOString(),
    snapshot,
  });
  return filePath;
}
