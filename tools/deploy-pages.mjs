#!/usr/bin/env node
/**
 * 把 public/ 发布到 gh-pages 分支（GitHub Pages）。
 *   node tools/deploy-pages.mjs            # 打包并 force push 到 gh-pages
 *   node tools/deploy-pages.mjs --enable   # 顺手通过 gh 打开仓库的 Pages（source: gh-pages）
 *
 * public/ 已被 .gitignore 排除，这里用临时目录里的独立 git 仓库推送，
 * 不会影响主仓库的提交历史。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { ROOT, parseArgs } from './lib/images.mjs';

const { flags } = parseArgs();
const publicDir = path.join(ROOT, 'public');

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    cwd: options.cwd || ROOT
  });
}

if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.error('✖ 找不到 public/index.html，请先执行 `npx hexo generate`。');
  process.exit(1);
}

const remote = git(['remote', 'get-url', 'origin']).trim();
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim() || 'main';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lawson-gh-pages-'));
console.log(`▸ 准备发布目录：${tmp}`);

fs.cpSync(publicDir, tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, '.nojekyll'), '');

git(['init', '-q', '-b', 'gh-pages'], { cwd: tmp });
git(['add', '-A'], { cwd: tmp });
git(
  [
    '-c', 'user.name=Lawson_Hui',
    '-c', 'user.email=momocha2011@outlook.com',
    'commit', '-q', '-m', `deploy: ${new Date().toISOString()}`
  ],
  { cwd: tmp }
);
git(['remote', 'add', 'origin', remote], { cwd: tmp });

console.log('▸ 推送到 gh-pages …');
git(['push', '-f', 'origin', 'gh-pages'], { cwd: tmp, stdio: 'inherit' });

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓ 已发布到 ${remote.replace(/\.git$/, '')} 的 gh-pages 分支（源码分支：${branch}）`);

if (flags.enable) {
  const repo = remote.replace(/\.git$/, '').replace(/^.*github\.com[:/]/, '');
  console.log('▸ 尝试打开仓库的 GitHub Pages（source: gh-pages）…');
  try {
    execFileSync(
      'gh',
      ['api', '-X', 'POST', `repos/${repo}/pages`, '-f', 'source[branch]=gh-pages', '-f', 'source[path]=/'],
      { stdio: 'inherit', cwd: ROOT }
    );
  } catch {
    console.log('  （可能已经开启过了，可到仓库 Settings → Pages 手动确认）');
  }
}
