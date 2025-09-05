// WebSocket 长连接 Baileys 服务（Node 18+）
// ACTIONS
// - login:     {action:"login", phoneNumber:"+1xxxx", waitMs?:30000, requestId?:string}
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

import {WebSocketServer} from "ws";
import pino from "pino";
import NodeCache from "node-cache";
import {
  Browsers,
  default as makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "./baileys/lib/index.js"; // 如用 npm 版改为: "baileys"

const logger = pino({ level: "info" });
const silent = pino({ level: "silent" });

// Baileys 推荐：缓存消息重试计数
const msgRetryCounterCache = new NodeCache();

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

// 等待 Baileys 底层 ws 打开，避免 428/Connection Closed
function waitWsOpen(sock, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    try {
      if (sock?.ws?.readyState === 1) return resolve(); // 1 = OPEN
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error("WS closed before open"));
      };
      const onError = (err) => {
        cleanup();
        reject(err || new Error("WS error before open"));
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("WS open timeout"));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        try {
          sock.ws?.off?.("open", onOpen);
        } catch {
        }
        try {
          sock.ws?.off?.("close", onClose);
        } catch {
        }
        try {
          sock.ws?.off?.("error", onError);
        } catch {
        }
      }

      sock.ws?.on?.("open", onOpen);
      sock.ws?.on?.("close", onClose);
      sock.ws?.on?.("error", onError);
    } catch (e) {
      reject(e);
    }
  });
}

// 等待 connection.update=open 或超时，返回 "connected"|"pending"
function waitForOpenOnce(sock, waitMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        sock.ev.off("connection.update", onUpdate);
      } catch {
      }
      resolve("pending");
    }, waitMs);

    const onUpdate = (u) => {
      if (done) return;
      if (u.connection === "open") {
        done = true;
        clearTimeout(timer);
        try {
          sock.ev.off("connection.update", onUpdate);
        } catch {
        }
        resolve("connected");
      }
      // close 情况保持等待，让用户还能在手机端操作直到超时
    };
    sock.ev.on("connection.update", onUpdate);
  });
}

// 单号互斥，避免 AUTH/<phone> 目录竞态
const phoneLocks = new Map(); // phone -> Promise
async function withPhoneLock(phone, fn) {
  const prev = phoneLocks.get(phone) || Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  phoneLocks.set(phone, prev.then(() => next));
  try {
    return await fn();
  } finally {
    release();
    if (phoneLocks.get(phone) === next) phoneLocks.delete(phone);
  }
}

/* -------------------- 会话管理 -------------------- */

const sessions = new Map(); // phoneNumber -> Session

function sessionSummary(s) {
  return {
    phoneNumber: s.phoneNumber,
    registered: !!s.registered,
    connection: s.lastConnection || "disconnected",
    retriesLeft: s.retriesLeft,
    autoReconnect: s.autoReconnect,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function ensureSession(phoneNumber) {
  phoneNumber = normalizePhone(phoneNumber);

  if (sessions.has(phoneNumber)) {
    return sessions.get(phoneNumber);
  }

  return await withPhoneLock(phoneNumber, async () => {
    if (sessions.has(phoneNumber)) return sessions.get(phoneNumber);

    const authPath = `AUTH/${phoneNumber}`;
    const {state, saveCreds} = await useMultiFileAuthState(authPath);
    const {version} = await fetchLatestBaileysVersion();

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

    const session = {
      phoneNumber,
      authPath,
      sock,
      saveCreds,
      registered: !!state?.creds?.registered,
      lastConnection: "connecting",
      retriesLeft: 5,
      autoReconnect: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    sessions.set(phoneNumber, session);

    // 自动保存凭据
    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch {
      }
      session.registered = !!sock.authState?.creds?.registered;
      session.updatedAt = Date.now();
    });

    // 连接状态与重连策略
    sock.ev.process(async (events) => {
      if (events["connection.update"]) {
        const update = events["connection.update"];
        const {connection, lastDisconnect} = update;

        if (connection) {
          session.lastConnection = connection;
          session.updatedAt = Date.now();
        }

        if (connection === "open") {
          session.retriesLeft = 5;
          session.registered = !!sock.authState?.creds?.registered;
          logger.info({phoneNumber}, "连接已建立");
        }

        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;

          logger.warn({phoneNumber, code, loggedOut}, "连接关闭");

          if (!loggedOut && session.autoReconnect && session.retriesLeft > 0) {
            session.retriesLeft -= 1;
            const delay = 3000; // 简单固定重连间隔；可改指数退避
            logger.warn({phoneNumber, retriesLeft: session.retriesLeft}, "准备重连");
            setTimeout(() => {
              // 仅当还在 sessions 且允许重连时才重建
              if (sessions.get(phoneNumber) === session && session.autoReconnect) {
                // 重新建立 socket
                recreateSocket(session).catch((e) =>
                    logger.error({phoneNumber, err: e}, "重连失败")
                );
              }
            }, delay);
          }
        }
      }
    });

    return session;
  });
}

