import { data, state, subscribe, update, reset, resolvedMode } from './settings.js';
import { pickRandom, resolveUrlForSkin, currentBackground, syncBackground } from './background.js';
import { createTypewriter } from './typewriter.js';
import { syncClickFx } from './clickfx.js';
import { initSearch, openSearch, closeSearch, isSearchOpen } from './search.js';
import { initMotion } from './motion.js';

const root = document.documentElement;
const topbar = document.getElementById('topbar');
const panel = document.querySelector('[data-panel="settings"]');
const menuSheet = document.querySelector('[data-sheet="menu"]');
const typewriterNode = document.querySelector('[data-typewriter]');
const modeIconSelector = '[data-mode-icon] use';
const MODE_ICONS = { light: '#icon-sun', dark: '#icon-moon', system: '#icon-monitor' };
const SKIN_IDS = (data.skins || []).map(skin => skin.id);

const typewriter = createTypewriter(typewriterNode, {
  phrases: (data.typewriter && data.typewriter.phrases) || [],
  speed: (data.typewriter && data.typewriter.speed) || 95,
  pause: (data.typewriter && data.typewriter.pause) || 1800
});

/* ----------------------------- 状态 → DOM ----------------------------- */

function syncControls(s) {
  document.querySelectorAll('[data-control]').forEach(node => {
    const key = node.dataset.setting;
    if (!key) return;
    const value = s[key];
    const kind = node.dataset.control;
    if (kind === 'toggle') {
      node.checked = Boolean(value);
    } else if (kind === 'range') {
      if (document.activeElement !== node) node.value = String(value);
    } else if (kind === 'radio') {
      const isActive = String(value) === node.dataset.value;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-checked', String(isActive));
      node.setAttribute('aria-pressed', String(isActive));
    }
  });

  document.querySelectorAll('[data-output]').forEach(output => {
    const key = output.dataset.output;
    const source = document.querySelector(`[data-setting="${key}"]`);
    const unit = (source && source.dataset.unit) || '';
    output.textContent = `${s[key] ?? ''}${unit}`;
  });

  // 关闭主开关时，把从属项变灰
  document.querySelectorAll('.field--sub').forEach(field => {
    const master = document.querySelector('[data-setting="clickFx"]');
    field.style.opacity = master && !master.checked ? '0.45' : '';
  });
}

