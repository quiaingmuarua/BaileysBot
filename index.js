// WebSocket 长连接 Baileys 服务（Node 18+）
// ACTIONS
// - login:     {action:"login", phoneNumber:"xxxx", waitMs?:30000, requestId?:string}
//              → 第一条: {ok:true, action:"login", phase:"pairing", pairingCode, status:"waiting", ...}
//              → 第二条: {ok:true, action:"login", phase:"final",   pairingCode, status:"connected"|"pending", ...}
// - status:    {action:"status", phoneNumber:"+1xxxx"}
//              → {ok:true, action:"status", phoneNumber, registered, connection, ...}
// - list:      {action:"list"}
//              → {ok:true, action:"list", connections:[...]}
// - disconnect:{action:"disconnect", phoneNumber:"+1xxxx"}
//              → {ok:true, action:"disconnect", phoneNumber}
// - reconnect: {action:"reconnect", phoneNumber:"+1xxxx"}
//              → {ok:true, action:"reconnect", phoneNumber, status}

import { WebSocketServer } from "ws";
import pino from "pino";
import NodeCache from "node-cache";
import {
  default as makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  Browsers,
} from "./baileys/lib/index.js"; // 如使用 npm 版请改为: from "baileys"

const logger = pino({ level: "info" });
const silent = pino({ level: "silent" });
const msgRetryCounterCache = new NodeCache();

/* -------------------- 连接管理器 -------------------- */

class ConnectionManager {
  constructor() {
    this.connections = new Map(); // phoneNumber -> connectionInfo
  }

  // 创建或获取连接
  async getOrCreateConnection(phoneNumber) {
    if (this.connections.has(phoneNumber)) {
      const conn = this.connections.get(phoneNumber);
      if (conn.status === 'connected' || conn.status === 'connecting') {
        return conn;
      }
    }

    return await this.createConnection(phoneNumber);
  }

  // 创建新连接
  async createConnection(phoneNumber) {
    logger.info({ phoneNumber }, "🔄 创建新的长连接...");
    
    const authPath = `AUTH/${phoneNumber}`;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: silent,
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silent),
      },
      msgRetryCounterCache,
    });

    const connectionInfo = {
      phoneNumber,
      sock,
      state,
      saveCreds,
      status: 'connecting',
      createdAt: new Date(),
      lastActivity: new Date(),
      isRegistered: !!state?.creds?.registered,
      pairingCode: null,
      heartbeatTimer: null,
      events: [],
    };

    // 设置事件监听
    this.setupConnectionEvents(connectionInfo);
    
    this.connections.set(phoneNumber, connectionInfo);
    logger.info({ phoneNumber }, "✅ 长连接已创建");
    
    return connectionInfo;
  }

  // 设置连接事件监听
  setupConnectionEvents(connectionInfo) {
    const { phoneNumber, sock } = connectionInfo;

    sock.ev.on("creds.update", connectionInfo.saveCreds);

    // 使用 process 方法处理事件（和 example.js 保持一致）
    sock.ev.process(async (events) => {
      // 处理连接状态更新
      if (events["connection.update"]) {
        const update = events["connection.update"];
        const { connection, lastDisconnect, qr } = update;
        connectionInfo.lastActivity = new Date();
        
        logger.info({ phoneNumber, connection }, `🔄 连接状态更新: ${connection}`);
        
        if (connection === "open") {
          connectionInfo.status = 'connected';
          logger.info({ phoneNumber }, "✅ 连接已建立！");
        } else if (connection === "close") {
          connectionInfo.status = 'disconnected';
          logger.info({ phoneNumber }, "❌ 连接已断开");
          
          // 自动重连逻辑（和 example.js 类似）
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
          if (shouldReconnect) {
            logger.info({ phoneNumber }, "🔄 准备自动重连...");
            setTimeout(() => {
              if (this.connections.has(phoneNumber)) {
                this.reconnect(phoneNumber);
              }
            }, 5000);
          }
        } else if (connection === "connecting") {
          connectionInfo.status = 'connecting';
        }

        if (qr) {
          connectionInfo.qr = qr;
          logger.info({ phoneNumber }, "📱 QR码已生成");
        }
      }

      // 处理接收到的消息
      if (events["messages.upsert"]) {
        const upsert = events["messages.upsert"];
        connectionInfo.lastActivity = new Date();
        logger.info({ phoneNumber, msgCount: upsert.messages.length }, "📨 收到消息");
      }
    });
  }

  // 重连
  async reconnect(phoneNumber) {
    logger.info({ phoneNumber }, "🔄 开始重连...");
    await this.disconnect(phoneNumber);
    return await this.createConnection(phoneNumber);
  }

  // 断开连接
  async disconnect(phoneNumber) {
    const conn = this.connections.get(phoneNumber);
    if (!conn) return;

    logger.info({ phoneNumber }, "🔌 断开连接...");
    
    try {
      if (conn.heartbeatTimer) {
        clearInterval(conn.heartbeatTimer);
      }
      conn.sock.ev.removeAllListeners();
      await conn.sock.ws?.close?.();
      await conn.saveCreds();
    } catch (e) {
      logger.warn({ phoneNumber, error: e.message }, "断开连接时出错");
    }

    this.connections.delete(phoneNumber);
    logger.info({ phoneNumber }, "✅ 连接已清理");
  }

  // 获取连接信息
  getConnection(phoneNumber) {
    return this.connections.get(phoneNumber);
  }

  // 获取所有连接
  getAllConnections() {
    return Array.from(this.connections.values()).map(conn => ({
      phoneNumber: conn.phoneNumber,
      status: conn.status,
      isRegistered: conn.isRegistered,
      createdAt: conn.createdAt,
      lastActivity: conn.lastActivity,
    }));
  }

  // 生成配对码
  async requestPairingCode(phoneNumber) {
    const conn = await this.getOrCreateConnection(phoneNumber);
    
    if (conn.isRegistered) {
      logger.info({ phoneNumber }, "账号已注册，无需配对码");
      return null;
    }

    // 立即生成配对码，不等待WebSocket连接（和example.js保持一致）
    const pairingCode = await conn.sock.requestPairingCode(phoneNumber);
    conn.pairingCode = pairingCode;
    
    logger.info({ phoneNumber, pairingCode }, "🔑 配对码已生成");
    return pairingCode;
  }

  // 等待连接建立
  async waitForConnection(phoneNumber, waitMs = 30000) {
    const conn = this.getConnection(phoneNumber);
    if (!conn) throw new Error("连接不存在");

    if (conn.status === 'connected') {
      return 'connected';
    }

    return new Promise((resolve) => {
      let done = false;
      let heartbeatCount = 0;
      
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        clearInterval(heartbeatTimer);
        logger.info({ phoneNumber }, "⏰ 等待连接超时");
        resolve("pending");
      }, waitMs);

      // 心跳监控
      const heartbeatTimer = setInterval(() => {
        if (done) return;
        heartbeatCount++;
        const elapsed = heartbeatCount * 5;
        const remaining = Math.max(0, Math.ceil((waitMs - elapsed * 1000) / 1000));
        
        // 检查状态是否已更新
        if (conn.status === 'connected') {
          done = true;
          clearTimeout(timer);
          clearInterval(heartbeatTimer);
          logger.info({ phoneNumber }, "✅ 连接建立成功！");
          resolve("connected");
          return;
        }
        
        logger.info({ 
          phoneNumber, 
          elapsed: `${elapsed}s`, 
          remaining: `${remaining}s`,
          heartbeat: heartbeatCount,
          status: conn.status
        }, "💓 等待连接中...");
      }, 5000);

      // 首次检查，可能已经连接了
      if (conn.status === 'connected') {
        done = true;
        clearTimeout(timer);
        clearInterval(heartbeatTimer);
        resolve("connected");
      }
    });
  }
}

