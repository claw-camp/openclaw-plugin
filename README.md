# Claw Camp Agent - 龙虾营地监控 Agent

## 简介

Claw Camp Agent 是一个 OpenClaw 插件，用于监控本地系统状态并上报到龙虾营地 Hub。

## 下载

- **📱 手机 App**: [camp-flutter-latest.apk](https://camp.aigc.sx.cn/camp-flutter-latest.apk)（Android）
- **🌐 网页版**: https://camp.aigc.sx.cn

## 功能

- ✅ 采集 Gateway 状态
- ✅ 采集会话列表
- ✅ 采集系统资源（CPU、内存）
- ✅ 解析 session .jsonl 获取精确 Token 使用（按半小时槽聚合）
- ✅ 定时上报到 Hub（每 5 秒）
- ✅ 支持远程更新

## 安装

插件已安装在 `~/.openclaw/extensions/claw-camp-agent/`

## 配置

在 `openclaw.plugin.json` 中配置：

```json
{
  "hubUrl": "ws://server.aigc.sx.cn:8889",
  "agentId": "main",
  "agentName": "大龙虾",
  "reportInterval": 5000,
  "updateToken": ""
}
```

## 使用

### 1. 启动 Agent

```bash
cd ~/.openclaw/extensions/claw-camp-agent
node src/agent.js
```

或使用环境变量：

```bash
CLAW_HUB_URL=ws://server.aigc.sx.cn:8889 \
CLAW_AGENT_ID=main \
CLAW_AGENT_NAME=大龙虾 \
node src/agent.js
```

### 2. 后台运行

```bash
nohup node src/agent.js > /tmp/agent.log 2>&1 &
```

### 3. 查看日志

```bash
tail -f /tmp/agent.log
```

### 4. 停止 Agent

```bash
pkill -f "node.*agent.js"
```

## 工具

插件提供以下工具：

### 1. `start_claw_camp_agent`
启动 Agent（返回启动命令）

### 2. `check_claw_camp_agent`
查看 Agent 运行状态

### 3. `stop_claw_camp_agent`
停止 Agent

### 4. `check_claw_camp_hub`
查看 Hub 状态

## 远程更新

Agent 支持远程更新：

1. Hub 通过 WebSocket 发送 `update` 命令
2. Agent 执行 `git pull`
3. Agent 自动重启

## 架构

```
本地 Mac (你的电脑)
  └─ agent.js v1.5.0
       ↓ WebSocket (每 5 秒)
线上服务器 (119.91.123.2)
  └─ hub.js v1.5.0
       ↓
  Dashboard UI (https://camp.aigc.sx.cn)
```

## 数据上报

Agent 每 5 秒上报以下数据：

- **系统状态**: CPU 使用率、内存使用率
- **Gateway 状态**: 运行状态
- **会话列表**: 会话数量、会话详情（最多 50 个）
- **Token 消耗**: 从 .jsonl 文件解析的精确数据（按半小时槽聚合）
- **插件列表**: 已加载的插件名称和版本

## 版本

- **当前版本**: v1.5.0
- **GitHub**: https://github.com/PhosAQy/claw-hub

## 许可证

MIT

## 作者

Phosa