function syncSkinControls(s) {
  const index = Math.max(0, SKIN_IDS.indexOf(s.skin));
  document.querySelectorAll('.segmented').forEach(segmented => {
    segmented.dataset.index = String(index);
    segmented.querySelectorAll('[data-skin-option]').forEach(button => {
      const active = button.dataset.skinOption === s.skin;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  });
  document.querySelectorAll(modeIconSelector).forEach(use => {
    use.setAttribute('href', MODE_ICONS[s.mode] || MODE_ICONS.system);
  });
}

function applyState(s) {
  root.dataset.skin = s.skin;
  root.dataset.mode = resolvedMode();
  root.dataset.modePref = s.mode;
  root.dataset.motion = s.reduceMotion ? 'reduced' : 'full';
  root.style.setProperty('--bg-dim', String((Number(s.bgDim) || 0) / 100));
  root.style.setProperty('--bg-blur', `${Number(s.bgBlur) || 0}px`);
  root.style.setProperty('--font-scale', String((Number(s.fontScale) || 100) / 100));

  syncSkinControls(s);
  syncControls(s);
  syncBackground();
  syncClickFx();

  if (s.typewriter === false) typewriter.stop();
  else typewriter.start();
  typewriter.setSpeed(Number(s.typeSpeed) || 95);
}

/* ------------------------------ 交互动作 ------------------------------ */

function setSkin(skin) {
  if (!skin || skin === state.skin) return;
  // 背景永远跟着皮肤走：当前这张不属于新皮肤时换一张新的
  const url = resolveUrlForSkin(skin, currentBackground());
  update({ skin, bgUrl: url || state.bgUrl });
}

function newBackground() {
  const url = pickRandom(state.skin, currentBackground());
  if (url) update({ bgUrl: url });
}

function lockScroll(locked) {
  document.body.style.overflow = locked ? 'hidden' : '';
}

function openPanel() {
  if (!panel) return;
  panel.hidden = false;
  lockScroll(true);
  const close = panel.querySelector('[data-action="close-panel"]');
  if (close) close.focus();
}

function closePanel() {
  if (!panel) return;
  panel.hidden = true;
  lockScroll(false);
}

function openMenu() {
  if (!menuSheet) return;
  menuSheet.hidden = false;
  lockScroll(true);
}

function closeMenu() {
  if (!menuSheet) return;
  menuSheet.hidden = true;
  lockScroll(false);
}

function closePopovers() {
  document.querySelectorAll('.popover').forEach(popover => {
    popover.hidden = true;
  });
  document.querySelectorAll('[data-action="mode-menu"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
}

function toggleModeMenu(button) {
  const anchor = button.closest('.anchor');
  const popover = anchor && anchor.querySelector('.popover');
  if (!popover) return;
  const willOpen = popover.hidden;
  closePopovers();
  popover.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function scrollTop() {
  const reduce = root.dataset.motion === 'reduced';
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

document.addEventListener('click', event => {
  const actionNode = event.target.closest('[data-action]');
  if (actionNode) {
    const action = actionNode.dataset.action;
    if (action === 'search') {
      openSearch();
    } else if (action === 'close-search') {
      closeSearch();
    } else if (action === 'settings') {
      openPanel();
    } else if (action === 'close-panel') {
      closePanel();
    } else if (action === 'mobile-menu') {
      openMenu();
    } else if (action === 'close-sheet') {
      closeMenu();
    } else if (action === 'mode-menu') {
      toggleModeMenu(actionNode);
      return;
    } else if (action === 'to-top') {
      scrollTop();
    } else if (action === 'new-bg') {
      newBackground();
    } else if (action === 'reset-settings') {
      reset();
      newBackground();
    }
    if (action !== 'mode-menu') closePopovers();
    return;
  }

  const skinOption = event.target.closest('[data-skin-option]');
  if (skinOption) {
    setSkin(skinOption.dataset.skinOption);
    return;
  }

  const control = event.target.closest('[data-control="radio"]');
  if (control && control.dataset.setting) {
    const key = control.dataset.setting;
    const value = control.dataset.value;
    if (key === 'skin') setSkin(value);
    else update({ [key]: value });
    closePopovers();
    return;
  }

  if (!event.target.closest('.popover')) closePopovers();
});

document.addEventListener('change', event => {
  const node = event.target.closest('[data-control]');
  if (!node) return;
  const key = node.dataset.setting;
  if (!key) return;
  if (node.dataset.control === 'toggle') update({ [key]: node.checked });
});

document.addEventListener('input', event => {
  const node = event.target.closest('[data-control="range"]');
  if (!node) return;
  update({ [node.dataset.setting]: Number(node.value) });
});

document.addEventListener('keydown', event => {
  const key = (event.key || '').toLowerCase();
  const typing = /input|textarea|select/i.test((event.target.tagName || '')) || event.target.isContentEditable;

  if (key === 'escape') {
    if (isSearchOpen()) closeSearch();
    if (panel && !panel.hidden) closePanel();
    if (menuSheet && !menuSheet.hidden) closeMenu();
    closePopovers();
    return;
  }

  const hotkey = (data.search && data.search.hotkey) || 'k';
  if ((event.metaKey || event.ctrlKey) && key === hotkey) {
    event.preventDefault();
    openSearch();
    return;
  }
  if (key === '/' && !typing) {
    event.preventDefault();
    openSearch();
  }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.mode === 'system') applyState(state);
});

/* -------------------------------- 启动 -------------------------------- */

initSearch();
initMotion();
subscribe(applyState);
syncClickFx();
