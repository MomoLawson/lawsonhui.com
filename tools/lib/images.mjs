/**
 * 图片工具库：扫描本地图片、计算哈希、读写上传清单（manifest）。
 *
 * 清单文件 tools/image-manifest.json 是「增量上传」的核心：
 * 键 = 相对仓库根目录的路径，值里有 sha256，内容没变就不会重复上传。
 * 该文件会提交到 GitHub，所以别人 clone 之后即使没有 img/ 目录，
 * 也能直接用清单里的图床链接构建站点。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MANIFEST_PATH = path.join(ROOT, 'tools', 'image-manifest.json');

export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.svg', '.tif', '.tiff', '.jfif', '.heic'
]);

export const SCAN_DIRS = ['img', 'source/images'];

export const MANIFEST_VERSION = 2;

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

export function relativeToRoot(file) {
  return toPosix(path.relative(ROOT, file));
}

/** 读取 .env（不依赖 dotenv，任何多余格式都能忍） */
export function loadEnv(file = path.join(ROOT, '.env')) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** 递归列出所有图片，返回相对于仓库根目录的 posix 路径数组 */
export async function listImages(dirs = SCAN_DIRS) {
  const found = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.DS_Store' || entry.name.startsWith('._')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) found.push(relativeToRoot(full));
      }
    }
  }

  for (const dir of dirs) {
    await walk(path.isAbsolute(dir) ? dir : path.join(ROOT, dir));
  }

  found.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return found;
}

export async function hashFile(relPath) {
  const buf = await fsp.readFile(path.join(ROOT, relPath));
  return {
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length
  };
}

export function emptyManifest() {
  return { version: MANIFEST_VERSION, updatedAt: null, images: {}, failed: {} };
}

export async function readManifest(file = MANIFEST_PATH) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    return {
      version: data.version || MANIFEST_VERSION,
      updatedAt: data.updatedAt || null,
      images: data.images || {},
      failed: data.failed || {}
    };
  } catch {
    return emptyManifest();
  }
}

export async function writeManifest(manifest, file = MANIFEST_PATH) {
  manifest.version = MANIFEST_VERSION;
  manifest.updatedAt = new Date().toISOString();
  const sorted = {};
  for (const key of Object.keys(manifest.images).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
    sorted[key] = manifest.images[key];
  }
  manifest.images = sorted;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/** 支持 --limit / --only / --force / --dry-run / --verify 之类的小参数解析 */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      const value = rest.join('=');
      flags[key] = value === '' ? true : value;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '?';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)}${units[unit]}`;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 去掉每次运行都会变的时间戳，用来判断清单「内容上是否真的变了」。
 * 没变就不写文件，避免每次构建都产生一个无意义的提交。
 */
export function normalizeManifest(manifest) {
  const images = {};
  for (const key of Object.keys(manifest.images).sort()) {
    const entry = manifest.images[key];
    images[key] = {
      sha256: entry.sha256,
      bytes: entry.bytes,
      url: entry.url,
      thumb: entry.thumb,
      medium: entry.medium,
      id: entry.id,
      width: entry.width,
      height: entry.height,
      mime: entry.mime,
      uploadedAt: entry.uploadedAt
    };
  }
  const failed = {};
  for (const key of Object.keys(manifest.failed).sort()) {
    failed[key] = { error: manifest.failed[key].error, sha256: manifest.failed[key].sha256 };
  }
  return JSON.stringify({ images, failed });
}
