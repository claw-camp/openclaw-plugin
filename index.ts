/**
 * Claw Camp Agent Plugin - 渠道 + Agent
 *
 * 功能：
 * 1. 作为 Agent 上报系统状态
 * 2. 作为渠道接收和发送消息
 * 3. 执行远程任务
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, ChannelOnboardingAdapter, ClawdbotConfig } from "openclaw/plugin-sdk";
import WebSocket from "ws";

// ============ Helper Functions ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

// ============ Channel Client ============

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_MS = 5000;

class ClawCampChannel {
  private ws: WebSocket | null = null;
  private api: OpenClawPluginApi;
  private config: any;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private reconnectAttempts = 0;
  private channelRuntime: any = null;

  setChannelRuntime(rt: any) {
    this.channelRuntime = rt;
  }

  constructor(api: OpenClawPluginApi, config: any) {
    this.api = api;
    this.config = {
      hubUrl: 'wss://camp.aigc.sx.cn/ws',
      agentId: config.botId || config.agentId,
      agentName: config.agentName || 'Bot',
      ...config
    };
  }

  connect() {
    if (this.isShuttingDown) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.api.logger.warn(`[Claw Camp Channel] 已超过最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，停止重连`);
      return;
    }

    const { hubUrl, botToken, token, agentId, agentName } = this.config;
    const authToken = botToken || token;

    this.api.logger.info(`[Claw Camp Channel] 连接 Hub: ${hubUrl} (尝试 #${this.reconnectAttempts + 1})`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${hubUrl}?token=${authToken}&agentId=${agentId}`);
    } catch (err) {
      this.api.logger.error('[Claw Camp Channel] 创建 WebSocket 失败:', String(err));
      this._scheduleReconnect();
      return;
    }

    // 先赋值再绑定事件，防止 error 在绑定前触发
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0; // 连接成功，重置计数
      this.api.logger.info('[Claw Camp Channel] 已连接到 Hub');

      this._sendRaw({
        type: 'register',
        payload: {
          id: agentId,
          name: agentName,
          host: require('os').hostname(),
          agentVersion: this._getAgentVersion(),
          channel: 'claw-camp',
          capabilities: ['message', 'task']
        }
      });

      // 心跳 + 状态上报
      this.heartbeatTimer = setInterval(() => {
        this._sendRaw({ type: 'heartbeat', payload: { id: agentId } });
        this.reportStatus().catch((e) =>
          this.api.logger.error('[Claw Camp Channel] 状态上报失败:', String(e))
        );
      }, 30000);

      // 启动后立即上报一次
      setTimeout(() => {
        this.reportStatus().catch((e) =>
          this.api.logger.error('[Claw Camp Channel] 初始状态上报失败:', String(e))
        );
      }, 3000);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        this.api.logger.error('[Claw Camp Channel] 解析消息失败:', String(e));
      }
    });

    ws.on('close', (code, reason) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      if (!this.isShuttingDown) {
        this.api.logger.info(`[Claw Camp Channel] 连接断开 (code=${code})，准备重连...`);
        this._scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
      // 只记录日志，不抛出 —— 防止 uncaught exception 崩溃 gateway
      try {
        const msg = err instanceof Error ? err.message : String(err);
        this.api.logger.error('[Claw Camp Channel] 连接错误:', msg);
      } catch (_) {
        // ignore logging errors
      }
    });
  }

  private _scheduleReconnect() {
    if (this.isShuttingDown) return;
    this.reconnectAttempts++;
    // 指数退避：5s, 10s, 20s, 40s ... 最大 60s
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts - 1), 60000);
    this.api.logger.info(`[Claw Camp Channel] ${delay / 1000}s 后重连 (第 ${this.reconnectAttempts} 次)...`);
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    this.isShuttingDown = true;
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.api.logger.info('[Claw Camp Channel] 已断开连接');
  }

  private _sendRaw(msg: any) {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    } catch (e) {
      this.api.logger.error('[Claw Camp Channel] 发送消息失败:', String(e));
    }
  }

  // 获取 Gateway sessions（扫 .jsonl 文件）
  private async getGatewaySessions(): Promise<any[]> {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const sessionsDir = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');
    try {
      if (!fs.existsSync(sessionsDir)) return [];

      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const sessions: any[] = [];

      const files = fs.readdirSync(sessionsDir).filter((f: string) =>
        f.endsWith('.jsonl') && !f.includes('.deleted') && !f.includes('.reset')
      );

      for (const file of files.slice(0, 50)) {  // 最多读50个
        try {
          const filePath = path.join(sessionsDir, file);
          const stat = fs.statSync(filePath);
          const updatedAt = stat.mtimeMs;
          // 只取最近7天有活动的
          if (now - updatedAt > 7 * oneDayMs) continue;

          // 读最后一行获取 token 信息
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.trim().split('\n').filter((l: string) => l.trim());
          let totalTokens = 0, model = '', inputTokens = 0, outputTokens = 0;

          // 从最后往前找最新有效的 usage（在 message.usage 里）
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const entry = JSON.parse(lines[i]);
              const usage = entry.message?.usage || entry.usage;
              if (usage && usage.totalTokens > 0) {
                inputTokens = usage.input || 0;
                outputTokens = usage.output || 0;
                totalTokens = usage.totalTokens;
                model = entry.message?.model || entry.model || model;
                break;
              }
            } catch { /* skip */ }
          }

          sessions.push({
            key: file.replace('.jsonl', ''),
            updatedAt,
            model,
            inputTokens,
            outputTokens,
            totalTokens,
            lastActive: updatedAt,
          });
        } catch { /* skip */ }
      }

      return sessions;
    } catch {
      return [];
    }
  }

  // 获取已加载的 plugins（从 extensions 目录扫描）
  private async getGatewayPlugins(): Promise<any[]> {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const plugins: any[] = [];

    // 只扫用户自装插件，stock 插件太多且大多未启用
    const dirs = [
      path.join(os.homedir(), '.openclaw', 'extensions'),
    ];

    for (const dir of dirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const pkgPath = path.join(dir, entry.name, 'openclaw.plugin.json');
          const pkg2Path = path.join(dir, entry.name, 'package.json');
          try {
            if (fs.existsSync(pkgPath)) {
              const meta = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              plugins.push({ name: meta.name || entry.name, id: meta.id || entry.name, version: meta.version || '1.0.0' });
            } else if (fs.existsSync(pkg2Path)) {
              const meta = JSON.parse(fs.readFileSync(pkg2Path, 'utf8'));
              if (meta.keywords?.includes('openclaw')) {
                plugins.push({ name: meta.name || entry.name, id: entry.name, version: meta.version || '1.0.0' });
              }
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    return plugins;
  }

  // 获取真实 openclaw 版本
  private _getAgentVersion(): string {
    const fs = require('fs');
    const candidates = [
      '/Users/phosa/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/package.json',
      '/opt/homebrew/lib/node_modules/openclaw/package.json',
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (pkg.version) return pkg.version;
        }
      } catch { /* skip */ }
    }
    return '1.5.0';
  }

  // 检测 Gateway 是否存活
  private _checkGatewayAlive(): Promise<boolean> {
    const http = require('http');
    const port = parseInt(String(process.env.OPENCLAW_GATEWAY_PORT || '18789'));
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost', port, path: '/',
        method: 'GET', timeout: 2000
      }, (res) => {
        // 只要能连上就算存活（200 或 404 都说明服务在运行）
        resolve(res.statusCode !== undefined);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  // 上报详细状态
  async reportStatus() {
    if (this.isShuttingDown || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    let sessions: any[] = [];
    let plugins: any[] = [];

    try {
      const [s, p] = await Promise.all([this.getGatewaySessions(), this.getGatewayPlugins()]);
      sessions = s || [];
      plugins = p || [];
    } catch {
      // 忽略，继续上报基础信息
    }

    const gatewayRunning = sessions.length > 0 || plugins.length > 0 ||
      await this._checkGatewayAlive();
    const todayStr = new Date().toDateString();
    const status = {
      id: this.config.agentId,
      host: require('os').hostname(),
      agentVersion: this._getAgentVersion(),
      gateway: {
        running: gatewayRunning,
        status: gatewayRunning ? 'running' : 'stopped',
        port: parseInt(String(process.env.OPENCLAW_GATEWAY_PORT || '18789'))
      },
      sessions: {
        count: sessions.length,
        todayActive: sessions.filter((s: any) => {
          try {
            const t = s.updatedAt || s.lastActive;
            return t && new Date(t).toDateString() === todayStr;
          } catch { return false; }
        }).length,
        list: sessions.slice(0, 10).map((s: any) => ({
          key: s.key,
          model: s.model,
          updatedAt: s.updatedAt,
          totalTokens: s.totalTokens || 0,
        }))
      },
      plugins: plugins.map((p: any) => ({ name: p.name || p.id, version: p.version || '1.0.0' })),
      tokenUsage: sessions.map((s: any) => ({
        sessionKey: s.key,
        inputTokens: s.inputTokens || 0,
        outputTokens: s.outputTokens || 0,
        totalTokens: s.totalTokens || 0,
        model: s.model,
        updatedAt: s.updatedAt,
      })),
      stats: {
        cpu: (() => {
          try {
            const os = require('os');
            const cpus = os.cpus();
            const total = cpus.reduce((a: any, c: any) => {
              const t = Object.values(c.times as Record<string, number>).reduce((x: number, y: number) => x + y, 0);
              return { idle: a.idle + (c.times as any).idle, total: a.total + t };
            }, { idle: 0, total: 0 });
            return Math.round((1 - total.idle / total.total) * 100);
          } catch { return 0; }
        })(),
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        uptime: Math.round(process.uptime())
      },
      startTime: Date.now() - process.uptime() * 1000,
      uptime: process.uptime()
    };

    this._sendRaw({ type: 'status', payload: status });
  }

  handleMessage(msg: any) {
    const { type, payload } = msg;
    switch (type) {
      case 'message':
        this.api.logger.info('[Claw Camp Channel] 收到消息:', payload);
        try {
          this.api.emit('message:received', {
            channel: 'claw-camp',
            accountId: this.config.agentId,
            from: payload.from,
            to: this.config.agentId,
            content: payload.content,
            timestamp: Date.now()
          });
        } catch (e) {
          this.api.logger.error('[Claw Camp Channel] emit 失败:', String(e));
        }
        break;
      case 'task':
        this.api.logger.info('[Claw Camp Channel] 收到任务:', payload);
        this.executeTask(payload).catch((e) =>
          this.api.logger.error('[Claw Camp Channel] 任务执行失败:', String(e))
        );
        break;
      case 'chat-message':
        this.api.logger.info('[Claw Camp Channel] 收到聊天消息:', payload?.conversationId);
        this.handleChatMessage(payload).catch((e) =>
          this.api.logger.error('[Claw Camp Channel] 处理聊天消息失败:', String(e))
        );
        break;
      case 'registered':
        this.api.logger.info('[Claw Camp Channel] 注册成功:', payload?.id);
        break;
      default:
        // 未知消息类型，忽略
        break;
    }
  }

  async handleChatMessage(payload: any) {
    const { conversationId, userId, username, content, sessionKey: rawSessionKey, msgId } = payload;
    const botId = this.config.agentId;
    const sessionKey = rawSessionKey || `claw-camp:direct:${userId}`;

    this.api.logger.info('[Claw Camp Channel] 收到聊天消息:', content);

    if (this.channelRuntime) {
      const accountId = this.config.accountId || 'default';
      const ctx = { Body: content, BodyForAgent: content, From: userId, To: botId, SessionKey: sessionKey, AccountId: accountId, Channel: 'claw-camp' };
      const cfg = this.api.config;
      try {
        await this.channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher({
          ctx, cfg,
          dispatcherOptions: {
            deliver: async (replyPayload: any) => {
              const replyText = typeof replyPayload === 'string' ? replyPayload : replyPayload?.text ?? replyPayload?.content ?? JSON.stringify(replyPayload);
              this._sendRaw({ type: 'chat-reply', payload: { msgId, conversationId, sessionKey, reply: replyText } });
            }
          }
        });
      } catch (e) {
        this.api.logger.error('[Claw Camp Channel] dispatchReply 失败:', String(e));
        this._sendRaw({ type: 'chat-reply', payload: { msgId, conversationId, sessionKey, reply: `处理失败: ${e instanceof Error ? e.message : String(e)}` } });
      }
    } else {
      // 无 channelRuntime，降级回复
      const reply = `收到消息: "${content}"。聊天功能需要 channelRuntime 支持，当前未就绪。我是大龙虾，蟹老板的 AI 助手。`;
      this._sendRaw({ type: 'chat-reply', payload: { msgId, conversationId, sessionKey, reply } });
    }
  }

  async executeTask(task: any) {
    const { action } = task;
    let result: any;

    try {
      switch (action) {
        case 'check-social-monitor': {
          const { execSync } = require('child_process');
          const output = execSync('python3 ~/.openclaw/workspace/scripts/do-social-monitor.py', {
            encoding: 'utf-8',
            timeout: 60000
          });
          result = { success: true, output };
          break;
        }
        case 'send-email':
          result = { success: true };
          break;
        default:
          result = { success: false, error: `未知任务: ${action}` };
      }
    } catch (e) {
      result = { success: false, error: e instanceof Error ? e.message : String(e) };
    }

    this._sendRaw({ type: 'task-result', payload: { taskId: task.id, ...result } });
  }

  sendMessage(to: string, content: string) {
    this._sendRaw({
      type: 'message',
      payload: { from: this.config.agentId, to, content, timestamp: Date.now() }
    });
  }
}

// ============ Onboarding Adapter ============

interface ClawCampAccountConfig {
  botId?: string;
  botToken?: string;
  agentName?: string;
}

interface ClawCampChannelConfig {
  enabled?: boolean;
  dmPolicy?: string;
  groupPolicy?: string;
  accounts?: Record<string, ClawCampAccountConfig>;
  allowFrom?: string[];
}

function getNextAccountName(accounts: Record<string, any>): string {
  if (!accounts || Object.keys(accounts).length === 0) return 'default';
  let maxN = 0;
  for (const key of Object.keys(accounts)) {
    if (key === 'default') { maxN = Math.max(maxN, 1); }
    else if (key.startsWith('default')) {
      const n = parseInt(key.replace('default', ''), 10);
      if (!isNaN(n)) maxN = Math.max(maxN, n);
    }
  }
  return maxN === 0 ? 'default' : `default${maxN + 1}`;
}

function setClawCampAccount(cfg: ClawdbotConfig, accountName: string, accountConfig: ClawCampAccountConfig): ClawdbotConfig {
  const channelConfig = (cfg.channels?.['claw-camp'] as ClawCampChannelConfig | undefined) || {};
  const accounts = channelConfig.accounts || {};
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      'claw-camp': {
        ...channelConfig,
        enabled: true,
        dmPolicy: channelConfig.dmPolicy || 'open',
        groupPolicy: channelConfig.groupPolicy || 'open',
        accounts: { ...accounts, [accountName]: accountConfig },
        allowFrom: channelConfig.allowFrom || ['*']
      }
    }
  };
}

const clawCampOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: 'claw-camp',
  getStatus: async ({ cfg }) => {
    const channelConfig = cfg.channels?.['claw-camp'] as ClawCampChannelConfig | undefined;
    const accounts = channelConfig?.accounts || {};
    const accountCount = Object.keys(accounts).length;
    const configured = accountCount > 0;
    return {
      channel: 'claw-camp',
      configured,
      statusLines: configured
        ? [`Claw Camp: ${accountCount} 个账号 (${Object.keys(accounts).join(', ')})`]
        : ['Claw Camp: 未配置'],
      selectionHint: configured ? '已配置' : '需要 Bot 凭据',
      quickstartScore: configured ? 2 : 0
    };
  },
  configure: async ({ cfg, prompter }) => {
    const channelConfig = cfg.channels?.['claw-camp'] as ClawCampChannelConfig | undefined;
    const accounts = channelConfig?.accounts || {};
    const defaultName = getNextAccountName(accounts);

    await prompter.note(
      ['配置 Claw Camp 渠道', '', 'Claw Camp 是一个 Agent 监控和管理平台。', '你需要先在 https://camp.aigc.sx.cn 创建 Bot，获取 Bot ID 和 Token。'].join('\n'),
      'Claw Camp 配置向导'
    );

    const accountName = await prompter.text({ message: '账号名称', placeholder: defaultName, initialValue: defaultName });
    if (!accountName?.trim()) return { cfg, status: 'cancelled' };

    const botId = await prompter.text({ message: 'Bot ID (格式: bot_xxxxx)', placeholder: 'bot_xxxxxxxxxxxxxxxx' });
    if (!botId?.trim()) return { cfg, status: 'cancelled' };

    const botToken = await prompter.text({ message: 'Bot Token', placeholder: '从 Dashboard 复制' });
    if (!botToken?.trim()) return { cfg, status: 'cancelled' };

    const newCfg = setClawCampAccount(cfg, accountName.trim(), { botId: botId.trim(), botToken: botToken.trim() });

    await prompter.note(
      ['✅ 配置完成！', '', `账号: ${accountName}`, `Bot ID: ${botId}`, '', '重启 Gateway 后生效。'].join('\n'),
      '配置成功'
    );

    return { cfg: newCfg, status: 'configured', restartRequired: true };
  }
};

