/**
 * 让构建脚本走系统代理。
 *
 * 背景：imgbb 的图床 CDN（i.ibb.co）在部分网络下直连会被重置，
 * 但浏览器走系统代理是正常的。Node 的 fetch 默认不读系统代理
 * （Node 22 也没有 NODE_USE_ENV_PROXY），所以这里：
 *   1. 先看环境变量 HTTPS_PROXY / HTTP_PROXY
 *   2. 再看 macOS 的 `scutil --proxy`
 * 找到代理后用 undici 的 ProxyAgent 接管全局 fetch。
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function normalize(value) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

/** 探测可用代理地址，找不到返回空字符串 */
export function detectProxy() {
  const fromEnv = normalize(envValue('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'));
  if (fromEnv) return fromEnv;

  if (process.platform !== 'darwin') return '';

  try {
    const out = execFileSync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 5000 });
    const read = key => {
      const match = out.match(new RegExp(`${key}\\s*:\\s*([^\\n]+)`));
      return match ? match[1].trim() : '';
    };
    const httpsEnabled = read('HTTPSEnable') === '1';
    const httpEnabled = read('HTTPEnable') === '1';
    const host = read('HTTPSProxy') || read('HTTPProxy');
    const port = read('HTTPSPort') || read('HTTPPort');
    if ((httpsEnabled || httpEnabled) && host && port) return `http://${host}:${port}`;
  } catch {
    /* 读不到就算了 */
  }
  return '';
}

/** 如果找到了代理就装上，返回代理地址（没有则返回空字符串） */
export async function setupProxy(options = {}) {
  const explicit = options.proxy ? normalize(options.proxy) : '';
  const proxy = explicit || detectProxy();
  if (!proxy) return '';

  try {
    const undici = await import('undici');
    undici.setGlobalDispatcher(new undici.ProxyAgent(proxy));
    return proxy;
  } catch {
    console.warn(`  ! 检测到系统代理 ${proxy}，但没装 undici，无法让 Node 走代理（npm i -D undici 即可）`);
    return '';
  }
}
