// ws-client.js - WebSocket 客户端（ESM）
import WebSocket from 'ws';
import {getCacheStatus, handleAccountLogin} from './accountHandler.js';
import {raw} from "express";

const DEFAULTS = {
  RECONNECT: true,
  RECONNECT_BASE_MS: 1000,   // 初始重连间隔
  RECONNECT_MAX_MS: 15000,   // 最大重连间隔
  HEARTBEAT_INTERVAL_MS: 20000, // 心跳间隔
  OUTBOX_LIMIT: 1000,        // 断线期间待发队列上限
};


const deviceId = process.env.DEVICE_ID || 'wabot_unknown';
console.log('Device ID:', deviceId);


export class WSAppClient {
  /**
   * @param {string} url - 目标 WebSocket 地址（例如 ws://127.0.0.1:8001/ws）
   * @param {object} [opts]
   * @param {boolean} [opts.reconnect]
   * @param {number} [opts.reconnectBase]
   * @param {number} [opts.reconnectMax]
   * @param {number} [opts.heartbeatInterval]
   * @param {number} [opts.outboxLimit]
   * @param {(evt: string, detail?: any) => void} [opts.onEvent] - 统一事件回调（open/close/error/reconnect等）
   */
  constructor(url, opts = {}) {
    this.url = url;
    this.reconnect = opts.reconnect ?? DEFAULTS.RECONNECT;
    this.reconnectBase = opts.reconnectBase ?? DEFAULTS.RECONNECT_BASE_MS;
    this.reconnectMax = opts.reconnectMax ?? DEFAULTS.RECONNECT_MAX_MS;
    this.heartbeatInterval = opts.heartbeatInterval ?? DEFAULTS.HEARTBEAT_INTERVAL_MS;
    this.outboxLimit = opts.outboxLimit ?? DEFAULTS.OUTBOX_LIMIT;
    this.onEvent = opts.onEvent;

    this.ws = null;
    this._reconnectAttempt = 0;
    this._shouldReconnect = true;
    this._heartbeatTimer = null;
    this._lastPongTs = Date.now();
    this._clientId = null; // 如果服务端会分配，可以保存
    this._outbox = [];     // 断线待发消息
  }

  // ---------- 公共方法 ----------
  start() {
    this._connect();
    this._installProcessHandlers();
  }

