---
title: 让静态博客不丢图：Hexo + ImgBB 增量上传方案
date: 2026-10-06 20:15:00
categories:
  - 折腾
tags:
  - Hexo
  - ImgBB
  - 自动化
  - Node.js
description: 仓库里不放图片，构建时把图片增量丢给图床，再把链接写回页面。
---

GitHub 对「仓库里全是图片」的项目不太友好，体积大、clone 慢，还容易被当成图床。这个站点把所有图片都放在本地 `img/` 目录（已被 `.gitignore` 排除），构建时再增量上传到 ImgBB。

<!-- more -->

## 增量上传是怎么做的

核心是一个清单文件 `tools/image-manifest.json`，它以「相对路径」为键，记录图片的内容哈希和上传后的链接：

```json
{
  "img/bg_img/theme_ba/pc/139649.webp": {
    "sha256": "0f3c…",
    "url": "https://i.ibb.co/xxxx/139649.webp",
    "thumb": "https://i.ibb.co/xxxx/139649.webp",
    "uploadedAt": "2026-10-06T12:00:00.000Z"
  }
}
```

于是上传逻辑就变成三句话：

1. 扫描 `img/` 下的所有图片，算出 sha256；
2. 清单里有相同哈希 → 直接跳过；文件变了或没记录 → 上传；
3. 上传完校验一次链接是否可访问，坏掉的条目从清单里删掉，下次自动重传。

## 页面是怎么拿到链接的

构建阶段，Hexo 脚本读取清单，把每个皮肤、每种设备的背景图整理成一个数组塞进页面：

```js
// scripts/lib/image-index.js（节选）
const entry = manifest.images[relPath];
if (entry && entry.url) {
  return { path: relPath, url: entry.url, uploaded: true };
}
// 没传过也不怕：退化成本地路径，构建收尾会把文件复制进 public/
return { path: relPath, url: encodeLocalPath(relPath), uploaded: false };
```

这样即使某次上传失败、或者你刚 clone 完还没有图片，站点也不会出现空白背景或坏图。

## 上传失败怎么办

脚本带了三层保险：

- 网络错误与 429/5xx 会指数退避重试；
- 单张失败不影响其它图片，重新执行一次即可续传；
- `npm run verify` 可以单独体检所有链接，`--fix` 会把坏链接标记为待重传。

> 静态站点最大的好处是：构建产物就是最终产物。只要构建时确认链接可用，上线之后就不会有「图片加载失败」这种意外。

## 顺手记一下命令

```bash
node tools/upload-images.mjs --dry-run    # 只看这次会上传哪些
node tools/upload-images.mjs --limit=5    # 先试传 5 张
node tools/upload-images.mjs --force      # 忽略缓存全部重传
node tools/verify-images.mjs --fix        # 体检 + 标记坏链接
```