// ============ Plugin Export ============

export default function (api: OpenClawPluginApi) {
  const { logger, config } = api;

  logger.info("[Claw Camp Agent] 插件已加载");

  const channels = new Map<string, ClawCampChannel>();

  // 手动启动渠道连接（OpenClaw 的 gateway.startAccount 不保证被调用）
  const startChannels = () => {
    const accounts = config.channels?.['claw-camp']?.accounts || {};
    const accountKeys = Object.keys(accounts);
    if (accountKeys.length === 0) {
      logger.warn('[Claw Camp] 未配置 accounts，跳过连接');
      return;
    }
    for (const accountKey of accountKeys) {
      // 如果已存在（可能被 startAccount 创建），跳过
      if (channels.has(accountKey)) {
        logger.info(`[Claw Camp] ${accountKey} 已存在，跳过创建`);
        continue;
      }
      const accountConfig = accounts[accountKey];
      const { botId, botToken } = accountConfig;
      if (botId && botToken) {
        const agentName = accountConfig.agentName || accountKey;
        logger.info(`[Claw Camp] 启动连接: botId=${botId}, name=${agentName}`);
        const channel = new ClawCampChannel(api, {
          hubUrl: 'wss://camp.aigc.sx.cn/ws',
          token: botToken,
          agentId: botId,
          agentName,
          accountId: accountKey,
          botId,
          botToken,
        });
        channels.set(accountKey, channel);
        channel.connect();
      } else {
        logger.warn(`[Claw Camp] account ${accountKey} 缺少 botId/botToken`);
      }
    }
  };

  const stopAllChannels = () => {
    logger.info(`[Claw Camp] 停止 ${channels.size} 个连接...`);
    for (const [key, channel] of channels) {
      logger.info(`[Claw Camp] 断开 ${key}`);
      channel.disconnect();
    }
    channels.clear();
  };

  // 注册 shutdown hook
  process.once('SIGTERM', stopAllChannels);
  process.once('SIGINT', stopAllChannels);
  api.on?.('shutdown', stopAllChannels);

  // 延迟启动（等 Gateway 就绪）
  setTimeout(startChannels, 2000);

  // 注册渠道
  if (api.registerChannel) {
    logger.info('[Claw Camp] 正在注册 channel...');
    api.registerChannel({
      plugin: {
        id: 'claw-camp',
        meta: {
          id: 'claw-camp',
          label: 'Claw Camp',
          selectionLabel: 'Claw Camp (龙虾营地)',
          docsPath: '/channels/claw-camp',
          docsLabel: 'claw-camp',
          blurb: 'Agent 监控和管理平台',
          order: 100
        },
        capabilities: {
          chatTypes: ['direct'],
          polls: false,
          threads: false,
          media: false,
          reactions: false,
          edit: false,
          reply: false
        },
        configSchema: {
          schema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              dmPolicy: { type: 'string', enum: ['open', 'pairing', 'allowlist'] },
              groupPolicy: { type: 'string', enum: ['open', 'allowlist', 'disabled'] },
              allowFrom: { type: 'array', items: { type: 'string' } },
              accounts: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    botId: { type: 'string' },
                    botToken: { type: 'string' },
                    agentName: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        config: {
          listAccountIds: (cfg: any) => {
            // cfg 是完整的 openclaw.json，channel 配置在 cfg.channels['claw-camp']
            const channelCfg = cfg?.channels?.['claw-camp'] || cfg;
            const ids = Object.keys(channelCfg?.accounts || {});
            logger.info(`[Claw Camp] listAccountIds: channelCfg.accounts=${JSON.stringify(channelCfg?.accounts)}, ids=${JSON.stringify(ids)}`);
            return ids;
          },
          resolveAccount: (cfg: any, accountId: string) => {
            const channelCfg = cfg?.channels?.['claw-camp'] || cfg;
            const account = channelCfg?.accounts?.[accountId] || null;
            logger.info(`[Claw Camp] resolveAccount(${accountId}): ${account ? 'found' : 'null'}`);
            return account;
          }
        },
        gateway: {
          startAccount: async (ctx: any) => {
            const { accountId, channelRuntime } = ctx;
            logger.info(`[Claw Camp] gateway.startAccount called for ${accountId}, channelRuntime=${!!channelRuntime}`);

            let channel = channels.get(accountId);
            if (channel) {
              // 已存在：只更新 channelRuntime，不重复创建
              if (channelRuntime) {
                channel.setChannelRuntime(channelRuntime);
                logger.info(`[Claw Camp] account ${accountId}: channelRuntime 已更新（复用已有连接）`);
              }
              return;
            }

            // 不存在，创建新实例
            const accountConfig = config.channels?.['claw-camp']?.accounts?.[accountId];
            if (accountConfig?.botId && accountConfig?.botToken) {
              logger.info(`[Claw Camp] 为 ${accountId} 创建新的 channel 实例`);
              channel = new ClawCampChannel(api, {
                hubUrl: 'wss://camp.aigc.sx.cn/ws',
                token: accountConfig.botToken,
                agentId: accountConfig.botId,
                agentName: accountConfig.agentName || accountId,
                accountId,
                botId: accountConfig.botId,
                botToken: accountConfig.botToken,
              });
              channels.set(accountId, channel);
              channel.connect();

              if (channelRuntime) {
                channel.setChannelRuntime(channelRuntime);
                logger.info(`[Claw Camp] account ${accountId}: channelRuntime 已注入`);
              }
            } else {
              logger.warn(`[Claw Camp] account ${accountId}: 配置不存在或不完整`);
            }
          },
          stopAccount: async (ctx: any) => {
            const { accountId } = ctx;
            const channel = channels.get(accountId);
            if (channel) {
              logger.info(`[Claw Camp] gateway.stopAccount: 断开 ${accountId}`);
              channel.disconnect();
              channels.delete(accountId);
            }
          }
        },
        onboarding: clawCampOnboardingAdapter,
        reload: { configPrefixes: ['channels.claw-camp'] }
      }
    });
  }

  // 工具：启动 Agent
  api.registerTool({
    name: "start_claw_camp_agent",
    description: "启动龙虾营地监控 Agent，连接到 Hub 并开始上报数据",
    inputSchema: Type.Object({
      hubUrl: Type.Optional(Type.String({ default: config.hubUrl || "wss://camp.aigc.sx.cn", description: "Hub WebSocket 地址" })),
      token: Type.Optional(Type.String({ default: config.token || "", description: "Camp Token" })),
      agentId: Type.Optional(Type.String({ default: config.agentId || "main", description: "Agent 唯一标识" })),
      agentName: Type.Optional(Type.String({ default: config.agentName || "大龙虾", description: "Agent 显示名称" }))
    }),
    handler: async (params) => {
      const { hubUrl, token, agentId, agentName } = params;
      logger.info(`[Claw Camp Agent] 启动 Agent: ${agentId} -> ${hubUrl}`);
      return json({ success: true, message: "请在终端运行以下命令启动 Agent：", command: `cd ~/.openclaw/extensions/claw-camp && node src/agent.js`, env: { CLAW_HUB_URL: hubUrl, CLAW_CAMP_TOKEN: token, CLAW_AGENT_ID: agentId, CLAW_AGENT_NAME: agentName } });
    }
  });

  // 工具：查看 Agent 状态
  api.registerTool({
    name: "check_claw_camp_agent",
    description: "查看龙虾营地监控 Agent 的运行状态",
    inputSchema: Type.Object({}),
    handler: async () => {
      const { execSync } = require('child_process');
      try {
        const running = execSync('pgrep -f "node.*agent.js"', { encoding: 'utf-8' }).trim();
        return json({ success: true, status: "running", pid: parseInt(running), message: "Agent 正在运行" });
      } catch {
        return json({ success: true, status: "stopped", message: "Agent 未运行" });
      }
    }
  });

  // 工具：停止 Agent
  api.registerTool({
    name: "stop_claw_camp_agent",
    description: "停止龙虾营地监控 Agent",
    inputSchema: Type.Object({}),
    handler: async () => {
      const { execSync } = require('child_process');
      try {
        execSync('pkill -f "node.*agent.js"');
        logger.info("[Claw Camp Agent] Agent 已停止");
        return json({ success: true, message: "Agent 已停止" });
      } catch {
        return json({ success: true, message: "Agent 未运行，无需停止" });
      }
    }
  });

  // 工具：查看 Hub 状态
  api.registerTool({
    name: "check_claw_camp_hub",
    description: "查看龙虾营地 Hub 的状态和版本信息",
    inputSchema: Type.Object({}),
    handler: async () => {
      const https = require('https');
      return new Promise((resolve) => {
        const req = https.get('https://camp.aigc.sx.cn/api/version', (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try { resolve(json({ success: true, hub: JSON.parse(data), url: "https://camp.aigc.sx.cn" })); }
            catch { resolve(json({ success: false, error: "无法解析 Hub 响应" })); }
          });
        });
        req.on('error', (e: Error) => resolve(json({ success: false, error: e.message })));
        req.setTimeout(5000, () => { req.destroy(); resolve(json({ success: false, error: "超时" })); });
      });
    }
  });
}
