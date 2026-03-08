# Claw Camp Agent - 快速开始

## 🚀 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/quick-install.sh | bash
```

## 📋 前置要求

- OpenClaw v0.4.0+
- Node.js 18+
- 网络连接

## ⚙️ 配置

安装后，编辑 `~/.openclaw/extensions/claw-camp-agent/openclaw.plugin.json`：

```json
{
  "agentId": "my-agent",      // 修改为你的唯一标识
  "agentName": "我的 Agent"   // 修改为你的显示名称
}
```

## 🎯 启动

```bash
# 后台运行
cd ~/.openclaw/extensions/claw-camp-agent
nohup node src/agent.js > /tmp/agent.log 2>&1 &

# 查看日志
tail -f /tmp/agent.log
```

## 📊 监控面板

访问: https://camp.aigc.sx.cn

## 📚 完整文档

- [安装指南](INSTALL_GUIDE.md)
- [使用文档](README.md)
- [GitHub](https://github.com/PhosAQy/claw-hub)

## 🔧 使用 Makefile

```bash
make install        # 安装插件
make start-daemon   # 启动 Agent（后台）
make logs-follow    # 查看日志
make status         # 查看状态
make stop           # 停止 Agent
```

## 🗑️ 卸载

```bash
cd ~/.openclaw/extensions/claw-camp-agent
./uninstall.sh
```

## ❓ 需要帮助？

- GitHub Issues: https://github.com/PhosAQy/claw-hub/issues
- 文档: https://github.com/PhosAQy/claw-hub#readme
