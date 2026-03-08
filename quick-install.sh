#!/bin/bash
# Claw Camp Agent - 快速安装脚本
# 使用方法: curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/quick-install.sh | bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# 检查 OpenClaw
if ! command -v openclaw &> /dev/null; then
    error "OpenClaw 未安装\n请先安装 OpenClaw: https://openclaw.ai"
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    error "Node.js 未安装\n请先安装 Node.js: https://nodejs.org"
fi

# 检查版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js 版本过低（需要 18+）\n当前版本: $(node -v)"
fi

log "前置检查通过"

# 创建插件目录
PLUGIN_DIR="$HOME/.openclaw/extensions/claw-camp-agent"
info "创建插件目录: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR/src"

# 下载文件
info "下载插件文件..."
BASE_URL="https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin"

curl -fsSL "$BASE_URL/openclaw.plugin.json" -o "$PLUGIN_DIR/openclaw.plugin.json" || error "下载失败"
curl -fsSL "$BASE_URL/package.json" -o "$PLUGIN_DIR/package.json" || error "下载失败"
curl -fsSL "$BASE_URL/index.ts" -o "$PLUGIN_DIR/index.ts" || error "下载失败"
curl -fsSL "$BASE_URL/README.md" -o "$PLUGIN_DIR/README.md" || error "下载失败"
curl -fsSL "$BASE_URL/src/agent.js" -o "$PLUGIN_DIR/src/agent.js" || error "下载失败"

log "插件文件已下载"

# 添加到信任列表
info "添加插件到信任列表..."
CURRENT_ALLOW=$(openclaw config get plugins.allow 2>/dev/null || echo "[]")

if echo "$CURRENT_ALLOW" | grep -q "claw-camp-agent"; then
    log "插件已在信任列表中"
else
    NEW_ALLOW=$(echo "$CURRENT_ALLOW" | jq '. + ["claw-camp-agent"]' | jq -c .)
    openclaw config set plugins.allow "$NEW_ALLOW" 2>/dev/null || warn "无法自动添加到信任列表"
    log "插件已添加到信任列表"
fi

# 安装依赖
info "安装依赖..."
cd "$PLUGIN_DIR"
npm install --production 2>&1 | grep -E "added|removed|changed|audited" || true

log "依赖安装完成"

# 验证安装
info "验证安装..."
if openclaw plugins list 2>&1 | grep -q "claw-camp-agent"; then
    log "插件已成功加载"
else
    warn "插件未出现在列表中，请重启 OpenClaw"
fi

# 完成
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   🎉 安装成功！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "插件版本: ${BLUE}v1.5.0${NC}"
echo -e "插件目录: ${BLUE}$PLUGIN_DIR${NC}"
echo ""
echo -e "${YELLOW}使用方法:${NC}"
echo ""
echo -e "  ${GREEN}1. 启动 Agent:${NC}"
echo -e "     cd $PLUGIN_DIR"
echo -e "     node src/agent.js"
echo ""
echo -e "  ${GREEN}2. 后台运行:${NC}"
echo -e "     nohup node src/agent.js > /tmp/agent.log 2>&1 &"
echo ""
echo -e "  ${GREEN}3. 查看日志:${NC}"
echo -e "     tail -f /tmp/agent.log"
echo ""
echo -e "  ${GREEN}4. 访问监控面板:${NC}"
echo -e "     open https://camp.aigc.sx.cn"
echo ""
echo -e "${YELLOW}配置文件:${NC}"
echo -e "  $PLUGIN_DIR/openclaw.plugin.json"
echo ""
echo -e "${YELLOW}文档:${NC}"
echo -e "  https://github.com/PhosAQy/claw-hub"
echo ""
