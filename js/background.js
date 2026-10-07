import { data, state, update } from './settings.js?v=3cbb48d67c';

const layer = document.querySelector('.bg__img');
let currentUrl = state.bgUrl || '';

/* ------------------------- 顶栏字色（黑/白） ------------------------- */

// 顶栏压在背景图上时，字色要跟着背景亮度走：背景亮就用深色字，暗就用白字。
// 观感上等价于「自动判断黑白」，实现是量一次背景图顶部那条的平均颜色，
// 再按和 .bg__scrim 一样的公式把它压暗，最后挑对比度更高的那种字色。
const INK_LIGHT = [255, 255, 255];
const INK_DARK = [16, 19, 26];
// 背景图顶部这一段（比例）对应顶栏背后的位置；量太小容易被单点噪声带偏
const SAMPLE_BAND = 0.16;

let inkCache = { url: '', rgb: null };

function cssNumber(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function channelLuminance(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}

function contrastWith(ink, background) {
  const a = relativeLuminance(ink);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 把平均颜色按 .bg__scrim 的压暗层合成，得到「顶栏实际压在什么颜色上」 */
function afterScrim(rgb) {
  const top = cssNumber('--scrim-1', 0.62);
  const mid = cssNumber('--scrim-2', 0.26);
  const dim = cssNumber('--bg-dim', 0.34);
  const bar = document.querySelector('.topbar__inner');
  const band = (bar ? bar.offsetHeight : 64) / Math.max(1, window.innerHeight);
  // 渐变从 0% 的 --scrim-1 线性过渡到 26% 的 --scrim-2，取顶栏这一段的中值
  const span = 0.26;
  const covered = Math.min(Math.max(band, 0.02), span);
  const gradient = top + (mid - top) * (covered / span / 2);
  const alpha = 1 - (1 - gradient) * (1 - dim);
  return rgb.map(value => value * (1 - alpha));
}

/** 背景图有专门的缩略图（ImgBB 那张 8KB 左右），量亮度用它就够了，别拉整张大图 */
function thumbFor(url) {
  const buckets = data.backgrounds || {};
  for (const skin of Object.keys(buckets)) {
    const devices = buckets[skin] || {};
    for (const device of Object.keys(devices)) {
      const hit = (devices[device] || []).find(item => {
        const itemUrl = typeof item === 'string' ? item : item && item.url;
        return itemUrl === url;
      });
      if (hit) return (hit && hit.thumb) || url;
    }
  }
  return url;
}

function measureTopRgb(url) {
  return new Promise(resolve => {
    const image = new Image();
    // 图床给了 access-control-allow-origin，带上这个才能在 canvas 里读像素；
    // 万一没有（或本地图片跨域失败），量不出来就保持默认白字。
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };

    image.onload = () => {
      try {
        const width = 16;
        const height = 4;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const sourceHeight = Math.max(1, Math.round(image.naturalHeight * SAMPLE_BAND));
        ctx.drawImage(image, 0, 0, image.naturalWidth, sourceHeight, 0, 0, width, height);
        const { data: pixels } = ctx.getImageData(0, 0, width, height);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          r += pixels[i];
          g += pixels[i + 1];
          b += pixels[i + 2];
        }
        const count = pixels.length / 4;
        done([r / count, g / count, b / count]);
      } catch (error) {
        done(null);
      }
    };
    image.onerror = () => done(null);
    image.src = thumbFor(url);
    window.setTimeout(() => done(null), 4000);
  });
}

/** 量完背景亮度，决定顶栏用黑字还是白字；换背景 / 改压暗之后都要跑一次 */
export async function refreshBarInk() {
  const root = document.documentElement;
  const url = currentUrl;

  // 只有首页首屏顶栏才压在背景图上，别的页面顶栏是毛玻璃，字色跟着皮肤深浅走
  if (root.dataset.page !== 'index' || !url || !root.dataset.hasBg) {
    delete root.dataset.barInk;
    return;
  }

  if (inkCache.url !== url) {
    const rgb = await measureTopRgb(url);
    inkCache = { url, rgb };
  }
  if (!inkCache.rgb) {
    delete root.dataset.barInk;
    return;
  }
  // 量图期间又换了背景的话，这次结果就作废
  if (url !== currentUrl) return;

  const back = afterScrim(inkCache.rgb);
  const dark = contrastWith(INK_DARK, back);
  const light = contrastWith(INK_LIGHT, back);
  root.dataset.barInk = dark > light ? 'dark' : 'light';
}

