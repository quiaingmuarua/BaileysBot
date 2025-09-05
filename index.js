// server_ws_long.js
// WebSocket 长连接 Baileys 服务（Node 18+）
// ACTIONS
// - login:     {action:"login", phoneNumber:"12345678901", waitMs?:30000, requestId?:string}
//              → 第一条: {ok:true, action:"login", phase:"pairing", pairingCode, status:"waiting"|"already-registered"|"already-open", ...}
//              → 第二条: {ok:true, action:"login", phase:"final",   pairingCode, status:"connected"|"pending"|"already-open", ...}
// - status:    {action:"status", phoneNumber:"12345678901"}
// - list:      {action:"list"}
// - disconnect:{action:"disconnect", phoneNumber:"12345678901"}
// - reconnect: {action:"reconnect", phoneNumber:"12345678901"}

import { WebSocketServer } from "ws";
import NodeCache from "node-cache";
import fs from "fs";
import path from "path";
import {
  default as makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
} from "./baileys/lib/index.js";

// ========== 轻量 console logger（兼容 .child()）==========
const ConsoleLogger = {
  level: "info",
  child() { return this; },
  info:  (...a) => console.log (...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
  debug: (...a) => console.debug(...a),
  trace: (...a) => console.debug(...a),
};

// Baileys 推荐：缓存消息重试计数
const msgRetryCounterCache = new NodeCache();

/* -------------------- 工具函数 -------------------- */

// E.164 纯数字（无 +）
function normalizeE164Digits(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 6) {
    throw new Error("phoneNumber 格式不正确（需 E.164 纯数字，例如 12345678901）");
  }
  return digits;
}

function sendJSON(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// 等待“可以触发配对码”的时机：connecting/qr/open（官方建议）
function waitPairingTrigger(sock, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { sock.ev.off("connection.update", onU); } catch {}
      reject(new Error("pairing-trigger timeout"));
    }, timeoutMs);

    const onU = (u) => {
      if (done) return;
      if (u?.connection === "open") {
        done = true;
        clearTimeout(timer);
        try { sock.ev.off("connection.update", onU); } catch {}
        resolve("already-open");
        return;
      }
      if (u?.connection === "connecting" || u?.qr) {
        done = true;
        clearTimeout(timer);
        try { sock.ev.off("connection.update", onU); } catch {}
        resolve("ready");
      }
      // close -> 等待超时，给自动重连机会
    };

    sock.ev.on("connection.update", onU);
  });
}

// 等待底层 ws OPEN，避免 428
function waitWsOpen(sock, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    try {
      if (sock?.ws?.readyState === 1) return resolve(); // 1 = OPEN
      const onOpen = () => { cleanup(); resolve(); };
      const onClose = () => { cleanup(); reject(new Error("WS closed before open")); };
      const onError = (err) => { cleanup(); reject(err || new Error("WS error before open")); };

      const timer = setTimeout(() => { cleanup(); reject(new Error("WS open timeout")); }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        try { sock.ws?.off?.("open", onOpen); } catch {}
        try { sock.ws?.off?.("close", onClose); } catch {}
        try { sock.ws?.off?.("error", onError); } catch {}
      }

      sock.ws?.on?.("open", onOpen);
      sock.ws?.on?.("close", onClose);
      sock.ws?.on?.("error", onError);
    } catch (e) {
      reject(e);
    }
  });
}

// 等待 open 或超时，返回 "connected"|"pending"|"already-open"
function waitForOpenOnce(sock, waitMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { sock.ev.off("connection.update", onUpdate); } catch {}
      resolve("pending");
    }, waitMs);

    const onUpdate = (u) => {
      if (done) return;
      if (u?.connection === "open") {
        done = true;
        clearTimeout(timer);
        try { sock.ev.off("connection.update", onUpdate); } catch {}
        resolve("connected");
      }
    };
    sock.ev.on("connection.update", onUpdate);
  });
}

// 清理 AUTH/<phone> 目录
function clearAuthDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
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

const sessions = new Map(); // phoneNumberDigits -> Session

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

