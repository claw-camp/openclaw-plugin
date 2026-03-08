/**
 * Claw Agent - 本地监控 Agent + 渠道
 * 
 * 功能：
 * - 连接到 Hub
 * - 采集 Gateway 状态
 * - 采集会话列表
 * - 采集系统资源
 * - 解析 session .jsonl 获取精确 token 使用（按半小时槽聚合）
 * - 定时上报
 * - 接收和发送消息（渠道功能）
 * - 执行远程任务
 * 
 * @name 龙虾营地 Agent
 * @version 2.0.0
 */

const WebSocket = require('ws');
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Agent 信息
const AGENT_NAME = '龙虾营地 Agent';
const AGENT_VERSION = '1.5.0';
const GITHUB_REPO = 'https://github.com/PhosAQy/claw-hub';
const AGENT_START_TIME = Date.now();  // Agent 启动时间

// 配置
const CONFIG = {
  hubUrl: process.env.CLAW_HUB_URL || 'ws://server.aigc.sx.cn:8889',
  agentId: process.env.CLAW_AGENT_ID || 'main',
  agentName: process.env.CLAW_AGENT_NAME || '大龙虾',
  reportInterval: 5000,  // 上报间隔
  gatewayPort: 18789,    // Gateway 端口
  gatewayToken: process.env.CLAW_GATEWAY_TOKEN || '',  // Gateway Token (从环境变量读取)
  sessionsDir: path.join(os.homedir(), '.openclaw/agents/main/sessions'),
  updateToken: process.env.CLAW_UPDATE_TOKEN || ''  // 更新令牌
};

let ws = null;
let reconnectTimer = null;

// 获取主机名
function getHostname() {
  return os.hostname();
}

// 检查 Gateway 状态
function getGatewayStatus() {
  try {
    const result = execSync(`ps aux | grep -v grep | grep -c "openclaw-gateway"`, {
      encoding: 'utf-8',
      timeout: 3000
    }).trim();
    const isRunning = parseInt(result) > 0;
    return { status: isRunning ? 'running' : 'stopped', port: CONFIG.gatewayPort };
  } catch (e) {
    return { status: 'stopped', port: CONFIG.gatewayPort };
  }
}

// 启动 Gateway
async function startGateway() {
  return new Promise((resolve) => {
    try {
      // 先安装服务（如果未安装）
      execSync('openclaw gateway install', { timeout: 10000, encoding: 'utf8' });
      console.log('[Agent] Gateway 服务已安装');
      
      // 再启动服务
      const stdout = execSync('openclaw gateway start', { timeout: 10000, encoding: 'utf8' });
      console.log('[Agent] Gateway 已启动');
      resolve({ success: true, message: 'Gateway 已启动', output: stdout });
    } catch (err) {
      console.error('[Agent] Gateway 启动失败:', err.stderr || err.message);
      resolve({ success: false, error: err.stderr || err.message });
    }
  });
}

// 停止 Gateway
async function stopGateway() {
  return new Promise((resolve) => {
    try {
      const stdout = execSync('openclaw gateway stop', { timeout: 10000, encoding: 'utf8' });
      console.log('[Agent] Gateway 已停止');
      resolve({ success: true, message: 'Gateway 已停止', output: stdout });
    } catch (err) {
      console.error('[Agent] Gateway 停止失败:', err.stderr || err.message);
      resolve({ success: false, error: err.stderr || err.message });
    }
  });
}

// 重启 Gateway
async function restartGateway() {
  return new Promise((resolve) => {
    try {
      const stdout = execSync('openclaw gateway restart', { timeout: 30000, encoding: 'utf8' });
      console.log('[Agent] Gateway 已重启');
      resolve({ success: true, message: 'Gateway 已重启', output: stdout });
    } catch (err) {
      console.error('[Agent] Gateway 重启失败:', err.stderr || err.message);
      resolve({ success: false, error: err.stderr || err.message });
    }
  });
}

// 获取会话列表（用于显示）
function getSessions() {
  try {
    const result = execSync('openclaw sessions --json 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000
    });
    const data = JSON.parse(result);
    const sessions = data.sessions || [];
    
    const recentSessions = sessions
      .filter(s => s.ageMs < 24 * 60 * 60 * 1000)
      .slice(0, 50)
      .map(s => ({
        key: s.key,
        kind: s.kind || 'direct',
        model: s.model,
        tokens: s.totalTokens,
        inputTokens: s.inputTokens || 0,
        outputTokens: s.outputTokens || 0,
        updatedAt: s.updatedAt,
        age: Math.round((s.ageMs || 0) / 60000) + '分钟前'
      }));
    
    return {
      count: sessions.length,
      todayActive: sessions.filter(s => s.ageMs < 24 * 60 * 60 * 1000).length,
      list: recentSessions
    };
  } catch (e) {
    return { count: 0, todayActive: 0, list: [] };
  }
}

