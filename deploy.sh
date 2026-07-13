#!/bin/bash
# Umami Cloudflare Workers 部署脚本
# 用法:
#   ./deploy.sh                 # 完整构建+部署
#   ./deploy.sh --build-only    # 仅构建，不部署
#   ./deploy.sh --push-only     # push 到 git 后自动触发 CI/CD
#
# 环境变量（可写入 .env 或 export）:
#   CLOUDFLARE_API_TOKEN     # Cloudflare API Token（必填）
#
# 优化说明:
#   - WRANGLER_BUILD_PLATFORM=node  让 esbuild 以 node 平台处理模块
#   - wrangler deploy --minify      压缩 Worker bundle
#   - serverExternalPackages        排除构建时依赖（已在 next.config.ts 中配置）

set -e

# ── 颜色输出 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}┌──────────────────────────────┐${NC}"
echo -e "${CYAN}│  Umami → Cloudflare Workers  │${NC}"
echo -e "${CYAN}└──────────────────────────────┘${NC}"
echo ""

# ── 参数解析 ──
BUILD_ONLY=false
PUSH_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=true ;;
    --push-only)  PUSH_ONLY=true ;;
    --help)
      echo "用法: ./deploy.sh [--build-only|--push-only|--help]"
      echo ""
      echo "  (无参数)    完整构建 + 部署到 Cloudflare Workers"
      echo "  --build-only  仅执行 opennextjs-cloudflare build"
      echo "  --push-only   仅 push 到 git 远端 (fork)"
      echo "  --help        显示此帮助"
      exit 0
      ;;
  esac
done

# ── 步骤 1: Git Push ──
echo -e "${YELLOW}>>> 提交代码并 push 到 fork...${NC}"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: auto-deploy $(date '+%Y-%m-%d %H:%M')"
  git push fork master
  echo -e "${GREEN}✅ Push 完成${NC}"
else
  echo -e "${YELLOW}⚠️  无新更改，跳过 commit/push${NC}"
fi

if [ "$PUSH_ONLY" = true ]; then
  echo -e "${GREEN}✅ Push-only 模式完成${NC}"
  exit 0
fi

# ── 步骤 2: 使用 dotenv 加载 .env 变量（如果存在） ──
if [ -f .env ]; then
  echo -e "${YELLOW}>>> 加载 .env 环境变量...${NC}"
  export $(grep -v '^\s*#' .env | grep -v '^\s*$' | xargs)
fi

# 确保 WRANGLER 环境变量
export WRANGLER_BUILD_PLATFORM=node
export WRANGLER_BUILD_CONDITIONS=""

# ── 步骤 3: OpenNext Build ──
echo -e "${YELLOW}>>> 执行 opennextjs-cloudflare build...${NC}"
echo -e "    环境: WRANGLER_BUILD_PLATFORM=node"
npx opennextjs-cloudflare build
echo -e "${GREEN}✅ Build 完成${NC}"

if [ "$BUILD_ONLY" = true ]; then
  echo -e "${GREEN}✅ Build-only 模式完成${NC}"
  exit 0
fi

# ── 步骤 4: Wrangler Deploy（带 minify） ──
echo -e "${YELLOW}>>> 部署到 Cloudflare Workers（--minify）...${NC}"
npx wrangler deploy --minify
echo ""
echo -e "${GREEN}✅ 部署成功！${NC}"

# ── 显示部署信息 ──
echo ""
echo -e "${CYAN}=== 部署信息 ===${NC}"
echo -e "  URL:    ${GREEN}https://umami.agate.workers.dev${NC}"
echo -e "  时间:   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
