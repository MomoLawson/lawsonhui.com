#!/usr/bin/env node
/**
 * 增量上传图片到 ImgBB，并生成 tools/image-manifest.json。
 *
 * 用法：
 *   node tools/upload-images.mjs                 # 增量上传（已上传过且内容未变的会跳过）
 *   node tools/upload-images.mjs --dry-run       # 只列出差异，不上传
 *   node tools/upload-images.mjs --limit=5       # 本次最多上传 5 张（适合先试水）
 *   node tools/upload-images.mjs --only=theme_mc # 只处理路径里含 theme_mc 的图片
 *   node tools/upload-images.mjs --force         # 忽略缓存，全部重传
 *   node tools/upload-images.mjs --no-verify     # 跳过上传后的链接可用性校验
 *   node tools/upload-images.mjs --no-fail       # 即使有失败也返回 0（给 npm run dev 用）
 *
 * API Key 读取顺序：环境变量 IMGBB_API_KEY > 根目录 .env
 * 文档：https://api.imgbb.com/
 */
import path from 'node:path';
import process from 'node:process';
import {
  ROOT,
  formatBytes,
  hashFile,
  listImages,
  loadEnv,
  parseArgs,
  readManifest,
  sleep,
  writeManifest
} from './lib/images.mjs';
import { setupProxy } from './lib/proxy.mjs';

const API_ENDPOINT = 'https://api.imgbb.com/1/upload';
const MAX_BYTES = 32 * 1024 * 1024; // ImgBB 单张上限
const CONCURRENCY = 2;

const { flags } = parseArgs();
const dryRun = Boolean(flags['dry-run']);
const force = Boolean(flags.force);
const noFail = Boolean(flags['no-fail']);
const verifyAfter = !flags['no-verify'];
const limit = flags.limit ? Number(flags.limit) : Infinity;
const only = typeof flags.only === 'string' ? flags.only : null;

function log(...args) {
  if (!flags.quiet) console.log(...args);
}

function warn(...args) {
  console.warn(...args);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(noFail ? 0 : 1);
}

function apiKey() {
  const env = loadEnv();
  return process.env.IMGBB_API_KEY || env.IMGBB_API_KEY || '';
}

/* ------------------------------- ImgBB ------------------------------- */

