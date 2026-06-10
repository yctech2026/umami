#!/bin/bash
# Umami 本地开发启动脚本 - 使用 Drizzle with SQLite

set -e

echo "=== Umami 本地开发启动 ==="

# 设置环境
export DATABASE_URL="file:./drizzle/dev.db"
export APP_SECRET="umami-local-dev-secret-key-2026"
export DISABLE_TELEMETRY=1

# 启动 Next.js 开发服务器
echo ">>> 启动开发服务器..."
pnpm dev
