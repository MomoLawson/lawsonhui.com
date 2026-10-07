#!/usr/bin/env node
/**
 * 把 GNU Unifont 按当前 splash 文案裁成极小的 woff2 子集。
 *
 * 为什么需要它：Unifont 完整字体有 5MB 左右，而首屏那句「随机背景！」只用到几个字。
 * 这里用 harfbuzz 把需要的字形抽出来，产出 2~3KB 的 woff2，仓库里只提交这一份小文件。
 *
 *   node tools/build-splash-font.mjs            # 文案变化时才重新生成
 *   node tools/build-splash-font.mjs --force    # 强制重新生成
 *   node tools/build-splash-font.mjs --fetch    # 顺便把源字体下载到本地缓存
 *
 * 源字体（约 5MB）缓存在 tools/fonts/（已 gitignore），不会进仓库。
 * 拿不到源字体时会保留现有子集并给出提示，站点照常构建。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { ROOT, parseArgs } from './lib/images.mjs';
import { setupProxy } from './lib/proxy.mjs';

const SOURCE_URL = 'https://unifoundry.com/pub/unifont/unifont-16.0.02/font-builds/unifont-16.0.02.otf';
const SOURCE_FILE = path.join(ROOT, 'tools', 'fonts', 'unifont.otf');
const OUTPUT_DIR = path.join(ROOT, 'themes', 'lawson', 'source', 'fonts');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'unifont-splash.woff2');
const META_FILE = path.join(OUTPUT_DIR, 'unifont-splash.json');

// 除文案本身外，一起塞进去的常用字符：以后改短文案不至于缺字
const EXTRA_CHARS =
  ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  '.,:;!?()[]{}<>/\\|-_+=*&%#@$\'"`~^' +
  '，。、：；！？（）【】《》〈〉「」『』“”‘’…—·～×÷°±《》№';

const { flags } = parseArgs();
const force = Boolean(flags.force);

function log(...args) {
  console.log(...args);
}

/** 只把 _config.yml 里 lawson.splash 那几行读出来，避免为此引入 YAML 依赖 */
function readSplashConfig() {
  const file = path.join(ROOT, '_config.yml');
  let text = '';
  let font = 'unifont';
  try {
    const yaml = fs.readFileSync(file, 'utf8');
    const splashIndex = yaml.indexOf('\n  splash:');
    const block = splashIndex === -1 ? '' : yaml.slice(splashIndex, yaml.indexOf('\n  feed:', splashIndex));
    const textMatch = block.match(/^\s{4}text:\s*(.+)$/m);
    const fontMatch = block.match(/^\s{4}font:\s*(.+)$/m);
    if (textMatch) text = textMatch[1].trim().replace(/^["']|["']$/g, '');
    if (fontMatch) font = fontMatch[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    /* 读不到就用默认值 */
  }
  return { text, font };
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function needsRebuild(text, meta) {
  if (force) return true;
  if (!fs.existsSync(OUTPUT_FILE) || !meta) return true;
  if (meta.text !== text) return true;
  const covered = new Set(meta.chars || []);
  return Array.from(text).some(char => !covered.has(char));
}

async function ensureSourceFont(proxy) {
  if (fs.existsSync(SOURCE_FILE)) return true;
  log('▸ 下载 Unifont 源字体（约 5MB，缓存在 tools/fonts/，不会提交）…');
  await fsp.mkdir(path.dirname(SOURCE_FILE), { recursive: true });
  const response = await fetch(SOURCE_URL, { redirect: 'follow', signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(SOURCE_FILE, buffer);
  log(`  已保存 ${(buffer.length / 1048576).toFixed(1)}MB${proxy ? '（经代理）' : ''}`);
  return true;
}

async function main() {
  const { text } = readSplashConfig();
  const meta = readMeta();

  if (!text) {
    log('▸ splash 文案为空，跳过像素字体生成');
    return;
  }
  if (!needsRebuild(text, meta)) {
    log(`▸ Unifont 子集已覆盖「${text}」，跳过（要强制重建加 --force）`);
    return;
  }

  const proxy = await setupProxy({ proxy: flags.proxy });
  try {
    await ensureSourceFont(proxy);
  } catch (error) {
    const fallback = fs.existsSync(OUTPUT_FILE)
      ? '继续使用现有的字体子集，新文案里如果有缺字会回退到普通字体'
      : 'splash 会回退到普通字体';
    console.warn(`  ! 拿不到 Unifont 源字体（${error.message}），${fallback}`);
    return;
  }

  const { default: subsetFont } = await import('subset-font');
  const source = await fsp.readFile(SOURCE_FILE);
  const chars = Array.from(new Set((text + EXTRA_CHARS).split(''))).join('');
  const output = await subsetFont(source, chars, { targetFormat: 'woff2' });

  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  await fsp.writeFile(OUTPUT_FILE, output);
  await fsp.writeFile(
    META_FILE,
    `${JSON.stringify(
      {
        text,
        chars: Array.from(new Set(chars.split(''))),
        source: SOURCE_URL,
        license: 'GNU Unifont — GPLv2+ with font embedding exception / OFL-1.1（双许可）',
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  log(`✓ 已生成 Unifont 子集：${(output.length / 1024).toFixed(1)}KB（覆盖「${text}」共 ${chars.length} 个字形）`);
}

main().catch(error => {
  console.warn(`  ! 生成 Unifont 子集失败：${error.message}（跳过，不影响构建）`);
  process.exit(0);
});
