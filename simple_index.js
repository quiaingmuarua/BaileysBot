// 🚀 Baileys WebSocket 配对服务器 - 完全模仿 example.js 的成功架构
import { WebSocketServer } from "ws";
import fs from 'fs';
import {
  default as makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
} from "./baileys/lib/index.js";

const ConsoleLogger = {
  level: "info",
  child() { return this; },
  info:  (...a) => console.log (...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
  debug: (...a) => console.debug(...a),
  trace: (...a) => console.debug(...a),
};

function sendJSON(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// 清理 AUTH 目录
function clearAuthDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

// 🔥 彻底重构 - 完全模仿 example.js 的执行流程，不使用 Promise 包装
async function simplePairing(phoneNumber, maxRetries = 5) {
  const authPath = `AUTH/ws_${phoneNumber}`;
  
  console.log(`[${phoneNumber}] 🚀 开始配对流程... (剩余重试: ${maxRetries})`);
  console.log(`[${phoneNumber}] 📂 AUTH路径: ${authPath}`);
  
  let { state, saveCreds } = await useMultiFileAuthState(authPath);
  let { version, isLatest } = await fetchLatestBaileysVersion();
  
  console.log(`[${phoneNumber}] 📋 已注册状态:`, !!state?.creds?.registered);
  console.log(`[${phoneNumber}] 📱 WhatsApp版本: v${version.join(".")}, 是最新版本: ${isLatest}`);
  
  // 完全按照 example.js 的配置，使用静态导入
  const NodeCache = (await import("node-cache")).default;
  const msgRetryCounterCache = new NodeCache();
  
  const P = { level: "silent", child() { return this; }, info() {}, warn() {}, error() {}, debug() {}, trace() {} };
  
  console.log(`[${phoneNumber}] 🔌 创建 WhatsApp socket...`);
  const sock = makeWASocket({
    version,
    logger: P,
    printQRInTerminal: false,
    browser: Browsers.macOS("Safari"),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P),
    },
    msgRetryCounterCache,
  });

  console.log(`[${phoneNumber}] 💾 设置凭据自动保存...`);
  sock.ev.on("creds.update", saveCreds);
  
  // 🔥 关键：像 example.js 一样，立即处理配对码，不在 Promise 内部
  let pairingCode = null;
  if (!sock.authState.creds.registered) {
    try {
      console.log(`[${phoneNumber}] 🔍 账号未注册，开始配对流程...`);
      console.log(`[${phoneNumber}] 📞 手机号: ${phoneNumber}`);
      console.log(`[${phoneNumber}] 🔗 当前连接状态:`, sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");
      
      console.log(`[${phoneNumber}] 📝 正在请求配对码...`);
      pairingCode = await sock.requestPairingCode(phoneNumber); // 完全像 example.js，在主流程中执行
      console.log(`[${phoneNumber}] 🔑 配对码生成成功: ${pairingCode}`);
      console.log(`[${phoneNumber}] 🔗 配对码生成后连接状态:`, sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");
      console.log(`[${phoneNumber}] ⏳ 等待用户在 WhatsApp 中输入配对码...`);
    } catch (e) {
      console.log(`[${phoneNumber}] ⚠️ 配对码生成错误:`, e.message);
      if (sock.authState?.creds?.pairingCode) {
        pairingCode = sock.authState.creds.pairingCode;
        console.log(`[${phoneNumber}] 🔑 配对码(容错): ${pairingCode}`);
      } else {
        return {
          pairingCode: null,
          status: "failed", 
          message: `配对码生成失败: ${e.message}`
        };
      }
    }
  } else {
    console.log(`[${phoneNumber}] ✅ 已注册，等待连接...`);
  }
  
  // 现在像 example.js 一样，设置事件处理并返回 Promise
  return new Promise((resolve, reject) => {
    let isResolved = false;
    let connectionTimeout = null;
    
    function safeResolve(result) {
      if (!isResolved) {
        isResolved = true;
        if (connectionTimeout) clearTimeout(connectionTimeout);
        resolve(result);
      }
    }
    
    // 设置30秒超时
    const timeoutMs = 30000;
    connectionTimeout = setTimeout(() => {
      console.log(`[${phoneNumber}] ⏰ 30秒超时`);
      safeResolve({ 
        pairingCode, 
        status: "pending", 
        message: "等待超时，但连接仍在后台运行" 
      });
    }, timeoutMs);
    
    // 完全按照 example.js 的事件处理方式
    sock.ev.process(async events => {
      if (events["connection.update"]) {
        const update = events["connection.update"];
        const { connection, lastDisconnect } = update;
        
        console.log(`[${phoneNumber}] 🔄 连接状态更新:`, connection);
        
        if (connection === "connecting") {
          console.log(`[${phoneNumber}] 🔗 正在连接到 WhatsApp...`);
        }
        
        if (connection === "open") {
          console.log(`[${phoneNumber}] ✅ WhatsApp 连接已建立！`);
          console.log(`[${phoneNumber}] 📱 已注册:`, !!sock.authState?.creds?.registered);
          safeResolve({ 
            pairingCode, 
            status: "connected", 
            message: "配对成功！" 
          });
          return;
        }
        
        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          const restartRequired = code === DisconnectReason.restartRequired;
          
          console.log(`[${phoneNumber}] ❌ 连接关闭:`);
          console.log(`   错误代码: ${code}`);
          console.log(`   loggedOut: ${loggedOut}`);
          console.log(`   restartRequired: ${restartRequired}`);
          
          // 完全按照 example.js 的逻辑
          if (restartRequired) {
            console.log(`[${phoneNumber}] ✅ 配对成功！WhatsApp 要求重启连接，这是正常的`);
            console.log(`[${phoneNumber}] 🔄 等待自动重新连接...`);
          } else if (loggedOut) {
            console.log(`[${phoneNumber}] 🚪 账号已登出，停止重连`);
            safeResolve({
              pairingCode,
              status: "failed",
              message: "账号已登出"
            });
            return;
          }
          
          // 按照 example.js：所有连接关闭都走重连逻辑（除了明确的 loggedOut）
          const shouldReconnect = lastDisconnect && 
                                 lastDisconnect.error && 
                                 lastDisconnect.error.output && 
                                 lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect) {
            if (maxRetries <= 0) {
              console.log(`[${phoneNumber}] ❌ 重试次数已用完`);
              safeResolve({
                pairingCode,
                status: "failed",
                message: "重试次数已用完"
              });
              return;
            }
            
            console.log(`[${phoneNumber}] 🔄 连接已断开，尝试重新连接... 剩余重试: ${maxRetries - 1}`);
            
            if (connectionTimeout) {
              clearTimeout(connectionTimeout);
              connectionTimeout = null;
            }
            
            setTimeout(() => {
              if (!isResolved) {
                simplePairing(phoneNumber, maxRetries - 1).then(safeResolve).catch(reject);
              }
            }, 5000);
            return;
          } else {
            console.log(`[${phoneNumber}] 🛑 连接已关闭`);
            safeResolve({
              pairingCode,
              status: "failed",
              message: `连接失败 (code=${code})`
            });
          }
        }
      }
    });
  });
}

