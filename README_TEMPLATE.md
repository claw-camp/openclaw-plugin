# Claw Camp Agent

<div align="center">

🦞 **龙虾营地监控 Agent**

[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/PhosAQy/claw-hub)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-plugin-orange.svg)](https://openclaw.ai)

**OpenClaw 插件 - 连接到 Hub 上报系统状态、会话信息和 Token 消耗**

[安装指南](#安装) • [使用方法](#使用) • [配置](#配置) • [文档](#文档)

</div>

---

## ✨ 功能特性

- ✅ **实时监控** - 采集系统资源（CPU、内存）、Gateway 状态
- ✅ **会话追踪** - 上报会话列表和状态
- ✅ **Token 统计** - 精确解析 .jsonl 文件，按半小时槽聚合
- ✅ **插件管理** - 上报已加载的插件列表和版本
- ✅ **远程更新** - 支持通过 Hub 远程更新 Agent
- ✅ **WebSocket 通信** - 实时双向通信，每 5 秒上报一次

## 📦 安装

### 快速安装（推荐）

```bash
# One-line 安装
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/install.sh | bash -s -- --remote
```

### 手动安装

```bash
# 1. 创建插件目录
mkdir -p ~/.openclaw/extensions/claw-camp-agent/src

# 2. 下载文件
cd ~/.openclaw/extensions/claw-camp-agent
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/openclaw.plugin.json -o openclaw.plugin.json
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/package.json -o package.json
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/index.ts -o index.ts
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/src/agent.js -o src/agent.js

# 3. 添加到信任列表
openclaw config set plugins.allow '["claw-camp-agent"]'

# 4. 安装依赖
npm install --production
```

## 🚀 使用

### 启动 Agent

```bash
# 前台运行（调试）
cd ~/.openclaw/extensions/claw-camp-agent
node src/agent.js

# 后台运行（生产）
nohup node src/agent.js > /tmp/agent.log 2>&1 &

# 查看日志
tail -f /tmp/agent.log
```

### 停止 Agent

```bash
pkill -f "node.*agent.js"
```

## ⚙️ 配置

编辑 `~/.openclaw/extensions/claw-camp-agent/openclaw.plugin.json`：

```json
{
  "hubUrl": "ws://server.aigc.sx.cn:8889",
  "agentId": "my-agent",
  "agentName": "我的 Agent",
  "reportInterval": 5000,
  "updateToken": ""
}
```

**配置说明**：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `hubUrl` | string | `ws://server.aigc.sx.cn:8889` | Hub WebSocket 地址 |
| `agentId` | string | `main` | Agent 唯一标识 |
| `agentName` | string | `大龙虾` | Agent 显示名称 |
| `reportInterval` | number | `5000` | 上报间隔（毫秒） |
| `updateToken` | string | `""` | 远程更新令牌（可选） |

## 🎯 提供的工具

插件提供 4 个工具：

| 工具名称 | 功能 |
|---------|------|
| `start_claw_camp_agent` | 启动 Agent |
| `check_claw_camp_agent` | 查看 Agent 状态 |
| `stop_claw_camp_agent` | 停止 Agent |
| `check_claw_camp_hub` | 查看 Hub 状态 |

## ✅ 验证安装

```bash
# 1. 检查插件是否加载
openclaw plugins list | grep -i "claw camp"

# 2. 检查 Agent 是否运行
pgrep -f "node.*agent.js"

# 3. 访问监控面板
open https://camp.aigc.sx.cn
```

## 📊 监控面板

访问 **https://camp.aigc.sx.cn** 查看你的 Agent 状态：

- 📈 **实时数据** - CPU、内存、会话数、Token 消耗
- 📊 **Token 柱状图** - 最近 6 小时的 Token 消耗（半小时粒度）
- 🧩 **插件列表** - 已加载的插件名称和版本
- 🔄 **远程更新** - 点击按钮即可更新 Agent

## 🔄 更新

```bash
# 停止 Agent
pkill -f "node.*agent.js"

# 更新代码
cd ~/.openclaw/extensions/claw-camp-agent
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/src/agent.js -o src/agent.js

# 重启 Agent
nohup node src/agent.js > /tmp/agent.log 2>&1 &
```

## 🗑️ 卸载

```bash
cd ~/.openclaw/extensions/claw-camp-agent
./uninstall.sh
```

## 🐛 故障排查

<details>
<summary>点击展开</summary>

### 插件未出现在列表中

```bash
openclaw config set plugins.allow '["claw-camp-agent"]'
```

### Agent 无法连接到 Hub

```bash
# 检查 Hub 状态
curl -s https://camp.aigc.sx.cn/api/version

# 查看日志
tail -f /tmp/agent.log
```

### Agent 启动后立即退出

```bash
# 前台运行查看错误
cd ~/.openclaw/extensions/claw-camp-agent
node src/agent.js
```

</details>

## 📚 文档

- **安装指南**: [INSTALL_GUIDE.md](INSTALL_GUIDE.md)
- **完整文档**: [README.md](README.md)
- **GitHub**: https://github.com/PhosAQy/claw-hub
- **问题反馈**: https://github.com/PhosAQy/claw-hub/issues

## 🤝 贡献

欢迎贡献代码！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 👤 作者

**Phosa**

- GitHub: [@PhosAQy](https://github.com/PhosAQy)

---

<div align="center">

**[⬆ 返回顶部](#claw-camp-agent)**

Made with ❤️ by Phosa

</div>
