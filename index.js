// index.js - WebSocket 服务器
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { handleAccountLogin, getCacheStatus } from './accountHandler.js';

const PORT = process.env.WS_PORT || 8001;
const HOST = process.env.HOST || '127.0.0.1';

// 创建 HTTP 服务器
const server = createServer();

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ 
  server,
  path: '/ws' // WebSocket 端点路径
});

// 连接管理
const connections = new Map();
let connectionId = 0;

/**
 * 统一的消息发送方法
 * @param {WebSocket} ws - WebSocket 连接
 * @param {string} type - 消息类型
 * @param {Object} data - 消息数据
 * @param {string} [msgId] - 消息ID（用于回传）
 * @param {string} [error] - 错误信息
 * @param {number} [code] - 状态码
 */
function sendMessage(ws, type, data = null, msgId = null, error = null, code = null) {
  const message = {
    type,
    timestamp: new Date().toISOString()
  };
  
  // 添加 msgId（如果提供）
  if (msgId) {
    message.msgId = msgId;
  }
  
  // 添加数据（如果提供）
  if (data !== null) {
    message.data = data;
  }
  
  // 添加错误信息（如果提供）
  if (error !== null) {
    message.error = error;
  }
  
  // 添加状态码（如果提供）
  if (code !== null) {
    message.code = code;
  }

  ws.send(JSON.stringify(message));
}

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  const clientId = ++connectionId;
  connections.set(clientId, ws);
  
  console.log(`🔌 WebSocket 客户端 ${clientId} 已连接 (${req.socket.remoteAddress})`);
  
  // 发送欢迎消息
  sendMessage(ws, 'connected', {
    clientId,
    message: 'WebSocket 连接成功',
  });

  // 处理收到的消息
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 客户端 ${clientId} 发送消息:`, message);

      const msgId = message.msgId; // 提取消息ID用于回传

      // 处理不同类型的消息
      switch (message.type) {
        case 'account_login':
          sendMessage(ws, "ack", message.data,msgId)
          await handleAccountLoginWebSocket(ws, clientId, message.data, msgId);
          break;
          
        case 'ping':
          sendMessage(ws, 'pong', null, msgId);
          break;
          
        case 'get_status':
          sendMessage(ws, 'status', getCacheStatus(), msgId);
          break;
          
        default:
          sendMessage(ws, 'error', null, msgId, `未知的消息类型: ${message.type}`);
      }
    } catch (error) {
      console.error(`❌ 客户端 ${clientId} 消息解析错误:`, error);
      sendMessage(ws, 'error', null, null, '消息格式错误');
    }
  });

  // 处理连接关闭
  ws.on('close', (code, reason) => {
    console.log(`🔌 客户端 ${clientId} 断开连接 (code: ${code}, reason: ${reason?.toString()})`);
    connections.delete(clientId);
  });

  // 处理连接错误
  ws.on('error', (error) => {
    console.error(`❌ 客户端 ${clientId} 连接错误:`, error);
    connections.delete(clientId);
  });
});

/**
 * 处理 WebSocket 账户登录请求
 */
async function handleAccountLoginWebSocket(ws, clientId, params, msgId) {
  console.log(`🚀 客户端 ${clientId} 请求账户登录:`, params, `(msgId: ${msgId})`);

  await handleAccountLogin(params, {
    onResponse: (result) => {
      sendMessage(ws, 'account_login', result, msgId);
    },
    onError: (error) => {
      sendMessage(ws, 'log', null, msgId, error.error || 'Internal Server Error', error.code || 500);
    },
    onOutput: (chunk, stream) => {
      if(params.env === "dev"){
        // 实时转发日志到 WebSocket 客户端
      sendMessage(ws, 'log', {
        content: chunk.trim(),
        stream,
      }, msgId);
      }

    }
  });
}

// 健康检查端点（通过 HTTP）
server.on('request', (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      ok: true, 
      connections: connections.size,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

// 启动服务器
server.listen(PORT, HOST, () => {
  console.log(`✅ WebSocket 服务器启动成功`);
  console.log(`🌐 WebSocket 地址: ws://${HOST}:${PORT}/ws`);
  console.log(`🔍 健康检查: http://${HOST}:${PORT}/health`);
}).on('error', (err) => {
  console.error('❌ WebSocket 服务器启动失败:', err);
  if (err.code === 'EACCES') {
    console.error('💡 解决方案:');
    console.error('   1. 以管理员身份运行');
    console.error('   2. 或者修改 WS_PORT 环境变量为更高的端口');
    console.error('   3. 当前使用端口:', PORT);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`💡 端口 ${PORT} 已被占用，请关闭占用该端口的程序`);
  }
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🔄 正在关闭 WebSocket 服务器...');
  
  // 通知所有客户端服务器即将关闭
  connections.forEach((ws, clientId) => {
    if (ws.readyState === ws.OPEN) {
      sendMessage(ws, 'server_shutdown', { message: '服务器即将关闭' });
      ws.close(1001, 'Server shutdown');
    }
  });
  
  server.close(() => {
    console.log('✅ WebSocket 服务器已关闭');
    process.exit(0);
  });
});

export { wss, connections };
