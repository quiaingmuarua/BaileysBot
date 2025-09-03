// WebSocket 一次性 Baileys 服务（Node 18+）
// ACTIONS
// - login:  {action:"login", phoneNumber:"xxxx", waitMs?:30000, requestId?:string}
//           → 第一条: {ok:true, action:"login", phase:"pairing", pairingCode, status:"waiting", ...}
//           → 第二条: {ok:true, action:"login", phase:"final",   pairingCode, status:"connected"|"pending", ...}
// - status: {action:"status", phoneNumber:"+1xxxx", activeCheck?:false}
//           → {ok:true, action:"status", registered, connection, error?}

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
      // 1 = OPEN（ws 库）
      if (sock?.ws?.readyState === 1) return resolve();
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

// 等待 connection.update=open 或超时，返回 "connected"|"pending"
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
      if (u.connection === "open") {
        done = true;
        clearTimeout(timer);
        try { sock.ev.off("connection.update", onUpdate); } catch {}
        resolve("connected");
      }
      // close 情况保持等待，让用户还能在手机端点击配对直到超时
    };
    sock.ev.on("connection.update", onUpdate);
  });
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

// 一次性创建 socket、执行 task、完成后清理
async function runWithTempSocket(phoneNumber, task, { timeoutMs = 30000 } = {}) {
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

  const cleanup = async () => {
    try { sock.ev.removeAllListeners(); } catch {}
    try { await sock.ws?.close?.(); } catch {}
    try { await saveCreds(); } catch {}
  };

  sock.ev.on("creds.update", saveCreds);

  const op = (async () => task({ sock, state, saveCreds }))();
  const to = new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), timeoutMs));

  try {
    const result = await Promise.race([op, to]);
    await cleanup();
    return result;
  } catch (e) {
    await cleanup();
    throw e;
  }
}

/* -------------------- WebSocket 服务器 -------------------- */

const PORT = process.env.PORT || 3001;
const wss = new WebSocketServer({ port: PORT });
logger.info(`WS server listening on ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  // 初始问候
  sendJSON(ws, { ok: true, hello: "ready", actions: ["login", "status"] });

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
      /* ---------- 登录：配对码立刻推送 + 最终状态再推一次 ---------- */
      if (action === "login") {
        const { phoneNumber: pn, waitMs = 30000, requestId } = msg;
        const phoneNumber = normalizePhone(pn);

        await withPhoneLock(phoneNumber, async () => {
          await runWithTempSocket(
            phoneNumber,
            async ({ sock }) => {
              // 1) 确保底层 ws open
              await waitWsOpen(sock, 10000);

              // 2) 生成配对码（未注册时）
              let pairingCode = null;
              if (!sock.authState?.creds?.registered) {
                pairingCode = await sock.requestPairingCode(phoneNumber);
                logger.info({ phoneNumber, pairingCode }, "配对码已生成");
              } else {
                logger.info({ phoneNumber }, "已注册账号，无需配对码");
              }

              // 3) 立即推送第一条（显示配对码 + 等待中）
              sendJSON(ws, {
                ok: true,
                action: "login",
                phase: "pairing",
                phoneNumber,
                pairingCode,     // 已注册账号可能为 null
                status: "waiting",
                requestId,
              });

              // 4) 等待最多 waitMs 是否 open
              const status = await waitForOpenOnce(sock, waitMs);

              // 5) 推送第二条（最终状态）
              sendJSON(ws, {
                ok: true,
                action: "login",
                phase: "final",
                phoneNumber,
                pairingCode,
                status,          // "connected" | "pending"
                requestId,
              });
            },
            { timeoutMs: waitMs + 12000 } // 给等待窗口预留余量
          );
        });

        return; // 本次完成
      }

      /* ---------- 状态：仅读或活性检查 ---------- */
      if (action === "status") {
        const { phoneNumber: pn, activeCheck = false } = msg;
        const phoneNumber = normalizePhone(pn);

        const authPath = `AUTH/${phoneNumber}`;
        const { state } = await useMultiFileAuthState(authPath);
        const registered = !!state?.creds?.registered;

        if (!activeCheck) {
          return sendJSON(ws, {
            ok: true,
            action: "status",
            phoneNumber,
            registered,
            connection: registered ? "unknown" : "disconnected",
          });
        }

        // activeCheck：快速连一次，立刻返回并销毁
        try {
          const res = await runWithTempSocket(
            phoneNumber,
            async ({ sock }) => {
              // 尝试在 8s 观察 open
              const quick = await new Promise((resolve) => {
                let done = false;
                const timer = setTimeout(() => {
                  if (done) return;
                  done = true;
                  try { sock.ev.off("connection.update", onUpdate); } catch {}
                  resolve("disconnected");
                }, 8000);

                const onUpdate = (u) => {
                  if (done) return;
                  if (u.connection === "open") {
                    done = true;
                    clearTimeout(timer);
                    try { sock.ev.off("connection.update", onUpdate); } catch {}
                    resolve("open");
                  }
                };
                sock.ev.on("connection.update", onUpdate);
              });

              return {
                registered: !!sock.authState?.creds?.registered,
                connection: quick,
              };
            },
            { timeoutMs: 10000 }
          );

          return sendJSON(ws, { ok: true, action: "status", phoneNumber, ...res });
        } catch (e) {
          return sendJSON(ws, {
            ok: true,
            action: "status",
            phoneNumber,
            registered,
            connection: "disconnected",
            error: String(e?.message || e),
          });
        }
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

process.on("SIGINT", () => {
  logger.info("SIGINT, shutting down...");
  wss.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException");
  process.exit(1);
});

process.on("unhandledRejection", (reason, p) => {
  logger.error({ reason, p }, "unhandledRejection");
});
