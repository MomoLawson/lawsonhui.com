'use strict';

// 站点级脚本：
//   1. 合并 _config.yml 里的 lawson: 节点 → site.lawson
//   2. 生成图片索引（图床 URL / 本地回退）→ site.imgindex
//   3. 构建结束后把「还没上传到图床」的图片复制进 public/，保证永不丢图
//   4. 注册 {% imgx %} 标签，markdown 里也能直接引用图床图片

const fs = require('fs');
const path = require('path');
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
    hexo.log.info('[lawson] 图片索引：共 ' + stats.total + ' 张，' + stats.uploaded + ' 张来自图床，' + stats.local + ' 张仍使用本地文件（构建时会复制进 public/）');
  } else {
    hexo.log.info('[lawson] 图片索引：共 ' + stats.total + ' 张，全部来自图床');
  }
});

// 构建收尾：把本地回退用到的图片复制到 public/，确保任何情况下都不丢图
hexo.extend.filter.register('after_generate', function () {
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

  let copied = 0;
  for (const relPath of pending) {
    const from = path.join(root, relPath);
    const to = path.join(hexo.public_dir, relPath);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      copied += 1;
    } catch (error) {
      // 文件不存在时忽略：清单里通常已经有图床链接兜底
    }
  }
  if (copied) hexo.log.info('[lawson] 已复制 ' + copied + ' 张未上传图床的图片到 public/');
});

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
