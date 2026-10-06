import { data, state, update } from './settings.js';

const layer = document.querySelector('.bg__img');
let currentUrl = state.bgUrl || '';

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
    return;
  }

  await preload(url);
  layer.style.opacity = '0';
  window.setTimeout(() => {
    document.documentElement.style.setProperty('--bg-image', `url("${url}")`);
    document.documentElement.dataset.hasBg = '1';
    layer.style.opacity = '';
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
  const nowMobile = isMobile();
  if (nowMobile === lastMobile) return;
  lastMobile = nowMobile;
  const pool = poolFor(state.skin);
  const next = pickFrom(pool, currentUrl);
  if (next && next !== currentUrl) update({ bgUrl: next });
});