function isMobile() {
  return window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
}

function urlOf(item) {
  if (!item) return '';
  return typeof item === 'string' ? item : item.url || '';
}

/** 当前皮肤 + 当前设备可用的背景图池（优先用对应尺寸的那一档） */
export function poolFor(skin) {
  const bySkin = (data.backgrounds || {})[skin] || {};
  const primary = (bySkin[isMobile() ? 'mobile' : 'pc'] || []).map(urlOf).filter(Boolean);
  if (primary.length) return primary;
  return Object.keys(bySkin)
    .reduce((acc, device) => acc.concat((bySkin[device] || []).map(urlOf)), [])
    .filter(Boolean);
}

function pickFrom(pool, avoid) {
  if (!pool.length) return '';
  if (pool.length === 1) return pool[0];
  let url = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (url === avoid && guard < 10) {
    url = pool[Math.floor(Math.random() * pool.length)];
    guard += 1;
  }
  return url;
}

export function pickRandom(skin, avoid) {
  return pickFrom(poolFor(skin), avoid);
}

/**
 * 给定皮肤，返回一张「属于这个皮肤」的背景：
 * 当前这张本来就属于它 → 保持不变；否则从它的图池里随机挑一张。
 * 这样切皮肤必定换背景，不会再出现 MC 皮肤挂着 BA 壁纸的情况。
 */
export function resolveUrlForSkin(skin, current) {
  const pool = poolFor(skin);
  if (current && pool.indexOf(current) > -1) return current;
  return pickFrom(pool, current);
}

function preload(url) {
  return new Promise(resolve => {
    if (!url) return resolve();
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
    // 大图（本地 2~3MB 的壁纸）不让它拖慢切换手感
    window.setTimeout(resolve, 450);
  });
}

/** 把背景换成指定 URL（先预加载再淡入，避免闪白） */
export async function applyBackground(url, options) {
  if (!layer || !url || url === currentUrl) return;
  const instant = options && options.instant;
  currentUrl = url;

  if (instant) {
    document.documentElement.style.setProperty('--bg-image', `url("${url}")`);
    document.documentElement.dataset.hasBg = '1';
    refreshBarInk();
    return;
  }

  await preload(url);
  layer.style.opacity = '0';
  window.setTimeout(() => {
    document.documentElement.style.setProperty('--bg-image', `url("${url}")`);
    document.documentElement.dataset.hasBg = '1';
    layer.style.opacity = '';
    refreshBarInk();
  }, 320);
}

export function currentBackground() {
  return currentUrl;
}

/**
 * 每次设置变化后调用：让「屏幕上的背景」与「当前皮肤 + 保存的 bgUrl」保持一致。
 * 能复用就复用；不属于当前皮肤就换一张并写回设置（不会造成循环调用）。
 */
export function syncBackground() {
  const pool = poolFor(state.skin);
  const wanted = state.bgUrl;

  if (wanted && pool.indexOf(wanted) > -1) {
    if (wanted !== currentUrl) applyBackground(wanted);
    return;
  }

  const next = pickFrom(pool, currentUrl);
  if (!next || next === currentUrl) return;
  applyBackground(next);
  if (next !== state.bgUrl) update({ bgUrl: next });
}

// 手机 / 桌面切换时换成对应尺寸的背景图，并记录到设置里
let lastMobile = isMobile();
window.addEventListener('resize', () => {
  // 窗口高度变了，顶栏占的比例跟着变，重新算一次字色（用的是缓存，不重新量图）
  refreshBarInk();
  const nowMobile = isMobile();
  if (nowMobile === lastMobile) return;
  lastMobile = nowMobile;
  const pool = poolFor(state.skin);
  const next = pickFrom(pool, currentUrl);
  if (next && next !== currentUrl) update({ bgUrl: next });
});

// 首屏的背景图是内联脚本直接铺上的（不经过 applyBackground），这里补量一次
if (currentUrl) refreshBarInk();
