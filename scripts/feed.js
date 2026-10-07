'use strict';

// 订阅页用到的数据：feed 绝对地址、各阅读器的订阅链接、二维码（构建时生成 SVG）
// 目标是不让访客点 RSS 就直接看到一大段 XML。

const lawsonConfig = require('./lib/lawson-config');

// qrcode 是构建期依赖；缺了也不影响站点，只是不显示二维码
let QRCode = null;
try {
  QRCode = require('qrcode');
} catch (error) {
  QRCode = null;
}

hexo.extend.filter.register('before_generate', async function () {
  const L = lawsonConfig.build(hexo.config.lawson);
  const feed = L.feed || {};
  if (feed.enabled === false) return;

  const siteUrl = String(hexo.config.url || '').replace(/\/+$/, '');
  const feedPath = String(feed.path || 'atom.xml').replace(/^\/+/, '');
  const feedUrl = siteUrl ? siteUrl + '/' + feedPath : '/' + feedPath;

  const readers = (feed.readers || [])
    .filter(item => item && item.name && item.url)
    .map(item => ({
      name: item.name,
      url: item.url.replace('{feed}', encodeURIComponent(feedUrl))
    }));

  let qrSvg = '';
  if (feed.qr !== false && QRCode) {
    try {
      qrSvg = await QRCode.toString(feedUrl, {
        type: 'svg',
        margin: 0,
        width: 132,
        errorCorrectionLevel: 'M',
        color: { dark: '#0b0d12ff', light: '#00000000' }
      });
    } catch (error) {
      hexo.log.warn('[lawson] 生成订阅二维码失败：' + error.message);
    }
  } else if (feed.qr !== false && !QRCode) {
    hexo.log.warn('[lawson] 没装 qrcode，订阅页将不显示二维码（npm i 即可补上）');
  }

  hexo.locals.set('feed', {
    url: feedUrl,
    path: feedPath,
    page: feed.page || 'subscribe/',
    title: feed.title,
    description: feed.description,
    hint: feed.hint,
    readers: readers,
    qrSvg: qrSvg
  });
});