async function uploadOne(relPath, apiKeyValue, attempt = 1) {
  const abs = path.join(ROOT, relPath);
  const { default: fs } = await import('node:fs/promises');
  const buf = await fs.readFile(abs);
  if (buf.length > MAX_BYTES) {
    throw new Error(`文件 ${formatBytes(buf.length)} 超过 ImgBB 单张 ${formatBytes(MAX_BYTES)} 限制`);
  }

  const form = new FormData();
  form.append('image', buf.toString('base64'));
  form.append('name', path.basename(relPath, path.extname(relPath)));

  let response;
  try {
    response = await fetch(`${API_ENDPOINT}?key=${encodeURIComponent(apiKeyValue)}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(180_000)
    });
  } catch (error) {
    if (attempt < 4) {
      const wait = 2_000 * attempt;
      warn(`  ↻ 网络异常（${error.message}），${wait / 1000}s 后重试 ${relPath}`);
      await sleep(wait);
      return uploadOne(relPath, apiKeyValue, attempt + 1);
    }
    throw error;
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok || !json?.success || !json?.data) {
    const message = json?.error?.message || json?.status_txt || text.slice(0, 200) || response.statusText;
    // 限流 / 服务端错误 → 退避重试
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      const wait = 5_000 * attempt;
      warn(`  ↻ ImgBB 返回 ${response.status}（${message}），${wait / 1000}s 后重试`);
      await sleep(wait);
      return uploadOne(relPath, apiKeyValue, attempt + 1);
    }
    throw new Error(`ImgBB 上传失败（HTTP ${response.status}）：${message}`);
  }

  const data = json.data;
  return {
    id: data.id,
    url: data.url || data.display_url,
    display_url: data.display_url || data.url,
    thumb: data.thumb?.url || '',
    medium: data.medium?.url || '',
    viewer: data.url_viewer || '',
    width: data.width || null,
    height: data.height || null,
    mime: data.image?.mime || '',
    uploadedAt: new Date().toISOString()
  };
}

async function checkUrl(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (res.ok) return 'ok';
    // 明确 404/410 才算图片真的没了；其它状态码（403、429…）当作「暂时无法确认」
    if (res.status === 404 || res.status === 410) return 'missing';
    // 有些 CDN 不支持 HEAD，用 GET 再确认一次（只读第一个字节）
    const get = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (get.ok) return 'ok';
    return get.status === 404 || get.status === 410 ? 'missing' : 'unknown';
  } catch {
    // 网络层失败（比如本地网络直连 i.ibb.co 被重置）不能判定图片坏了
    return 'unknown';
  }
}

/* ------------------------------ 主流程 ------------------------------ */

async function main() {
  const key = apiKey();
  const manifest = await readManifest();
  const proxy = await setupProxy({ proxy: flags.proxy });
  if (proxy) log(`▸ Node 走系统代理：${proxy}`);

  let relPaths = await listImages();
  if (only) relPaths = relPaths.filter(p => p.includes(only));

  if (!relPaths.length) {
    fail(`没有找到任何图片（扫描目录：${(await import('./lib/images.mjs')).SCAN_DIRS.join(', ')}）`);
  }

  const plan = [];
  let cachedBytes = 0;
  let pendingBytes = 0;

  for (const relPath of relPaths) {
    const entry = manifest.images[relPath];
    let stat;
    try {
      stat = await hashFile(relPath);
    } catch (error) {
      warn(`  ! 跳过无法读取的文件 ${relPath}：${error.message}`);
      continue;
    }

    if (!force && entry && entry.sha256 === stat.sha256 && entry.url) {
      cachedBytes += stat.bytes;
      continue;
    }

    pendingBytes += stat.bytes;
    plan.push({ relPath, ...stat, stale: Boolean(entry), entry });
  }

  log('');
  log('╭─ ImgBB 增量上传 ─────────────────────────────────────────────');
  log(`│ 图片总数      ${relPaths.length}`);
  log(`│ 已上传（跳过）${String(relPaths.length - plan.length).padStart(3)}  (${formatBytes(cachedBytes)})`);
  log(`│ 本次待上传    ${String(plan.length).padStart(3)}  (${formatBytes(pendingBytes)})`);
  log(`│ 清单文件      tools/image-manifest.json`);
  log('╰──────────────────────────────────────────────────────────────');

  if (!key) {
    fail('缺少 IMGBB_API_KEY：请在仓库根目录的 .env 中配置 IMGBB_API_KEY=你的Key');
  }

  if (!plan.length) {
    log('✓ 所有图片都已上传过，无需更新。');
    if (verifyAfter) await verifyEntries(manifest, relPaths);
    await writeManifest(manifest);
    return;
  }

  if (dryRun) {
    for (const item of plan) log(`  · [待上传] ${item.relPath} (${formatBytes(item.bytes)})`);
    log('\n(--dry-run：没有实际上传)');
    return;
  }

  const queue = plan.slice(0, Number.isFinite(limit) ? limit : plan.length);
  let done = 0;
  let failed = 0;
  let index = 0;

  async function worker(workerId) {
    while (index < queue.length) {
      const current = queue[index];
      index += 1;
      const position = `[${String(index).padStart(3)}/${queue.length}]`;
      try {
        const result = await uploadOne(current.relPath, key);
        manifest.images[current.relPath] = {
          sha256: current.sha256,
          bytes: current.bytes,
          ...result,
          verifiedAt: null
        };
        delete manifest.failed[current.relPath];
        done += 1;
        log(`  ✓ ${position} ${current.relPath} → ${result.url}`);
      } catch (error) {
        failed += 1;
        manifest.failed[current.relPath] = {
          error: error.message,
          sha256: current.sha256,
          at: new Date().toISOString()
        };
        warn(`  ✖ ${position} ${current.relPath}：${error.message}`);
      }
      // 两台并发之间留一点间隔，尽量不触发图床限流
      if (workerId >= 0) await sleep(250);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, (_, i) => worker(i)));

  await writeManifest(manifest);
  log(`\n上传完成：成功 ${done}，失败 ${failed}。清单已写入 tools/image-manifest.json`);

  if (verifyAfter) await verifyEntries(manifest, relPaths);
  await writeManifest(manifest);

  if (failed > 0) {
    warn(`\n有 ${failed} 张图片上传失败，重新执行一次即可（成功过的不会重传）。`);
    if (!noFail) process.exit(1);
  }
}

/** 校验清单里（本次涉及的）链接是否可访问，坏掉的会被清掉以便下次重传 */
async function verifyEntries(manifest, relPaths) {
  const targets = relPaths.filter(p => manifest.images[p]?.url);
  if (!targets.length) return;
  log(`\n校验图床链接可用性（${targets.length} 张）…`);
  let broken = 0;
  let unknown = 0;
  const concurrency = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const relPath = targets[cursor];
      cursor += 1;
      const entry = manifest.images[relPath];
      const state = await checkUrl(entry.url);
      if (state === 'ok') {
        entry.verifiedAt = new Date().toISOString();
      } else if (state === 'missing') {
        broken += 1;
        warn(`  ! 链接已失效（404/410），标记待重传：${relPath} → ${entry.url}`);
        delete manifest.images[relPath];
      } else {
        unknown += 1;
        entry.verifyNote = 'network-unknown';
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  if (broken === 0 && unknown === 0) {
    log('✓ 所有链接均可正常访问。');
  } else if (broken === 0) {
    log(`! ${unknown} 个链接暂时无法确认（网络不可达，例如直连 i.ibb.co 被重置；图片本身没问题）`);
  } else {
    log(`! ${broken} 个链接失效（下次运行会自动重传），${unknown} 个暂时无法确认`);
  }
}

main().catch(error => {
  console.error(`\n✖ 上传流程异常：${error.stack || error.message}\n`);
  process.exit(noFail ? 0 : 1);
});