const PORT = 3002; // 避免端口冲突
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 Baileys WebSocket 配对服务器启动: ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  sendJSON(ws, { ok: true, hello: "baileys-pairing-server", actions: ["pair"] });

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return sendJSON(ws, { ok: false, error: "invalid JSON" }); }

    const { action, phoneNumber, requestId } = msg || {};

    if (action === "pair" && phoneNumber) {
      try {
        console.log(`\n============ 开始配对 ${phoneNumber} ============`);

        // 立即返回开始状态
        sendJSON(ws, {
          ok: true,
          action: "pair",
          phase: "starting",
          phoneNumber,
          requestId,
        });

        const startTime = Date.now();
        const result = await simplePairing(phoneNumber);
        const elapsed = Date.now() - startTime;

        console.log(`\n📊 配对完成 (耗时: ${elapsed}ms):`);
        console.log(`   状态: ${result.status}`);
        console.log(`   配对码: ${result.pairingCode || '无'}`);
        console.log(`   消息: ${result.message}`);

        // 返回最终结果
        sendJSON(ws, {
          ok: true,
          action: "pair",
          phase: "final",
          phoneNumber,
          pairingCode: result.pairingCode,
          status: result.status,
          message: result.message,
          elapsed: elapsed,
          requestId,
        });

      } catch (e) {
        console.error(`❌ 配对异常:`, e);
        sendJSON(ws, {
          ok: false,
          action: "pair",
          phoneNumber,
          error: e.message,
          requestId,
        });
      }
    } else {
      sendJSON(ws, { ok: false, error: "unknown action or missing phoneNumber" });
    }
  });
});

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务器...');
  wss.close(() => {
    console.log('🔌 服务器已关闭');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

console.log('📋 使用方法:');
console.log('   1. 启动此服务器: node simple_index.js');
console.log('   2. 使用客户端连接: node simple_client.js [手机号]');
console.log('   3. 或使用测试工具: node test_fix.js [手机号]');
console.log('\n🔄 配对流程：客户端请求 → 生成配对码 → 用户输入 → 连接验证 → 返回结果');
console.log('⏳ 等待客户端连接...\n');