async function ensureSession(phoneDigits) {
  phoneDigits = normalizeE164Digits(phoneDigits);

  if (sessions.has(phoneDigits)) {
    return sessions.get(phoneDigits);
  }

  return await withPhoneLock(phoneDigits, async () => {
    if (sessions.has(phoneDigits)) return sessions.get(phoneDigits);

    const authPath = `AUTH/${phoneDigits}`;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: ConsoleLogger, // 避免乱码
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, ConsoleLogger),
      },
      msgRetryCounterCache,
    });

    const session = {
      phoneNumber: phoneDigits,
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

    sessions.set(phoneDigits, session);

    // 自动保存凭据
    sock.ev.on("creds.update", async () => {
      try { await saveCreds(); } catch {}
      session.registered = !!sock.authState?.creds?.registered;
      session.updatedAt = Date.now();
    });

    // 连接状态与重连策略
    sock.ev.process(async (events) => {
      if (events["connection.update"]) {
        const update = events["connection.update"];
        const { connection, lastDisconnect } = update;

        if (connection) {
          session.lastConnection = connection;
          session.updatedAt = Date.now();
        }

        if (connection === "open") {
          session.retriesLeft = 5;
          session.registered = !!sock.authState?.creds?.registered;
          console.log(`[${phoneDigits}] 连接已建立`);
        }

        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;

          console.warn(`[${phoneDigits}] 连接关闭 code=${code} loggedOut=${loggedOut}`);

          if (loggedOut) {
            // 已登出：停止自动重连，等待 login 触发“清空并重建”
            session.autoReconnect = false;
            session.retriesLeft = 0;
          } else if (session.autoReconnect && session.retriesLeft > 0) {
            session.retriesLeft -= 1;
            const delay = 3000;
            console.warn(`[${phoneDigits}] 准备重连，剩余重试 ${session.retriesLeft} 次`);
            setTimeout(() => {
              if (sessions.get(phoneDigits) === session && session.autoReconnect) {
                recreateSocket(session).catch((e) => {
                  console.error(`[${phoneDigits}] 重连失败`, e);
                });
              }
            }, delay);
          }
        }
      }
    });

    return session;
  });
}

async function recreateSocket(session, { fresh = false } = {}) {
  const { phoneNumber, authPath } = session;

  if (fresh) {
    clearAuthDir(authPath);
  }

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  // 关闭旧的
  try { session.sock.ev.removeAllListeners(); } catch {}
  try { await session.sock.ws?.close?.(); } catch {}

  const sock = makeWASocket({
    version,
    logger: ConsoleLogger,
    printQRInTerminal: false,
    browser: Browsers.macOS("Safari"),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, ConsoleLogger),
    },
    msgRetryCounterCache,
  });

  session.sock = sock;
  session.saveCreds = saveCreds;
  session.lastConnection = "connecting";
  session.registered = !!state?.creds?.registered;
  session.updatedAt = Date.now();

  sock.ev.on("creds.update", async () => {
    try { await saveCreds(); } catch {}
    session.registered = !!sock.authState?.creds?.registered;
    session.updatedAt = Date.now();
  });

  sock.ev.process(async (events) => {
    if (events["connection.update"]) {
      const update = events["connection.update"];
      const { connection, lastDisconnect } = update;

      if (connection) {
        session.lastConnection = connection;
        session.updatedAt = Date.now();
      }

      if (connection === "open") {
        session.retriesLeft = 5;
        session.registered = !!sock.authState?.creds?.registered;
        console.log(`[${phoneNumber}] 重连成功`);
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        console.warn(`[${phoneNumber}] 重连后连接关闭 code=${code} loggedOut=${loggedOut}`);

        if (loggedOut) {
          session.autoReconnect = false;
          session.retriesLeft = 0;
        } else if (session.autoReconnect && session.retriesLeft > 0) {
          session.retriesLeft -= 1;
          setTimeout(() => {
            if (sessions.get(phoneNumber) === session && session.autoReconnect) {
              recreateSocket(session).catch((e) => {
                console.error(`[${phoneNumber}] 再次重连失败`, e);
              });
            }
          }, 3000);
        }
      }
    }
  });

  return session;
}

/* -------------------- WebSocket 服务器 -------------------- */

