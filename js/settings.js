// 设置存储：全部保存在浏览器 localStorage，键名由站点在构建时写入
const node = document.getElementById('lawson-data');
export const data = node ? JSON.parse(node.textContent) : { defaults: {}, settingsKey: 'lawson:settings' };
export const defaults = data.defaults || {};
export const SETTINGS_KEY = data.settingsKey;

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch (error) {
    return {};
  }
}

export const state = Object.assign({}, defaults, readStored());

const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  } catch (error) {
    /* 隐私模式下写入会失败，忽略即可 */
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function update(patch, options) {
  Object.assign(state, patch);
  if (!options || options.persist !== false) persist();
  listeners.forEach(listener => listener(state));
}

export function reset() {
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, defaults, { bgUrl: '' });
  persist();
  listeners.forEach(listener => listener(state));
}

export function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolvedMode() {
  if (state.mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return state.mode;
}
