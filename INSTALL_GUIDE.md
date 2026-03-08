# Claw Camp Agent - 安装指南

## 📦 插件信息

- **插件名称**: Claw Camp Agent
- **插件 ID**: `claw-camp-agent`
- **版本**: v1.5.0
- **描述**: 龙虾营地监控 Agent - 连接到 Hub 上报系统状态、会话信息和 Token 消耗
- **GitHub**: https://github.com/PhosAQy/claw-hub

## 📋 前置要求

- ✅ OpenClaw 已安装（v0.4.0+）
- ✅ Node.js 18+
- ✅ 网络连接（访问 Hub）

## 🚀 安装方法

### 方法一：从 GitHub 安装（推荐）

```bash
# 1. 下载插件
cd ~/.openclaw/extensions
git clone https://github.com/PhosAQy/claw-hub.git claw-camp-agent-temp
cd claw-camp-agent-temp/src/agent-plugin

# 2. 运行安装脚本
./install.sh --remote

# 3. 清理临时文件
cd ..
rm -rf claw-camp-agent-temp
```

### 方法二：从本地安装

```bash
# 1. 下载插件压缩包
# 从 https://github.com/PhosAQy/claw-hub/releases 下载 claw-camp-agent-1.5.0.tar.gz

# 2. 解压到插件目录
mkdir -p ~/.openclaw/extensions/claw-camp-agent
tar -xzf claw-camp-agent-1.5.0.tar.gz -C ~/.openclaw/extensions/claw-camp-agent

# 3. 运行安装脚本
cd ~/.openclaw/extensions/claw-camp-agent
./install.sh
```

### 方法三：手动安装

```bash
# 1. 创建插件目录
mkdir -p ~/.openclaw/extensions/claw-camp-agent/src

# 2. 下载文件（从 GitHub）
cd ~/.openclaw/extensions/claw-camp-agent
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/openclaw.plugin.json -o openclaw.plugin.json
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/package.json -o package.json
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/index.ts -o index.ts
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/README.md -o README.md
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/src/agent.js -o src/agent.js
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/install.sh -o install.sh
curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/uninstall.sh -o uninstall.sh

# 3. 添加执行权限
chmod +x install.sh uninstall.sh

# 4. 添加到信任列表
openclaw config set plugins.allow '["claw-camp-agent"]'

# 5. 安装依赖
npm install --production
```

## ⚙️ 配置

### 1. 基本配置

编辑 `~/.openclaw/extensions/claw-camp-agent/openclaw.plugin.json`：

```json
{
  "hubUrl": "ws://server.aigc.sx.cn:8889",  // Hub WebSocket 地址
  "agentId": "my-agent",                     // Agent 唯一标识（修改这里）
  "agentName": "我的 Agent",                  // Agent 显示名称（修改这里）
  "reportInterval": 5000,                    // 上报间隔（毫秒）
  "updateToken": ""                          // 远程更新令牌（可选）
}
```

### 2. 环境变量配置（可选）

也可以通过环境变量配置：

```bash
export CLAW_HUB_URL="ws://server.aigc.sx.cn:8889"
export CLAW_AGENT_ID="my-agent"
export CLAW_AGENT_NAME="我的 Agent"
export CLAW_UPDATE_TOKEN="your-token"
```

## 🎯 使用方法

### 1. 启动 Agent

```bash
# 前台运行（调试用）
cd ~/.openclaw/extensions/claw-camp-agent
node src/agent.js

# 后台运行（生产环境）
nohup node src/agent.js > /tmp/agent.log 2>&1 &

# 查看日志
tail -f /tmp/agent.log
```

### 2. 停止 Agent

```bash
pkill -f "node.*agent.js"
```

### 3. 重启 Agent

```bash
pkill -f "node.*agent.js"
sleep 2
cd ~/.openclaw/extensions/claw-camp-agent
nohup node src/agent.js > /tmp/agent.log 2>&1 &
```

## ✅ 验证安装

### 1. 检查插件是否加载

```bash
openclaw plugins list | grep -i "claw camp"
```