const connectionManager = new ConnectionManager();

/* -------------------- 工具函数 -------------------- */

function normalizePhone(phone) {
  if (typeof phone !== "string" || !/^\+?\d{6,}$/.test(phone)) {
    throw new Error("phoneNumber 格式不正确（请包含国家码，如 +1xxxxxxxxxx）");
  }
  return phone;
}

function sendJSON(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// 同手机号串行互斥，避免 AUTH 目录竞态
const phoneLocks = new Map(); // phone -> Promise
async function withPhoneLock(phone, fn) {
  const prev = phoneLocks.get(phone) || Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  phoneLocks.set(phone, prev.then(() => next));
  try {
    return await fn();
  } finally {
    release(); // 释放
    if (phoneLocks.get(phone) === next) phoneLocks.delete(phone);
  }
}


/* -------------------- WebSocket 服务器 -------------------- */

const PORT = process.env.PORT || 3001;
const wss = new WebSocketServer({ port: PORT });
logger.info(`WS server listening on ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  // 初始问候
  sendJSON(ws, { ok: true, hello: "ready", actions: ["login", "status", "list", "disconnect", "reconnect"] });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendJSON(ws, { ok: false, error: "invalid JSON" });
    }

    const { action } = msg || {};
    if (!action) return sendJSON(ws, { ok: false, error: "missing action" });

    try {
      /* ---------- 登录：使用长连接管理器 ---------- */
      if (action === "login") {
        const { phoneNumber: pn, waitMs = 30000, requestId } = msg;
        const phoneNumber = normalizePhone(pn);

        await withPhoneLock(phoneNumber, async () => {
          try {
            logger.info({ phoneNumber }, "🚀 开始登录流程（长连接模式）...");
            
            // 1) 获取或创建连接
            const conn = await connectionManager.getOrCreateConnection(phoneNumber);
            
            // 2) 生成配对码（如果需要）
            let pairingCode = null;
            if (!conn.isRegistered) {
              logger.info({ phoneNumber }, "📱 正在生成配对码...");
              pairingCode = await connectionManager.requestPairingCode(phoneNumber);
            } else {
              logger.info({ phoneNumber }, "✅ 已注册账号，无需配对码");
            }

            // 3) 立即推送第一条（显示配对码 + 等待中）
            logger.info({ phoneNumber }, "📤 推送配对码给客户端...");
            sendJSON(ws, {
              ok: true,
              action: "login",
              phase: "pairing",
              phoneNumber,
              pairingCode,
              status: "waiting",
              requestId,
            });

            // 4) 等待连接建立
            const status = await connectionManager.waitForConnection(phoneNumber, waitMs);

            // 5) 推送最终状态
            logger.info({ phoneNumber, status }, `📡 推送最终状态: ${status}`);
            sendJSON(ws, {
              ok: true,
              action: "login",
              phase: "final",
              phoneNumber,
              pairingCode,
              status,
              requestId,
            });
            
            if (status === "connected") {
              logger.info({ phoneNumber }, "🎉 登录成功！连接将保持活跃");
            } else {
              logger.info({ phoneNumber }, "⚠️ 登录超时，连接仍在后台运行");
            }
          } catch (e) {
            logger.error({ phoneNumber, error: e.message }, "❌ 登录过程中出错");
            sendJSON(ws, {
              ok: false,
              action: "login",
              phoneNumber,
              error: String(e?.message || e),
              requestId,
            });
          }
        });

        return;
      }

      /* ---------- 列出所有连接 ---------- */
      if (action === "list") {
        const connections = connectionManager.getAllConnections();
        logger.info({ count: connections.length }, "📋 列出所有连接");
        
        return sendJSON(ws, {
          ok: true,
          action: "list",
          connections,
          count: connections.length,
        });
      }

      /* ---------- 断开连接 ---------- */
      if (action === "disconnect") {
        const { phoneNumber: pn } = msg;
        const phoneNumber = normalizePhone(pn);
        
        logger.info({ phoneNumber }, "🔌 断开连接请求");
        await connectionManager.disconnect(phoneNumber);
        
        return sendJSON(ws, {
          ok: true,
          action: "disconnect",
          phoneNumber,
        });
      }

      /* ---------- 重新连接 ---------- */
      if (action === "reconnect") {
        const { phoneNumber: pn } = msg;
        const phoneNumber = normalizePhone(pn);
        
        try {
          logger.info({ phoneNumber }, "🔄 重新连接请求");
          const conn = await connectionManager.reconnect(phoneNumber);
          
          return sendJSON(ws, {
            ok: true,
            action: "reconnect",
            phoneNumber,
            status: conn.status,
          });
        } catch (e) {
          logger.error({ phoneNumber, error: e.message }, "❌ 重连失败");
          return sendJSON(ws, {
            ok: false,
            action: "reconnect",
            phoneNumber,
            error: String(e?.message || e),
          });
        }
      }

      /* ---------- 状态：检查连接状态 ---------- */
      if (action === "status") {
        const { phoneNumber: pn } = msg;
        const phoneNumber = normalizePhone(pn);

        logger.info({ phoneNumber }, "📋 查询连接状态");
        
        const conn = connectionManager.getConnection(phoneNumber);
        
        if (!conn) {
          // 如果没有活跃连接，检查是否有认证文件
          try {
            const authPath = `AUTH/${phoneNumber}`;
            const { state } = await useMultiFileAuthState(authPath);
            const registered = !!state?.creds?.registered;
            
            return sendJSON(ws, {
              ok: true,
              action: "status",
              phoneNumber,
              registered,
              connection: "disconnected",
              hasAuth: registered,
            });
          } catch (e) {
            return sendJSON(ws, {
              ok: true,
              action: "status",
              phoneNumber,
              registered: false,
              connection: "disconnected",
              hasAuth: false,
            });
          }
        }

        // 有活跃连接
        return sendJSON(ws, {
          ok: true,
          action: "status",
          phoneNumber,
          registered: conn.isRegistered,
          connection: conn.status,
          createdAt: conn.createdAt,
          lastActivity: conn.lastActivity,
          pairingCode: conn.pairingCode,
        });
      }


      // 未知动作
      return sendJSON(ws, { ok: false, error: "unknown action" });
    } catch (e) {
      logger.error(e, "WS action error");
      return sendJSON(ws, { ok: false, error: String(e?.message || e) });
    }
  });
});

/* -------------------- 进程信号 -------------------- */

process.on("SIGINT", async () => {
  logger.info("SIGINT, shutting down...");
  
  // 清理所有连接
  const connections = connectionManager.getAllConnections();
  logger.info({ count: connections.length }, "🧹 清理所有连接...");
  
  for (const conn of connections) {
    try {
      await connectionManager.disconnect(conn.phoneNumber);
    } catch (e) {
      logger.warn({ phoneNumber: conn.phoneNumber, error: e.message }, "清理连接时出错");
    }
  }
  
  wss.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException");
  process.exit(1);
});

process.on("unhandledRejection", (reason, p) => {
  logger.error({ reason, p }, "unhandledRejection");
});