  stop() {
    this._shouldReconnect = false;
    this._clearHeartbeat();
    this._removeProcessHandlers();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 通知服务器将要关闭（保持与服务器版“server_shutdown”行为对应）
      this.sendMessage('client_shutdown', { message: 'Client going to shutdown' });
    }
    if (this.ws) this.ws.close(1001, 'Client shutdown');
  }

  /**
   * 发送统一结构消息
   * @param type {string} type
   * @param data {object} data
   * @param rawMsg {object} rawMsg  消息id
   */
  sendMessage(type,data , rawMsg) {
    const payload = {
      type:type,
      data:data,
      timestamp: new Date().toISOString(),
    };

    if (rawMsg) {
     if (rawMsg.msgId !== null) payload.msgId = rawMsg.msgId;
     if (rawMsg.msgId !== null) payload.msgId = rawMsg.msgId;
     if (rawMsg.error !==null)  payload.error = rawMsg.error;
     if (rawMsg.deviceId !==null)   payload.deviceId = rawMsg.deviceId;
      if (rawMsg.tid !==null)  payload.tid= rawMsg.tid;
      if (rawMsg.extra !==null)  payload.extra = rawMsg.extra;
    }
    this._sendRaw(payload);
  }

  /**
   * 直接发送自定义对象或字符串（内部使用）
   */
  _sendRaw(objOrString) {
    const str = typeof objOrString === 'string' ? objOrString : JSON.stringify(objOrString);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(str);
    } else {
      // 缓存到待发队列
      if (this._outbox.length >= this.outboxLimit) {
        // 丢弃最旧，避免无限增长
        this._outbox.shift();
      }
      this._outbox.push(str);
    }
  }

  // ---------- 内部：连接与重连 ----------
  _connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this._emit('open');
      this._reconnectAttempt = 0;
      this._lastPongTs = Date.now();
      this._startHeartbeat();

      // 重放待发队列
      if (this._outbox.length) {
        for (const msg of this._outbox) this.ws.send(msg);
        this._outbox.length = 0;
      }
    });

    this.ws.on('message', (data) => {
      this._handleIncoming(data);
    });

    this.ws.on('pong', () => {
      this._lastPongTs = Date.now();
      // this._emit('pong');
    });

    this.ws.on('close', (code, reason) => {
      this._emit('close', { code, reason: reason?.toString() });
      this._clearHeartbeat();

      if (this.reconnect && this._shouldReconnect) {
        const delay = this._nextBackoff();
        this._emit('reconnect_scheduled', { in: delay });
        setTimeout(() => this._connect(), delay);
      }
    });

    this.ws.on('error', (err) => {
      this._emit('error', { message: err?.message || String(err) });
    });
  }

  _nextBackoff() {
    const attempt = Math.min(this._reconnectAttempt++, 10);
    const base = this.reconnectBase * Math.pow(2, attempt); // 指数退避
    return Math.min(base, this.reconnectMax);
  }

  // ---------- 内部：心跳 ----------
  _startHeartbeat() {
    this._clearHeartbeat();
    if (!this.heartbeatInterval) return;

    this._heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      try {
        this.ws.ping(); // 客户端发 ping
      } catch (_) {}

      // 若超过 2 * 心跳间隔未收到 pong，判定为超时 → 强制断开触发重连
      if (Date.now() - this._lastPongTs > this.heartbeatInterval * 2) {
        this._emit('heartbeat_timeout');
        try {
          this.ws.terminate();
        } catch (_) {}
      }
    }, this.heartbeatInterval);
  }

  _clearHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // ---------- 内部：消息分发 ----------
  async _handleIncoming(buffer) {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch (err) {
      this.sendMessage('error', null, null, {tag:'消息格式错误'});
      this._emit('warn', { reason: 'json_parse_error', raw: buffer.toString() });
      return;
    }

    const {type, data} = message;
    // 可选：保存服务器分配的 clientId
    if (type === 'connected' && data?.clientId) {
      this._clientId = data.clientId;
    }

    switch (type) {
      case 'ping':
        // 收到服务器 ping → 回 pong
        this.sendMessage('pong', null, message);
        break;

      case 'get_status':
        this.sendMessage('status', getCacheStatus(), message);
        break;

      case 'account_login':
      case 'account_verify':
        // 与服务器版一致：先 ack，再处理
        this.sendMessage('ack', data, message);
        await this._handleAccountLoginClient(type,data, message);
        break;

      default:
        // 其余类型你也可以继续扩展
        this.sendMessage('error', {tag:`未知的消息类型: ${type}`}, message);
        break;
    }
  }
  /**
   * @param params {Object} params - 请求参数
   * @param {object|null} rawMsg
   * @param type {string}
   */
  async _handleAccountLoginClient(type,params, rawMsg) {
    // 复用你现有的 handleAccountLogin，并保持回调协议一致
    params['type']=type
    await handleAccountLogin(params, {
      onResponse: (result) => {
        this.sendMessage(type, result, rawMsg);
      },
      onError: (error) => {
        this.sendMessage(
          type,
            {
            error:  error?.error || 'Internal Server Error',
            code: error?.code || 500
            },
            rawMsg,
        );
      },
      onOutput: (chunk, stream) => {
        if (params?.env === 'dev') {
          this.sendMessage(
            'log',
            {
              content: String(chunk ?? '').trim(),
              stream,
            },
            rawMsg
          );
        }
      },
    });
  }

  // ---------- 内部：进程信号 ----------
  _installProcessHandlers() {
    this._boundOnSigint = () => this._gracefulExit('SIGINT');
    this._boundOnSigterm = () => this._gracefulExit('SIGTERM');
    process.on('SIGINT', this._boundOnSigint);
    process.on('SIGTERM', this._boundOnSigterm);
  }

  _removeProcessHandlers() {
    if (this._boundOnSigint) process.off('SIGINT', this._boundOnSigint);
    if (this._boundOnSigterm) process.off('SIGTERM', this._boundOnSigterm);
  }

  _gracefulExit(signal) {
    this._emit('shutdown', { signal });
    this.stop();
    // 给一点时间发送 close 帧
    setTimeout(() => process.exit(0), 200);
  }

  _emit(evt, detail) {
    if (this.onEvent) {
      try { this.onEvent(evt, detail); } catch {}
    }
  }
}