**预期输出**:
```
│ Claw Camp    │ claw-camp-agent │ loaded   │ global:claw-camp-agent/index.ts  │ 1.5.0 │
```

### 2. 检查 Agent 是否运行

```bash
pgrep -f "node.*agent.js"
```

**预期输出**:
```
12345  # Agent 进程 ID
```

### 3. 查看日志

```bash
tail -20 /tmp/agent.log
```

**预期输出**:
```
🦞 龙虾营地 Agent v1.5.0
   Agent: 我的 Agent (my-agent)
   Hub: ws://server.aigc.sx.cn:8889

[Agent] 连接 Hub: ws://server.aigc.sx.cn:8889
[Agent] 已连接到 Hub
[Agent] 注册成功: my-agent
```

### 4. 访问监控面板

打开浏览器访问：https://camp.aigc.sx.cn

应该能看到你的 Agent 出现在列表中。

## 🔧 提供的工具

插件安装后，提供以下工具（可在 OpenClaw 中使用）：

### 1. `start_claw_camp_agent`
启动 Agent（返回启动命令）

### 2. `check_claw_camp_agent`
查看 Agent 运行状态

### 3. `stop_claw_camp_agent`
停止 Agent

### 4. `check_claw_camp_hub`
查看 Hub 状态

## 🔄 更新插件

```bash
# 1. 停止 Agent
pkill -f "node.*agent.js"

# 2. 更新代码
cd ~/.openclaw/extensions/claw-camp-agent
git pull  # 如果是从 git 安装的

# 或者重新下载最新版本
# curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/src/agent-plugin/src/agent.js -o src/agent.js

# 3. 重启 Agent
nohup node src/agent.js > /tmp/agent.log 2>&1 &
```

## 🗑️ 卸载

### 方法一：使用卸载脚本

```bash
cd ~/.openclaw/extensions/claw-camp-agent
./uninstall.sh
```

### 方法二：手动卸载

```bash
# 1. 停止 Agent
pkill -f "node.*agent.js"

# 2. 从信任列表移除
openclaw config set plugins.allow '[]'

# 3. 删除插件目录
rm -rf ~/.openclaw/extensions/claw-camp-agent
```

## 🐛 故障排查

### 问题 1: 插件未出现在列表中

**解决方案**:
```bash
# 检查信任列表
openclaw config get plugins.allow

# 添加到信任列表
openclaw config set plugins.allow '["claw-camp-agent"]'

# 重启 OpenClaw
```

### 问题 2: Agent 无法连接到 Hub

**解决方案**:
```bash
# 检查 Hub 是否运行
curl -s https://camp.aigc.sx.cn/api/version

# 检查网络连接
ping server.aigc.sx.cn

# 查看日志
tail -f /tmp/agent.log
```

### 问题 3: Agent 启动后立即退出

**解决方案**:
```bash
# 前台运行查看错误
cd ~/.openclaw/extensions/claw-camp-agent
node src/agent.js

# 检查依赖是否安装
npm install
```

## 📊 监控数据

Agent 会每 5 秒上报以下数据：

- **系统状态**: CPU 使用率、内存使用率
- **Gateway 状态**: 运行状态
- **会话列表**: 会话数量、会话详情（最多 50 个）
- **Token 消耗**: 从 .jsonl 文件解析的精确数据（按半小时槽聚合）
- **插件列表**: 已加载的插件名称和版本

## 🌐 架构

```
本地机器 (你的电脑)
  └─ agent.js v1.5.0
       ↓ WebSocket (每 5 秒)
线上服务器 (119.91.123.2)
  └─ hub.js v1.5.0
       ↓
  Dashboard UI (https://camp.aigc.sx.cn)
```

## 📚 相关链接

- **GitHub**: https://github.com/PhosAQy/claw-hub
- **监控面板**: https://camp.aigc.sx.cn
- **问题反馈**: https://github.com/PhosAQy/claw-hub/issues

## 📄 许可证

MIT

## 👤 作者

Phosa

---

**需要帮助？** 在 GitHub Issues 中提问：https://github.com/PhosAQy/claw-hub/issues
