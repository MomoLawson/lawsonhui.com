---
title: Hello World：我的第一篇博客
date: 2026-10-07 21:30:00
updated: 2026-10-07 22:10:00
categories:
  - 随笔
tags:
  - 博客
  - Hexo
  - 开始
description: 用 Hexo 搭起自己的小站，写下第一行字。
---

折腾了很久，终于把这块地方搭起来了。它很轻：没有数据库，没有后端，只有一堆静态文件；它也很吵：背景图每次刷新都会换一张。

<!-- more -->

## 为什么是 Hexo

理由很朴素 —— 我想把注意力放在写字上，而不是维护服务器上。

| 需求 | Hexo 方案 |
| --- | --- |
| 写作 | 纯 Markdown，扔进 `source/_posts` 就好 |
| 部署 | 生成静态文件，随便丢给 GitHub Pages |
| 速度 | 没有接口请求，首屏就是 HTML |
| 成本 | 零 |

## 一个最小的构建流程

```bash
npm install          # 装依赖
npm run images       # 增量上传图片到 ImgBB，更新清单
npm run build        # 生成静态站点到 public/
npm run publish      # 一步到位：上传图片 + 构建 + 提交推送
```

图片走图床的好处很直接：仓库里不会塞进几百 MB 的壁纸，clone 下来依然很快。

## 顺手贴一段代码

写博客总要贴代码，这里验证一下高亮效果。

```python
from pathlib import Path

def walk_images(root: Path, exts: set[str]) -> list[Path]:
    """列出目录下所有图片，忽略隐藏文件。"""
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file()
        and path.suffix.lower() in exts
        and not path.name.startswith(".")
    )


if __name__ == "__main__":
    for image in walk_images(Path("img"), {".png", ".jpg", ".webp"}):
        print(image)
```

Java 也来一段：

```java
public record Link(String name, String url) {
    public static Link of(String name, String url) {
        return new Link(name, url == null ? "" : url.trim());
    }
}
```

> 写下来的东西不一定要给别人看，但一定要给未来的自己看。

## 图片走图床的样子

下面这张图并不是塞在仓库里的，而是构建时上传到 ImgBB 之后写进页面的链接 —— 用 `imgx` 标签引用本地路径即可，构建脚本会自动换成图床地址：

{% imgx img/personal_img/bf4c3759123c6a8a93e6a48a8d4fbbf6.JPG 用 imgx 标签引用的图床图片 %}

## 接下来想写什么

- 一些 Python 的小工具，以及踩过的坑
- Minecraft 里自己盖的东西
- Blue Archive 的剧情碎碎念
- 用 Claude Code、Codex 这些 Agent 干活的记录

写博客这件事，最重要的从来不是工具，而是**真的动手写**。
