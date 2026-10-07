import { data, state } from './settings.js?v=3cbb48d67c';

let instance = null;
let loading = null;
let warned = false;

async function loadLibrary() {
  const sources = [data.clickFx.primary, ...(data.clickFx.fallbacks || [])].filter(Boolean);
  let lastError = null;
  for (const url of sources) {
    try {
      return await import(/* @vite-ignore */ url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('ba-click-fx 加载失败');
}

async function ensureInstance() {
  if (instance) return instance;
  if (loading) return loading;

  loading = (async () => {
    const mod = await loadLibrary();
    const BAClickFX = mod.BAClickFX || mod.default;
    if (!BAClickFX) throw new Error('ba-click-fx 导出结构不符合预期');
    instance = new BAClickFX({
      outputCompositing: 'browser-overlay',
      hostCompositing: 'screen',
      hostCompositingSurface: 'dom-backdrop'
    });
    instance.updateConfig({ trailAlways: Boolean(state.clickFxTrail) });
    return instance;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

function teardown() {
  if (instance) {
    try {
      instance.destroy();
    } catch (error) {
      /* 忽略卸载异常 */
    }
    instance = null;
  }
}

/** 只有 BA 皮肤 + 开关打开 + 未开启「减弱动效」时才加载 */
export async function syncClickFx() {
  const enabled = state.skin === 'ba' && state.clickFx !== false && !state.reduceMotion;
  if (!enabled) {
    teardown();
    return;
  }
  try {
    await ensureInstance();
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn('[lawson] 点击特效加载失败（可能是网络或 CDN 被拦截）：', error.message);
    }
  }
}