/**
 * 解析 session .jsonl 文件，获取精确的 token 使用数据
 * 按半小时槽聚合
 */
function getTokenUsage(hours = 6) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const slots = {};

  try {
    const files = fs.readdirSync(CONFIG.sessionsDir)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'));

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(CONFIG.sessionsDir, file);
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            
            if (record.type === 'message' && record.message?.usage) {
              const ts = new Date(record.timestamp).getTime();
              if (ts >= cutoff) {
                // 计算半小时槽
                const d = new Date(ts);
                const hour = d.getHours().toString().padStart(2, '0');
                const minute = d.getMinutes() < 30 ? '00' : '30';
                const slot = `${hour}:${minute}`;
                
                if (!slots[slot]) {
                  slots[slot] = { slot, input: 0, output: 0, cacheRead: 0, count: 0 };
                }
                
                const usage = record.message.usage;
                slots[slot].input += usage.input || 0;
                slots[slot].output += usage.output || 0;
                slots[slot].cacheRead += usage.cacheRead || 0;
                slots[slot].count += 1;
              }
            }
          } catch (e) {
            // 跳过解析失败的行
          }
        }
      } catch (e) {
        // 跳过无法读取的文件
      }
    }
  } catch (e) {
    // 目录不存在或无权限
  }

  // 转换为数组
  return Object.values(slots)
    .map(s => ({
      ...s,
      // 总消耗 = 输入 + 输出（缓存命中是优化指标，不影响实际消耗）
      netTokens: s.input + s.output
    }))
    .sort((a, b) => a.slot.localeCompare(b.slot));
}

// 获取系统资源
function getSystemStats() {
  try {
    let cpu = 0;
    const cpuInfo = execSync('top -l 1 -n 0 | grep "CPU usage" 2>/dev/null || echo ""', {
      encoding: 'utf-8',
      timeout: 3000
    });
    const cpuMatch = cpuInfo.match(/(\d+\.?\d*)\s*%/);
    if (cpuMatch) cpu = parseFloat(cpuMatch[1]);
    
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memory = Math.round((1 - freeMem / totalMem) * 100);
    
    // 从精确数据计算今日 token
    const tokenUsage = getTokenUsage(24);
    const todayTokens = tokenUsage.reduce((sum, s) => sum + s.netTokens, 0);
    
    return { cpu, memory, todayTokens };
  } catch (e) {
    return { cpu: 0, memory: 0, todayTokens: 0 };
  }
}

// 获取已加载的插件列表
function getPlugins() {
  try {
    const result = execSync('openclaw plugins list 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 10000
    });
    
    // 解析表格格式
    const plugins = [];
    const lines = result.split('\n');
    let inTable = false;
    
    for (const line of lines) {
      // 检测表格开始（包含表头分隔符）
      if (line.includes('─') && line.includes('┼')) {
        inTable = true;
        continue;
      }
      
      // 检测表格结束
      if (inTable && line.includes('└')) {
        break;
      }
      
      // 解析表格行（只处理包含 loaded 的行）
      if (inTable && line.includes('│') && line.includes('loaded')) {
        const cols = line.split('│').map(c => c.trim()).filter(c => c);
        if (cols.length >= 4) {
          const [name, id, status, source, version] = cols;
          
          // 从 source 推断完整名称
          let fullName = name || id;
          if (source.includes('device-pair')) {
            fullName = 'Device Pairing';
          } else if (source.includes('feishu-card')) {
            fullName = 'Feishu Interactive Card';
          } else if (source.includes('feishu/index')) {
            fullName = 'Feishu';
          } else if (source.includes('memory-core')) {
            fullName = 'Memory (Core)';
          } else if (source.includes('phone-control')) {
            fullName = 'Phone Control';
          } else if (source.includes('talk-voice')) {
            fullName = 'Talk Voice';
          }
          
          plugins.push({
            name: fullName,
            id: id || 'unknown',
            version: version || 'unknown',
            source: source || ''
          });
        }
      }
    }
    
    return plugins;
  } catch (e) {
    return [];
  }
}

// ──────────────────────────────────────────────
// 版本管理和更新
// ──────────────────────────────────────────────

/**
 * 获取最新版本（从 GitHub tags）
 */
async function getLatestVersion() {
  return new Promise((resolve) => {
    exec('git ls-remote --tags origin', { timeout: 10000 }, (err, stdout) => {
      if (err) {
        resolve(AGENT_VERSION);
        return;
      }
      
      const tags = stdout.split('\n')
        .filter(line => line.includes('refs/tags/'))
        .map(line => line.split('refs/tags/')[1])
        .filter(tag => tag && tag.startsWith('v'))
        .sort((a, b) => b.localeCompare(a));
      
      resolve(tags[0] ? tags[0].replace('v', '') : AGENT_VERSION);
    });
  });
}

