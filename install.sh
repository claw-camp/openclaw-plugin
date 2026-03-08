#!/bin/bash
# 龙虾营地 Agent 插件安装脚本

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 检查 OpenClaw 是否已安装
if ! command -v openclaw &> /dev/null; then
    error "OpenClaw 未安装，请先安装 OpenClaw"
fi

# 创建插件目录
PLUGIN_DIR="$HOME/.openclaw/extensions/claw-camp-agent"
log "创建插件目录: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR/src"

# 下载文件（如果是从远程安装）
if [ "$1" = "--remote" ]; then
    log "从 GitHub 下载插件文件..."
    BASE_URL="https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin"
    
    curl -fsSL "$BASE_URL/openclaw.plugin.json" -o "$PLUGIN_DIR/openclaw.plugin.json" || error "下载失败"
    curl -fsSL "$BASE_URL/package.json" -o "$PLUGIN_DIR/package.json" || error "下载失败"
    curl -fsSL "$BASE_URL/index.ts" -o "$PLUGIN_DIR/index.ts" || error "下载失败"
    curl -fsSL "$BASE_URL/README.md" -o "$PLUGIN_DIR/README.md" || error "下载失败"
    curl -fsSL "$BASE_URL/src/agent.js" -o "$PLUGIN_DIR/src/agent.js" || error "下载失败"
else
    log "从本地复制插件文件..."
    # 如果是从本地项目安装
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    
    cp "$SCRIPT_DIR/openclaw.plugin.json" "$PLUGIN_DIR/" || error "复制失败"
    cp "$SCRIPT_DIR/package.json" "$PLUGIN_DIR/" || error "复制失败"
    cp "$SCRIPT_DIR/index.ts" "$PLUGIN_DIR/" || error "复制失败"
    cp "$SCRIPT_DIR/README.md" "$PLUGIN_DIR/" || error "复制失败"
    cp "$SCRIPT_DIR/src/agent.js" "$PLUGIN_DIR/src/" || error "复制失败"
fi

log "✅ 插件文件已安装"

# 添加到信任列表
log "添加插件到信任列表..."
CURRENT_ALLOW=$(openclaw config get plugins.allow 2>/dev/null || echo "[]")

if echo "$CURRENT_ALLOW" | grep -q "claw-camp-agent"; then
    log "插件已在信任列表中"
else
    # 添加到信任列表
    NEW_ALLOW=$(echo "$CURRENT_ALLOW" | jq '. + ["claw-camp-agent"]' | jq -c .)
    openclaw config set plugins.allow "$NEW_ALLOW" || warn "无法自动添加到信任列表，请手动配置"
    log "✅ 插件已添加到信任列表"
fi

# 安装依赖
log "安装依赖..."
cd "$PLUGIN_DIR"
if [ -f "package.json" ]; then
    npm install --production 2>&1 | grep -E "added|removed|changed|audited" || true
fi

log ""
log "🎉 安装完成！"
log ""
log "使用方法:"
log "  1. 启动 Agent: cd $PLUGIN_DIR && node src/agent.js"
log "  2. 后台运行: nohup node src/agent.js > /tmp/agent.log 2>&1 &"
log "  3. 查看日志: tail -f /tmp/agent.log"
log ""
log "配置文件: $PLUGIN_DIR/openclaw.plugin.json"
log "GitHub: https://github.com/PhosAQy/claw-hub"
