# lawsonhui.com · Lawson_Hui 的个人博客

用 [Hexo](https://hexo.io/) 搭建的纯静态个人博客，自带一套双皮肤主题 **lawson**：

- **BA** —— 蔚蓝档案风格：浅色玻璃质感、光环光效、[ba-click-fx](https://github.com/CialloKing/ba-click-fx) 鼠标点击特效（可在设置里关闭）
- **MC** —— Minecraft 官网风格：像素字体、草地方块、立体按钮、泥土配色

两套皮肤在顶栏一键切换，背景图每次刷新随机换一张（BA / MC 各自一套壁纸）。
没有后端、没有数据库，构建产物就是最终产物；图片在构建时增量上传到 ImgBB 图床，仓库里不存图。

---

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 上传图片（增量）+ 本地预览 http://localhost:4000
npm run build        # 上传图片 + 生成静态站点到 public/
./publish.sh         # 一键：上传图片 → 构建 → 提交并推送源码
```

想直接发布到 GitHub Pages：

```bash
./publish.sh --pages
```

### 一键脚本 publish.sh

| 参数 | 说明 |
| --- | --- |
| （无） | 增量上传图片 → `hexo generate` → `git commit` + `git push` |
| `--no-commit` | 只上传 + 构建，不动 git |
| `--skip-images` | 跳过图片上传（离线构建） |
| `--pages` | 额外把 `public/` 发布到 `gh-pages` 分支 |
| `-m "说明"` | 自定义提交信息 |

---

## 目录结构

```
.
├── _config.yml                 # 站点 + 博客内容配置（改这里就够了）
├── publish.sh                  # 一键构建 / 上传 / 推送
├── img/                        # 本地图片（已 gitignore，不会上传 GitHub）
│   ├── bg_img/theme_ba/{pc,mobile}
│   ├── bg_img/theme_mc/{pc,mobile}
│   └── personal_img/
├── scripts/                    # Hexo 插件脚本
│   ├── lawson.js               # 合并配置、生成图片索引、imgx 标签
│   ├── search.js               # 生成静态搜索索引 search.json
│   └── pages.js                # 生成 404.html
├── source/
│   ├── _posts/                 # 文章（Markdown）
│   ├── about/                  # 关于页
│   ├── settings/               # 设置页
│   └── CNAME                   # GitHub Pages 自定义域名
├── themes/lawson/              # 主题（双皮肤共用一套组件）
│   ├── layout/                 # EJS 模板
│   └── source/{css,js,img}     # 样式、脚本、图标
└── tools/
    ├── upload-images.mjs       # 增量上传到 ImgBB
    ├── verify-images.mjs       # 体检图床链接
    ├── deploy-pages.mjs        # 发布 public/ 到 gh-pages
    ├── image-manifest.json     # 上传清单（需要提交）
    └── lib/                    # 图片扫描 / 代理探测
```

---

## 图片：为什么仓库里没有图，站点却能显示

图片放在本地 `img/`（被 `.gitignore` 排除），构建时由 `tools/upload-images.mjs` 增量上传到 ImgBB：

1. 扫描 `img/` 与 `source/images/` 下的所有图片，计算 sha256；
2. 清单 `tools/image-manifest.json` 里已有相同哈希 → **跳过**，不重复上传；
3. 新图片（或内容变了的图片）→ 上传到 ImgBB，把链接写回清单；
4. 上传后再校验一次链接可用性，确认没问题才写进页面。

Hexo 构建时读取清单，把图床链接注入页面；`{% imgx %}` 标签还能让文章直接用本地路径引用图床图片：

```markdown
{% imgx img/personal_img/avatar.JPG 图片说明 %}
```

**不会丢图的三重保险**

- 图片还没上传时，页面自动退化为本地路径，构建收尾会把文件复制进 `public/`，站点依然完整；
- 只有明确返回 404/410 的链接才会被标记重传，网络不可达不会被误判成坏图；
- clone 下来的仓库即使没有 `img/`，也能用清单里的链接正常构建（Build 时不会上传任何东西）。

### 关于网络代理

`i.ibb.co`（ImgBB 的图片 CDN）在部分网络下直连会被重置，但浏览器走系统代理通常是正常的。
上传 / 校验脚本会自动探测代理：

1. 环境变量 `HTTPS_PROXY` / `HTTP_PROXY`；
2. macOS 的 `scutil --proxy`（也就是「系统设置 → 网络 → 代理」）。

也可以用 `--proxy=http://127.0.0.1:7897` 手动指定。没装 `undici` 时会提示你 `npm i -D undici`。

### 常用命令

```bash
npm run images                      # 增量上传
npm run images:dry                  # 只列出这次会上传哪些，不传
node tools/upload-images.mjs --limit=5     # 先试传 5 张
node tools/upload-images.mjs --only=theme_mc   # 只处理某个目录
node tools/upload-images.mjs --force           # 忽略缓存全部重传
npm run verify                      # 体检所有图床链接
node tools/verify-images.mjs --fix  # 把失效链接标记为待重传
```

---

## 配置

### 站点与内容：`_config.yml` 里的 `lawson:` 节点

| 配置项 | 作用 |
| --- | --- |
| `brand` | 顶栏标题（默认 `Lawson_Hui的博客`） |
| `hero.title` / `hero.subtitle` | 首屏大标题 |
| `hero.typewriter.*` | Subhero 打字机的开关、速度、句子列表 |
| `avatar` | 头像（相对仓库根目录的路径） |
| `profile.*` | 姓名、邮箱、游戏 / 编程语言 / Agent 分组 |
| `links[]` | 社交图标（bilibili、YouTube、抖音、TikTok、X、GitHub、QQ、Telegram、Discord… 留空 `url` 就不显示） |
| `nav[]` | 顶栏导航 |
| `theme.default` / `theme.skins[]` | 两套皮肤的名称、简称、标语 |
| `theme.click_fx` | BA 皮肤点击特效的默认开关 |
| `background.*` | 随机背景开关、压暗、模糊、两套皮肤 pc/mobile 的图片目录 |
| `posts.*` | 首页文章区标题、摘要长度 |
| `settings.*` | 设置面板文案 |
| `footer.*` | 页脚（起始年份、备案号、自定义文案） |

### 皮肤细节：`themes/lawson/_config.yml`

字体、圆角、动效曲线、顶栏分离阈值、搜索快捷键、ba-click-fx 的 CDN 地址等。

### 设置页（全部存在浏览器 localStorage，键名 `lawson:settings:v1`）

主题皮肤、深浅模式（浅色 / 深色 / 跟随系统）、界面字号、随机背景、背景压暗、背景模糊、
鼠标点击特效、指针常驻拖尾、首屏打字机、打字速度、减弱动效，以及「恢复默认」。
顶栏的设置图标打开侧边面板，`/settings/` 是完整设置页，两边同步。

---

## 写文章

```bash
npx hexo new "文章标题"      # 生成 source/_posts/2026-10-07-文章标题.md
npm run build                # 或 ./publish.sh
```

文章是标准 Markdown，支持代码高亮、表格、引用、`<!-- more -->` 摘要等。

---

## 技术栈

| 部分 | 选择 |
| --- | --- |
| 静态站点 | Hexo 8 + EJS 模板 |
| 样式 | 手写 CSS（设计变量 + 双皮肤覆盖），无框架、无构建 |
| 交互 | 原生 ES Module（皮肤切换、打字机、搜索、设置、背景随机） |
| 搜索 | 构建时生成 `search.json`，前端模糊匹配，无后端 |
| 点击特效 | [ba-click-fx](https://github.com/CialloKing/ba-click-fx)（动态 import，仅 BA 皮肤且开启时加载） |
| 图床 | [ImgBB](https://api.imgbb.com/)（增量上传脚本） |
| 部署 | GitHub Pages（`gh-pages` 分支） |

### 设计语言

整体走 Apple 那套：大留白、毛玻璃材质、克制的圆角与阴影、只在 transform / opacity 上做动效、
首屏滚动渐入、`prefers-reduced-motion` 与「减弱动效」开关都做了降级。
顶栏在页面顶部与背景完全融合（没有分割线），向下滚动后才浮起成毛玻璃并出现细分隔线。

---

## 许可

代码随意取用。文章与图片版权归作者所有，壁纸素材来自各自的原作者。