async function recreateSocket(session) {
  const {phoneNumber, authPath} = session;
  const {state, saveCreds} = await useMultiFileAuthState(authPath);
  const {version} = await fetchLatestBaileysVersion();

  // 关闭旧的
  try {
    session.sock.ev.removeAllListeners();
  } catch {
  }
  try {
    await session.sock.ws?.close?.();
  } catch {
  }

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

  session.sock = sock;
  session.saveCreds = saveCreds;
  session.lastConnection = "connecting";
  session.updatedAt = Date.now();

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
    } catch {
    }
    session.registered = !!sock.authState?.creds?.registered;
    session.updatedAt = Date.now();
  });

  sock.ev.process(async (events) => {
    if (events["connection.update"]) {
      const update = events["connection.update"];
      const {connection, lastDisconnect} = update;

      if (connection) {
        session.lastConnection = connection;
        session.updatedAt = Date.now();
      }

      if (connection === "open") {
        session.retriesLeft = 5;
        session.registered = !!sock.authState?.creds?.registered;
        logger.info({phoneNumber}, "重连成功");
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        logger.warn({phoneNumber, code, loggedOut}, "重连后连接关闭");

        if (!loggedOut && session.autoReconnect && session.retriesLeft > 0) {
          session.retriesLeft -= 1;
          setTimeout(() => {
            if (sessions.get(phoneNumber) === session && session.autoReconnect) {
              recreateSocket(session).catch((e) =>
                  logger.error({phoneNumber, err: e}, "再次重连失败")
              );
            }
          }, 3000);
        }
      }
    }
  });

  return session;
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
      if (action === "login") {
        const {phoneNumber: pn, waitMs = 30000, requestId} = msg;
        const phoneNumber = normalizePhone(pn);

        const session = await ensureSession(phoneNumber);

        // 严格等待到底层连接 open（任一策略成功即算 open）
        try {
          await Promise.race([
            waitWsOpen(session.sock, 10000),
            waitConnUpdateOpen(session.sock, 15000)
          ]);
        } catch (err) {
          return sendJSON(ws, {
            ok: false,
            action: "login",
            phoneNumber,
            error: "socket-not-open: " + (err?.message || String(err))
          });
        }

        session.registered = !!session.sock.authState?.creds?.registered;

        let pairingCode = null;
        if (!session.registered) {
          try {
            pairingCode = await session.sock.requestPairingCode(phoneNumber);
            logger.info({phoneNumber, pairingCode}, "配对码已生成");
          } catch (e) {
            logger.error({phoneNumber, err: e}, "生成配对码失败");
            return sendJSON(ws, {
              ok: false,
              action: "login",
              phoneNumber,
              error: "pairing-failed: " + (e?.message || String(e))
            });
          }
        }

        // 第一条：立即回配对码
        sendJSON(ws, {
          ok: true,
          action: "login",
          phase: "pairing",
          phoneNumber,
          pairingCode,
          status: session.registered ? "already-registered" : "waiting",
          requestId,
        });

        // 第二条：等最多 waitMs 看是否 open（配对成功）
        const status = await waitForOpenOnce(session.sock, waitMs);
        sendJSON(ws, {
          ok: true,
          action: "login",
          phase: "final",
          phoneNumber,
          pairingCode,
          status, // "connected" | "pending"
          requestId,
        });

        return;
      }


      /* ---------- status：返回账号状态 ---------- */
      if (action === "status") {
        const { phoneNumber: pn } = msg;
        const phoneNumber = normalizePhone(pn);

        if (sessions.has(phoneNumber)) {
          const s = sessions.get(phoneNumber);
          // 同步一下 registered
          s.registered = !!s.sock.authState?.creds?.registered;
          return sendJSON(ws, {
            ok: true,
            action: "status",
            phoneNumber,
            registered: s.registered,
            connection: s.lastConnection || "disconnected",
          });
        }

        // 若内存中没有会话，读本地凭据判断是否已注册
        const {state} = await useMultiFileAuthState(`AUTH/${phoneNumber}`);
        return sendJSON(ws, {
          ok: true,
          action: "status",
          phoneNumber,
          registered: !!state?.creds?.registered,
          connection: "disconnected",
        });
      }

      /* ---------- list：列出所有在线会话 ---------- */
      if (action === "list") {
        const connections = Array.from(sessions.values()).map(sessionSummary);
        return sendJSON(ws, {ok: true, action: "list", connections});
      }

      /* ---------- disconnect：手动断开某个号码 ---------- */
      if (action === "disconnect") {
        const {phoneNumber: pn} = msg;
        const phoneNumber = normalizePhone(pn);

        if (!sessions.has(phoneNumber)) {
          return sendJSON(ws, {ok: true, action: "disconnect", phoneNumber, note: "not-found"});
        }

        const s = sessions.get(phoneNumber);
        s.autoReconnect = false; // 禁止自动重连
        try {
          s.sock.ev.removeAllListeners();
        } catch {
        }
        try {
          await s.sock.ws?.close?.();
        } catch {
        }
        sessions.delete(phoneNumber);

        return sendJSON(ws, {ok: true, action: "disconnect", phoneNumber});
      }

      /* ---------- reconnect：重建连接（若无内存会话则新建） ---------- */
      if (action === "reconnect") {
        const {phoneNumber: pn} = msg;
        const phoneNumber = normalizePhone(pn);

        if (sessions.has(phoneNumber)) {
          const s = sessions.get(phoneNumber);
          s.autoReconnect = true;
          await recreateSocket(s);
          // 尝试快速等 5s
          let status = "connecting";
          try {
            const r = await waitForOpenOnce(s.sock, 5000);
            status = r === "connected" ? "connected" : "pending";
          } catch { /* 忽略 */
          }
          return sendJSON(ws, {ok: true, action: "reconnect", phoneNumber, status});
        } else {
          const s = await ensureSession(phoneNumber);
          let status = "connecting";
          try {
            const r = await waitForOpenOnce(s.sock, 5000);
            status = r === "connected" ? "connected" : "pending";
          } catch { /* 忽略 */
          }
          return sendJSON(ws, {ok: true, action: "reconnect", phoneNumber, status});
        }
      }

      /* ---------- 未知动作 ---------- */
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
  for (const [, s] of sessions) {
    s.autoReconnect = false;
    try {
      s.sock.ev.removeAllListeners();
    } catch {
    }
    try {
      await s.sock.ws?.close?.();
    } catch {
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
