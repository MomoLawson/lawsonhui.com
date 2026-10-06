#!/usr/bin/env bash
# ==========================================================================
# 一键构建 + 上传：图片增量上传图床 → 生成静态站点 → 提交并推送源码
#
#   ./publish.sh                 # 上传图片 + 构建 + 提交推送源码
#   ./publish.sh --no-commit     # 只上传图片 + 构建，不动 git
#   ./publish.sh --skip-images   # 跳过图片上传（离线构建）
#   ./publish.sh --pages         # 额外把 public/ 发布到 gh-pages 分支
#   ./publish.sh -m "改了点文案"  # 自定义提交信息
# ==========================================================================
set -euo pipefail

cd "$(dirname "$0")"

MESSAGE=""
SKIP_IMAGES=0
NO_COMMIT=0
DEPLOY_PAGES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-images) SKIP_IMAGES=1 ;;
    --no-commit) NO_COMMIT=1 ;;
    --pages) DEPLOY_PAGES=1 ;;
    -m|--message)
      shift
      MESSAGE="${1:-}"
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数：$1（用 -h 查看用法）" >&2
      exit 1
      ;;
  esac
  shift
done

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

if [ ! -d node_modules ]; then
  step "首次运行：安装依赖"
  npm install --no-audit --no-fund
fi

if [ "$SKIP_IMAGES" -eq 0 ]; then
  step "1/4 增量上传图片到 ImgBB"
  node tools/upload-images.mjs
else
  step "1/4 跳过图片上传（--skip-images）"
fi

step "2/4 生成静态站点"
npx hexo clean >/dev/null
npx hexo generate

if [ "$NO_COMMIT" -eq 0 ]; then
  step "3/4 提交并推送源码"
  if [ -z "$MESSAGE" ]; then
    MESSAGE="chore: build $(date '+%Y-%m-%d %H:%M')"
  fi
  git add -A
  if git diff --cached --quiet; then
    echo "没有需要提交的改动。"
  else
    git commit -m "$MESSAGE"
  fi
  git push -u origin HEAD
else
  step "3/4 跳过 git 提交（--no-commit）"
fi

if [ "$DEPLOY_PAGES" -eq 1 ]; then
  step "4/4 发布 public/ 到 gh-pages 分支"
  node tools/deploy-pages.mjs
else
  step "4/4 完成（如需发布到 GitHub Pages：./publish.sh --pages）"
fi

echo
echo "✓ 构建产物在 public/，可以直接预览：npx hexo server"