const PORT = Number(process.env.PORT) || 3001;
const wss = new WebSocketServer({ port: PORT });
console.log(`WS server listening on ws://localhost:${PORT}`);

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
      /* ---------- login：两阶段（官方建议的触发＋WS open 双条件） ---------- */
      if (action === "login") {
        const { phoneNumber: pn, waitMs = 30000, requestId } = msg;
        const phoneDigits = normalizeE164Digits(pn);

        let session = await ensureSession(phoneDigits);

        // 若上次是 401 登出，先清空目录并新建“干净会话”
        if (session.lastConnection === "close" && session.retriesLeft === 0 && session.autoReconnect === false) {
          console.warn(`[${phoneDigits}] 检测到上次是 loggedOut，清空 AUTH 并重建会话`);
          await recreateSocket(session, { fresh: true });
        }

        // 先等待“可请求配对码”的时机（connecting/qr/open）
        let trigger;
        try {
          trigger = await waitPairingTrigger(session.sock, 15000); // "ready" | "already-open"
        } catch (err) {
          return sendJSON(ws, {
            ok: false,
            action: "login",
            phoneNumber: phoneDigits,
            error: "pairing-trigger-failed: " + (err?.message || String(err)),
          });
        }

        // 再确保底层 ws 已 OPEN（避免 428）
        try {
          await waitWsOpen(session.sock, 10000);
        } catch (err) {
          // 如果 ws 没 open，可能因为旧凭据导致 401；清空并重建后再试一次
          console.warn(`[${phoneDigits}] ws 未 OPEN，尝试清空 AUTH 并重建会话再试`);
          await recreateSocket(session, { fresh: true });
          // 重新等待触发
          trigger = await waitPairingTrigger(session.sock, 15000).catch((e) => {
            throw new Error("pairing-trigger-after-fresh: " + (e?.message || String(e)));
          });
          await waitWsOpen(session.sock, 10000);
        }

        session.registered = !!session.sock.authState?.creds?.registered;

        let pairingCode = null;
        if (!session.registered && trigger !== "already-open") {
          try {
            pairingCode = await session.sock.requestPairingCode(phoneDigits);
            console.log(`[${phoneDigits}] 配对码: ${pairingCode}`);
          } catch (e) {
            console.error(`[${phoneDigits}] 生成配对码失败`, e);
            return sendJSON(ws, {
              ok: false,
              action: "login",
              phoneNumber: phoneDigits,
              error: "pairing-failed: " + (e?.message || String(e)),
            });
          }
        }

        // 第一条：立即回配对码/状态
        sendJSON(ws, {
          ok: true,
          action: "login",
          phase: "pairing",
          phoneNumber: phoneDigits,
          pairingCode,
          status: trigger === "already-open" ? "already-open" : (session.registered ? "already-registered" : "waiting"),
          requestId,
        });

        // 第二条：等待最多 waitMs 看是否 open（配对成功）
        const status = trigger === "already-open"
          ? "already-open"
          : await waitForOpenOnce(session.sock, waitMs);

        sendJSON(ws, {
          ok: true,
          action: "login",
          phase: "final",
          phoneNumber: phoneDigits,
          pairingCode,
          status, // "connected" | "pending" | "already-open"
          requestId,
        });

        return;
      }

      /* ---------- status：返回账号状态 ---------- */
      if (action === "status") {
        const { phoneNumber: pn } = msg;
        const phoneDigits = normalizeE164Digits(pn);

        if (sessions.has(phoneDigits)) {
          const s = sessions.get(phoneDigits);
          s.registered = !!s.sock.authState?.creds?.registered;
          return sendJSON(ws, {
            ok: true,
            action: "status",
            phoneNumber: phoneDigits,
            registered: s.registered,
            connection: s.lastConnection || "disconnected",
          });
        }

        // 若内存中没有会话，读本地凭据判断是否已注册
        const { state } = await useMultiFileAuthState(`AUTH/${phoneDigits}`);
        return sendJSON(ws, {
          ok: true,
          action: "status",
          phoneNumber: phoneDigits,
          registered: !!state?.creds?.registered,
          connection: "disconnected",
        });
      }

      /* ---------- list：列出所有在线会话 ---------- */
      if (action === "list") {
        const connections = Array.from(sessions.values()).map(sessionSummary);
        return sendJSON(ws, { ok: true, action: "list", connections });
      }

      /* ---------- disconnect：手动断开某个号码 ---------- */
      if (action === "disconnect") {
        const { phoneNumber: pn } = msg;
        const phoneDigits = normalizeE164Digits(pn);

        if (!sessions.has(phoneDigits)) {
          return sendJSON(ws, { ok: true, action: "disconnect", phoneNumber: phoneDigits, note: "not-found" });
        }

        const s = sessions.get(phoneDigits);
        s.autoReconnect = false; // 禁止自动重连
        try { s.sock.ev.removeAllListeners(); } catch {}
        try { await s.sock.ws?.close?.(); } catch {}
        sessions.delete(phoneDigits);

        return sendJSON(ws, { ok: true, action: "disconnect", phoneNumber: phoneDigits });
      }

      /* ---------- reconnect：重建连接（若无内存会话则新建） ---------- */
      if (action === "reconnect") {
        const { phoneNumber: pn } = msg;
        const phoneDigits = normalizeE164Digits(pn);

        if (sessions.has(phoneDigits)) {
          const s = sessions.get(phoneDigits);
          s.autoReconnect = true;
          await recreateSocket(s);
          let status = "connecting";
          try {
            const r = await waitForOpenOnce(s.sock, 5000);
            status = r === "connected" ? "connected" : "pending";
          } catch {}
          return sendJSON(ws, { ok: true, action: "reconnect", phoneNumber: phoneDigits, status });
        } else {
          const s = await ensureSession(phoneDigits);
          let status = "connecting";
          try {
            const r = await waitForOpenOnce(s.sock, 5000);
            status = r === "connected" ? "connected" : "pending";
          } catch {}
          return sendJSON(ws, { ok: true, action: "reconnect", phoneNumber: phoneDigits, status });
        }
      }

      /* ---------- 未知动作 ---------- */
      return sendJSON(ws, { ok: false, error: "unknown action" });
    } catch (e) {
      console.error("WS action error:", e);
      return sendJSON(ws, { ok: false, error: String(e?.message || e) });
    }
  });
});

/* -------------------- 进程信号 -------------------- */

process.on("SIGINT", async () => {
  console.log("SIGINT, shutting down...");
  for (const [, s] of sessions) {
    s.autoReconnect = false;
    try { s.sock.ev.removeAllListeners(); } catch {}
    try { await s.sock.ws?.close?.(); } catch {}
  }
  wss.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, p) => {
  console.error("unhandledRejection:", reason, p);
});
