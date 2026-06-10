#!/bin/bash
# Umami 本地开发启动脚本 - 使用 Drizzle with SQLite
# 环境变量由 dotenv-cli 自动从 .env 加载，无需重复 export
#
# 用法:
#   ./dev.sh                 # 默认 3000 端口
#   ./dev.sh --port 3001     # 自定义端口
#
# 注意: 系统可能同时安装有 Python dotenv (/opt/homebrew/bin/dotenv)
#       请始终使用 pnpm dev 或 npm run dev 启动，以确保使用正确的 dotenv-cli

set -e

echo "=== Umami 本地开发启动 ==="

# 启动 Next.js 开发服务器
echo ">>> 启动开发服务器（端口 ${1:-3000}）..."
pnpm dev "$@"
