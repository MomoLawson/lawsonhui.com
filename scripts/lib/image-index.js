'use strict';

const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.svg', '.tif', '.tiff', '.jfif'
]);

function readManifest(root) {
  const file = path.join(root, 'tools', 'image-manifest.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { images: data.images || {}, failed: data.failed || {}, updatedAt: data.updatedAt || null };
  } catch {
    return { images: {}, failed: {}, updatedAt: null };
  }
}

function listDir(root, relDir) {
  const abs = path.join(root, relDir);
  let entries = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile())
    .filter(entry => IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .filter(entry => !entry.name.startsWith('.') && !entry.name.startsWith('._'))
    .map(entry => relDir.replace(/\/+$/, '') + '/' + entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

/** 目录里没有文件时（比如 clone 之后没有图片），退回用清单里记录的路径 */
function listFromManifest(manifest, relDir) {
  const prefix = relDir.replace(/\/+$/, '') + '/';
  return Object.keys(manifest.images)
    .filter(key => key.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function encodeLocalPath(relPath) {
  return '/' + relPath.split('/').map(encodeURIComponent).join('/');
}

/**
 * 生成页面用得到的图片索引，每一项形如 { path, url, thumb, uploaded }。
 * uploaded=false 时会退化为本地相对路径（构建脚本会把文件复制进 public/，保证不丢图）。
 */
function buildImageIndex(options) {
  const root = options.root;
  const config = options.config;
  const manifest = readManifest(root);
  const bgConfig = config.background || {};

  const resolve = relPath => {
    const entry = manifest.images[relPath];
    if (entry && entry.url) {
      return {
        path: relPath,
        url: entry.url,
        thumb: entry.thumb || entry.url,
        width: entry.width || null,
        height: entry.height || null,
        uploaded: true
      };
    }
    return { path: relPath, url: encodeLocalPath(relPath), thumb: encodeLocalPath(relPath), uploaded: false };
  };

  const backgrounds = {};
  let total = 0;
  let uploaded = 0;

  for (const skin of Object.keys(bgConfig)) {
    const dirs = bgConfig[skin];
    if (!dirs || typeof dirs !== 'object') continue;
    backgrounds[skin] = {};
    for (const device of Object.keys(dirs)) {
      const relDir = dirs[device];
      if (typeof relDir !== 'string') continue;
      let files = listDir(root, relDir);
      if (!files.length) files = listFromManifest(manifest, relDir);
      const items = files.map(resolve);
      total += items.length;
      uploaded += items.filter(item => item.uploaded).length;
      backgrounds[skin][device] = items;
    }
  }

  const avatar = config.avatar ? resolve(config.avatar) : null;
  if (avatar) {
    total += 1;
    if (avatar.uploaded) uploaded += 1;
  }

  return {
    manifestUpdatedAt: manifest.updatedAt,
    manifestCount: Object.keys(manifest.images).length,
    backgrounds: backgrounds,
    avatar: avatar,
    stats: {
      total: total,
      uploaded: uploaded,
      local: total - uploaded,
      missing: total === 0
    },
    resolve: resolve
  };
}

module.exports = { buildImageIndex: buildImageIndex, readManifest: readManifest, listDir: listDir, encodeLocalPath: encodeLocalPath, IMAGE_EXTENSIONS: IMAGE_EXTENSIONS };
