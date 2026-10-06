'use strict';

// 站点级脚本：
//   1. 合并 _config.yml 里的 lawson: 节点 → site.lawson
//   2. 生成图片索引（图床 URL / 本地回退）→ site.imgindex
//   3. 构建收尾：给 css/js 加内容指纹、把未上传图床的本地图片挂进路由
//   4. 注册 {% imgx %} 标签，markdown 里也能直接引用图床图片

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lawsonConfig = require('./lib/lawson-config');
const imageIndex = require('./lib/image-index');

const root = hexo.base_dir;
const merged = lawsonConfig.build(hexo.config.lawson);

// 模板里可以直接用 site.lawson.xxx
hexo.locals.set('lawson', merged);

hexo.extend.filter.register('before_generate', function () {
  const index = imageIndex.buildImageIndex({ root: root, config: merged });
  hexo.locals.set('imgindex', index);

  const stats = index.stats;
  if (stats.total === 0) {
    hexo.log.warn('[lawson] 没有找到任何背景图，请检查 _config.yml > lawson.background 里的目录配置');
  } else if (stats.local > 0) {
    hexo.log.info('[lawson] 图片索引：共 ' + stats.total + ' 张，' + stats.uploaded + ' 张来自图床，' + stats.local + ' 张仍使用本地文件（构建时会挂进路由）');
  } else {
    hexo.log.info('[lawson] 图片索引：共 ' + stats.total + ' 张，全部来自图床');
  }
});

// 注意：Hexo 的 after_generate 触发时文件还没落盘，
// 所以这里统一改「路由」（hexo.route）而不是改 public/ 里的文件。
hexo.extend.filter.register('after_generate', async function () {
  await addLocalImageRoutes();
  await stampAssetVersion();
});

function readRoute(routePath) {
  return new Promise((resolve, reject) => {
    const stream = hexo.route.get(routePath);
    if (!stream) return resolve(null);
    const chunks = [];
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

// 静态资源加内容指纹：Cloudflare 和浏览器会把 css/js 缓存几个小时，
// 文件名不变的话改样式后看到的就是旧文件，这里按内容生成 ?v=xxxxxxxx。
async function stampAssetVersion() {
  const routes = hexo.route.list().filter(item => typeof item === 'string');
  const assetRoutes = routes.filter(item => /^(css|js)\/.+\.(css|js)$/.test(item)).sort();
  if (!assetRoutes.length) return;

  const assets = {};
  const hash = crypto.createHash('sha256');
  for (const routePath of assetRoutes) {
    const content = await readRoute(routePath);
    if (content === null) continue;
    assets[routePath] = content;
    hash.update(routePath);
    hash.update(content);
  }
  const version = hash.digest('hex').slice(0, 10);

  // 1) 页面里的引用（模板里写的是 @@ASSET_VERSION@@ 占位符）
  for (const routePath of routes.filter(item => item.endsWith('.html'))) {
    const html = await readRoute(routePath);
    if (html && html.includes('@@ASSET_VERSION@@')) {
      hexo.route.set(routePath, html.split('@@ASSET_VERSION@@').join(version));
    }
  }

  // 2) ES module 之间的相对 import 也带上同一个版本号
  for (const routePath of Object.keys(assets)) {
    if (!routePath.endsWith('.js')) continue;
    const source = assets[routePath];
    const next = source.replace(/(from\s*|import\s*)(["'])(\.\/[^"']+\.js)\2/g, (match, head, quote, spec) =>
      spec.includes('?') ? match : head + quote + spec + '?v=' + version + quote
    );
    if (next !== source) hexo.route.set(routePath, next);
  }

  hexo.log.info('[lawson] 静态资源版本：' + version + '（' + Object.keys(assets).length + ' 个文件）');
}

// 图片还没传到图床时，把本地文件挂进路由，构建出来一样不丢图
async function addLocalImageRoutes() {
  const index = hexo.locals.get('imgindex');
  if (!index) return;

  const pending = [];
  const collect = item => {
    if (item && item.url && !item.uploaded) pending.push(item.path);
  };
  const backgrounds = index.backgrounds || {};
  for (const skin of Object.keys(backgrounds)) {
    const devices = backgrounds[skin];
    for (const device of Object.keys(devices)) devices[device].forEach(collect);
  }
  collect(index.avatar);

  if (!pending.length) return;

  let added = 0;
  for (const relPath of pending) {
    const from = path.join(root, relPath);
    if (!fs.existsSync(from)) continue;
    hexo.route.set(relPath, () => fs.createReadStream(from));
    added += 1;
  }
  if (added) hexo.log.info('[lawson] 已把 ' + added + ' 张未上传图床的图片挂进路由（本地预览用）');
}

// markdown 里贴图：{% imgx img/bg_img/theme_ba/pc/139649.webp 说明文字 %}
hexo.extend.tag.register('imgx', function (args) {
  const relPath = (args[0] || '').trim();
  const alt = args.slice(1).join(' ').trim();
  if (!relPath) return '';
  const index = hexo.locals.get('imgindex');
  const item = index ? index.resolve(relPath) : null;
  const url = item ? item.url : '/' + relPath;
  const caption = alt ? '<figcaption>' + alt + '</figcaption>' : '';
  return '<figure class="md-figure"><img src="' + url + '" alt="' + alt + '" loading="lazy" decoding="async">' + caption + '</figure>';
});
