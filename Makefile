# Claw Camp Agent - Makefile

PLUGIN_DIR := $(HOME)/.openclaw/extensions/claw-camp-agent
AGENT_LOG := /tmp/agent.log

.PHONY: install uninstall start stop restart status logs clean

# 安装插件
install:
	@echo "📦 安装 Claw Camp Agent..."
	@./install.sh

# 卸载插件
uninstall:
	@echo "🗑️  卸载 Claw Camp Agent..."
	@./uninstall.sh

# 启动 Agent（前台）
start:
	@echo "🚀 启动 Agent（前台模式）..."
	@cd $(PLUGIN_DIR) && node src/agent.js

# 启动 Agent（后台）
start-daemon:
	@echo "🚀 启动 Agent（后台模式）..."
	@cd $(PLUGIN_DIR) && nohup node src/agent.js > $(AGENT_LOG) 2>&1 &
	@sleep 2
	@pgrep -f "node.*agent.js" > /dev/null && echo "✅ Agent 已启动" || echo "❌ Agent 启动失败"

# 停止 Agent
stop:
	@echo "🛑 停止 Agent..."
	@pkill -f "node.*agent.js" 2>/dev/null || true
	@sleep 1
	@pgrep -f "node.*agent.js" > /dev/null && echo "❌ Agent 仍在运行" || echo "✅ Agent 已停止"

# 重启 Agent
restart: stop start-daemon
	@echo "🔄 Agent 已重启"

# 查看 Agent 状态
status:
	@echo "📊 Agent 状态:"
	@pgrep -f "node.*agent.js" > /dev/null && echo "  ✅ 运行中 (PID: $$(pgrep -f 'node.*agent.js'))" || echo "  ❌ 未运行"

# 查看日志
logs:
	@echo "📜 Agent 日志 (最后 50 行):"
	@tail -50 $(AGENT_LOG)

# 实时查看日志
logs-follow:
	@echo "📜 实时日志:"
	@tail -f $(AGENT_LOG)

# 清理日志
clean:
	@echo "🧹 清理日志..."
	@rm -f $(AGENT_LOG)
	@echo "✅ 日志已清理"

# 检查插件
check:
	@echo "🔍 检查插件状态..."
	@openclaw plugins list 2>&1 | grep -i "claw camp" || echo "❌ 插件未加载"

# 更新插件
update:
	@echo "🔄 更新插件..."
	@cd $(PLUGIN_DIR)
	@curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/src/agent.js -o src/agent.js
	@echo "✅ 插件已更新"

# 帮助
help:
	@echo "Claw Camp Agent - Makefile"
	@echo ""
	@echo "使用方法:"
	@echo "  make install        - 安装插件"
	@echo "  make uninstall      - 卸载插件"
	@echo "  make start          - 启动 Agent（前台）"
	@echo "  make start-daemon   - 启动 Agent（后台）"
	@echo "  make stop           - 停止 Agent"
	@echo "  make restart        - 重启 Agent"
	@echo "  make status         - 查看 Agent 状态"
	@echo "  make logs           - 查看日志（最后 50 行）"
	@echo "  make logs-follow    - 实时查看日志"
	@echo "  make clean          - 清理日志"
	@echo "  make check          - 检查插件状态"
	@echo "  make update         - 更新插件"
	@echo "  make help           - 显示帮助信息"