/**
 * 执行更新
 */
async function doUpdate() {
  return new Promise((resolve) => {
    const projectDir = path.join(__dirname, '..');
    
    exec('git pull', { cwd: projectDir, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr || err.message });
        return;
      }
      
      const updated = !stdout.includes('Already up to date');
      
      if (updated) {
        // 更新成功，准备重启
        console.log('[Agent] 更新成功，即将重启...');
        setTimeout(() => {
          process.exit(0);  // 退出进程，依赖外部进程管理器重启
        }, 1000);
      }
      
      resolve({
        success: true,
        updated,
        message: updated ? '更新成功，即将重启' : '已是最新版本',
        version: AGENT_VERSION
      });
    });
  });
}

// 发送消息
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// 上报状态
function reportStatus() {
  const gateway = getGatewayStatus();
  const sessions = getSessions();
  const stats = getSystemStats();
  const tokenUsage = getTokenUsage(6);  // 最近 6 小时
  const plugins = getPlugins();  // 获取插件列表
  
  // 计算运行时长
  const uptimeMs = Date.now() - AGENT_START_TIME;
  const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
  
  console.log(`[Agent] 上报状态: Gateway=${gateway.status}, Sessions=${sessions.count}, Uptime=${uptimeHours}h${uptimeMinutes}m`);
  
  send({
    type: 'status',
    payload: {
      id: CONFIG.agentId,
      agentVersion: AGENT_VERSION,  // Agent 版本
      gateway,
      sessions,
      stats,
      tokenUsage,  // 精确的 token 使用数据
      plugins,     // 插件列表
      startTime: AGENT_START_TIME,  // 启动时间戳
      uptime: { hours: uptimeHours, minutes: uptimeMinutes }  // 运行时长
    }
  });
}

// 连接到 Hub
function connect() {
  console.log(`[Agent] 连接 Hub: ${CONFIG.hubUrl}`);
  
  ws = new WebSocket(CONFIG.hubUrl);
  
  ws.on('open', () => {
    console.log('[Agent] 已连接到 Hub');
    
    send({
      type: 'register',
      payload: {
        id: CONFIG.agentId,
        name: CONFIG.agentName,
        host: getHostname(),
        agentVersion: AGENT_VERSION  // Agent 版本
      }
    });
    
    clearInterval(reconnectTimer);
    reconnectTimer = setInterval(() => {
      send({ type: 'heartbeat', payload: { id: CONFIG.agentId } });
      reportStatus();
    }, CONFIG.reportInterval);
    
    setTimeout(reportStatus, 1000);
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'registered') {
        console.log(`[Agent] 注册成功: ${msg.payload.id}`);
      } else if (msg.type === 'message') {
        // 收到消息（渠道功能）
        console.log('[Agent] 收到消息:', msg.payload);
        handleMessage(msg.payload);
      } else if (msg.type === 'task') {
        // 收到任务
        console.log('[Agent] 收到任务:', msg.payload);
        handleTask(msg.payload);
      } else if (msg.type === 'update') {
        // 收到更新命令
        console.log('[Agent] 收到更新命令');
        handleUpdate(msg.payload?.token);
      } else if (msg.type === 'gateway-start') {
        // 启动 Gateway
        console.log('[Agent] 收到启动 Gateway 命令');
        handleGatewayStart(msg.payload?.token);
      } else if (msg.type === 'gateway-stop') {
        // 停止 Gateway
        console.log('[Agent] 收到停止 Gateway 命令');
        handleGatewayStop(msg.payload?.token);
      } else if (msg.type === 'gateway-restart') {
        // 重启 Gateway
        console.log('[Agent] 收到重启 Gateway 命令');
        handleGatewayRestart(msg.payload?.token);
      } else if (msg.type === 'status-request') {
        // 请求重新上报状态
        console.log('[Agent] 收到状态刷新请求');
        reportStatus();
      }
    } catch (e) {
      console.error('[Agent] 解析消息失败:', e.message);
    }
  });
  
  ws.on('close', () => {
    console.log('[Agent] 连接断开，5秒后重连...');
    clearInterval(reconnectTimer);
    setTimeout(connect, 5000);
  });
  
  ws.on('error', (err) => {
    console.error('[Agent] 连接错误:', err.message);
  });
}

