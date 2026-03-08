#!/bin/bash
# 龙虾营地 Agent 插件卸载脚本

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }

PLUGIN_DIR="$HOME/.openclaw/extensions/claw-camp-agent"

# 停止 Agent
log "停止 Agent..."
pkill -f "node.*agent.js" 2>/dev/null || true

# 从信任列表移除
log "从信任列表移除..."
CURRENT_ALLOW=$(openclaw config get plugins.allow 2>/dev/null || echo "[]")
NEW_ALLOW=$(echo "$CURRENT_ALLOW" | jq 'del(.[] | select(. == "claw-camp-agent"))' | jq -c .)
openclaw config set plugins.allow "$NEW_ALLOW" 2>/dev/null || true

# 删除插件目录
log "删除插件目录..."
rm -rf "$PLUGIN_DIR"

log "✅ 卸载完成"
