// index.js - 启动 WebSocket 客户端
import { WSAppClient } from './ws-client.js';
const deviceId = process.env.DEVICE_ID || 'wabot_unknown';
console.log('Device ID:', deviceId);
// const WS_URL = process.env.WS_URL || 'ws://192.168.3.65:8088/ws';
// const WS_URL = process.env.WS_URL || 'ws://192.168.3.65:8088/ws/';
const WS_URL = process.env.WS_URL ||  'ws://127.0.0.1:18888/ws/';

const client = new WSAppClient(WS_URL+deviceId, {
  reconnect: true,
  reconnectBase: 1000,
  reconnectMax: 15000,
  heartbeatInterval: 20000,
  onEvent: (evt, detail) => {
    const now = new Date().toISOString();
    if (evt === 'open') console.log(`[${now}] ✅ Connected: ${WS_URL}`);
    else if (evt === 'close') console.log(`[${now}] 🔌 Disconnected`, detail || '');
    else if (evt === 'error') console.error(`[${now}] ❌ Error`, detail || '');
    else if (evt === 'reconnect_scheduled') console.log(`[${now}] ⏳ Reconnect in ${detail?.in}ms`);
    else if (evt === 'heartbeat_timeout') console.warn(`[${now}] ❤️‍🔥 Heartbeat timeout, terminating...`);
    else if (evt === 'shutdown') console.log(`[${now}] 🔄 Client shutting down`, detail || '');
    else if (evt === 'warn') console.warn(`[${now}] ⚠️`, detail || '');
  },
});

client.start();

// 也可以主动发 ping（可选，通常有心跳就不需要）
setInterval(() => {
  client.sendMessage('ping', { t: Date.now() });
}, 30000);