// 处理更新
async function handleUpdate(token) {
  // 验证 token（可选）
  if (CONFIG.updateToken && token !== CONFIG.updateToken) {
    console.log('[Agent] 更新令牌无效');
    send({ type: 'update-result', payload: { success: false, error: 'Invalid token' } });
    return;
  }
  
  const result = await doUpdate();
  send({ type: 'update-result', payload: result });
}

// 处理 Gateway 启动命令
async function handleGatewayStart(token) {
  // 验证 token（可选）
  if (CONFIG.updateToken && token !== CONFIG.updateToken) {
    console.log('[Agent] Gateway 启动令牌无效');
    send({ type: 'gateway-result', payload: { action: 'start', success: false, error: 'Invalid token' } });
    return;
  }
  
  const result = await startGateway();
  send({ type: 'gateway-result', payload: { action: 'start', ...result } });
}

// 处理 Gateway 停止命令
async function handleGatewayStop(token) {
  // 验证 token（可选）
  if (CONFIG.updateToken && token !== CONFIG.updateToken) {
    console.log('[Agent] Gateway 停止令牌无效');
    send({ type: 'gateway-result', payload: { action: 'stop', success: false, error: 'Invalid token' } });
    return;
  }
  
  const result = await stopGateway();
  send({ type: 'gateway-result', payload: { action: 'stop', ...result } });
}

// 处理 Gateway 重启命令
async function handleGatewayRestart(token) {
  // 验证 token（可选）
  if (CONFIG.updateToken && token !== CONFIG.updateToken) {
    console.log('[Agent] Gateway 重启令牌无效');
    send({ type: 'gateway-result', payload: { action: 'restart', success: false, error: 'Invalid token' } });
    return;
  }
  
  const result = await restartGateway();
  send({ type: 'gateway-result', payload: { action: 'restart', ...result } });
  
  // 重启后延迟 2 秒上报状态
  setTimeout(reportStatus, 2000);
}

// ──────────────────────────────────────────────
// 渠道功能：消息接收和发送
// ──────────────────────────────────────────────

/**
 * 处理收到的消息（渠道功能）
 */
async function handleMessage(payload) {
  const { from, to, content, timestamp } = payload;
  
  console.log(`[Agent] 收到消息: ${from} -> ${to}: ${content}`);
  
  // TODO: 触发 OpenClaw Gateway 处理消息
  // 可以通过 HTTP API 或 WebSocket 转发给 Gateway
  
  try {
    // 方案1: 调用 Gateway HTTP API
    const http = require('http');
    
    const postData = JSON.stringify({
      channel: 'clawcamp',
      accountId: CONFIG.agentId,
      from: from,
      to: to,
      content: content,
      timestamp: timestamp
    });
    
    const req = http.request({
      hostname: 'localhost',
      port: CONFIG.gatewayPort,
      path: '/api/message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.gatewayToken}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[Agent] 消息已转发给 Gateway');
      });
    });
    
    req.on('error', (e) => {
      console.error('[Agent] 转发消息失败:', e.message);
    });
    
    req.write(postData);
    req.end();
  } catch (e) {
    console.error('[Agent] 处理消息失败:', e.message);
  }
}

/**
 * 处理任务（渠道功能）
 */
async function handleTask(payload) {
  const { id, action, params } = payload;
  
  console.log(`[Agent] 执行任务: ${action}`);
  
  try {
    let result;
    
    switch (action) {
      case 'check-social-monitor':
        // 执行社交媒体监控
        const output = execSync('python3 ~/.openclaw/workspace/scripts/do-social-monitor.py', {
          encoding: 'utf-8',
          timeout: 60000
        });
        result = { success: true, output: output.substring(0, 500) };
        break;
        
      case 'send-email':
        // 发送邮件
        // TODO: 实现邮件发送
        result = { success: true };
        break;
        
      case 'check-health':
        // 健康检查
        const gateway = getGatewayStatus();
        const stats = getSystemStats();
        result = { success: true, gateway, stats };
        break;
        
      default:
        result = { success: false, error: '未知任务' };
    }
    
    // 返回结果
    send({
      type: 'task-result',
      payload: {
        taskId: id,
        ...result
      }
    });
  } catch (e) {
    send({
      type: 'task-result',
      payload: {
        taskId: id,
        success: false,
        error: e.message
      }
    });
  }
}

/**
 * 发送消息（渠道功能）
 */
function sendMessage(to, content) {
  send({
    type: 'message',
    payload: {
      from: CONFIG.agentId,
      to: to,
      content: content,
      timestamp: Date.now()
    }
  });
}

// 启动
console.log('');
console.log(`🦞 龙虾营地 Agent v${AGENT_VERSION}`);
console.log(`   Agent: ${CONFIG.agentName} (${CONFIG.agentId})`);
console.log(`   Hub: ${CONFIG.hubUrl}`);
console.log('');

connect();
