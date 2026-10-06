#!/usr/bin/env node
/**
 * 校验 tools/image-manifest.json 里所有图床链接是否仍然可访问。
 *   node tools/verify-images.mjs           # 只检查
 *   node tools/verify-images.mjs --fix     # 坏掉的条目从清单中移除（下次 build 会自动重传）
 */
import { listImages, parseArgs, readManifest, writeManifest } from './lib/images.mjs';
import { setupProxy } from './lib/proxy.mjs';

const { flags } = parseArgs();
const fix = Boolean(flags.fix);

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (res.ok) return 'ok';
    if (res.status === 404 || res.status === 410) return 'missing';
    const get = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (get.ok) return 'ok';
    return get.status === 404 || get.status === 410 ? 'missing' : 'unknown';
  } catch {
    return 'unknown';
  }
}

const proxy = await setupProxy({ proxy: flags.proxy });
if (proxy) console.log(`▸ Node 走系统代理：${proxy}`);

const manifest = await readManifest();
const relPaths = await listImages();
const paths = relPaths.filter(p => manifest.images[p]?.url);

console.log(`\n检查 ${paths.length} 个图床链接…\n`);

let broken = 0;
let unknown = 0;
let cursor = 0;
async function worker() {
  while (cursor < paths.length) {
    const relPath = paths[cursor];
    cursor += 1;
    const entry = manifest.images[relPath];
    const state = await head(entry.url);
    if (state === 'missing') {
      broken += 1;
      console.log(`✖ 已失效 ${relPath}\n   ${entry.url}`);
      if (fix) delete manifest.images[relPath];
    } else if (state === 'unknown') {
      unknown += 1;
      console.log(`? 无法确认 ${relPath}（网络不可达，图片本身通常没问题）`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

if (fix && broken) await writeManifest(manifest);
if (broken === 0) {
  console.log(unknown ? `\n✓ 没有发现失效链接（${unknown} 个因网络不可达无法确认）。\n` : '\n✓ 全部可用。\n');
} else {
  console.log(`\n共 ${broken} 个链接失效。${fix ? '已从清单移除，重新 build 会重传。' : '加 --fix 可标记重传。'}\n`);
}
process.exit(broken && !fix ? 1 : 0);
