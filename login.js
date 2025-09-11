import makeWASocket, {
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
	Browsers,
	DisconnectReason,
} from "./baileys/lib/index.js";
import pino from "pino";
import NodeCache from "node-cache";
import readline from "readline";
// Removed maxRetries - using simple reconnection like mini_example

const logger = pino({
	timestamp: () => `,"time":"${new Date().toJSON()}"`,
	level: "info"
});


const msgRetryCounterCache = new NodeCache();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});
const question = text => new Promise(resolve => rl.question(text, resolve));

const P = pino({
	level: "silent",
});

async function start() {
	try {
		console.log("🚀 开始启动 WhatsApp 连接...");
		let phoneNumber =  process.argv[2];
		if (!phoneNumber) {
			console.log("phoneNumber is null or empty, please input it again")
			return
		}
		phoneNumber=phoneNumber.replace(/[^0-9]/g, '');
		let { state, saveCreds } = await useMultiFileAuthState(`AUTH/${phoneNumber}`);
		let { version, isLatest } = await fetchLatestBaileysVersion();

		console.log("📋 已注册状态:", !!state?.creds?.registered);
		console.log(`loginStatus:${ !!state?.creds?.registered} `)
		console.log("正在使用 WhatsApp v" + version.join(".") + ", 是最新版本: " + isLatest);

		console.log("🔌 创建 WhatsApp socket...");
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

		console.log("💾 设置凭据自动保存...");
		sock.ev.on("creds.update", saveCreds);

	if (!sock.authState.creds.registered) {
		console.log("🔍 账号未注册，开始配对流程...");
		//await 5s
		await new Promise(resolve => setTimeout(resolve, 5000));
		console.log(`📞 手机号: ${phoneNumber}`);
		console.log("🔗 当前连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");

		console.log("📝 正在请求配对码...");
		const code = await sock.requestPairingCode(phoneNumber);
		console.log(`🔑 配对码生成成功: ${code}`);
		console.log(`pairCode:${code} `)
		console.log("🔗 配对码生成后连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");
		console.log("⏳ 等待用户在 WhatsApp 中输入配对码...");
	}

	// 处理连接状态更新
	sock.ev.process(async events => {
		// 处理连接状态更新
		if (events["connection.update"]) {
			const update = events["connection.update"];
			const { connection, lastDisconnect, qr } = update;

			console.log("🔄 连接状态更新事件:");
			console.log("   connection:", connection);
			console.log("   qr:", !!qr);
			console.log("   lastDisconnect:", lastDisconnect);

			if (connection === "connecting") {
				console.log("🔗 正在连接到 WhatsApp...");
			}

			if (connection === "close") {
				console.log("❌ 连接关闭:", lastDisconnect?.error);
				if (
					lastDisconnect &&
					lastDisconnect.error
					// &&
					// lastDisconnect.error.output &&
					// lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
				) {
					console.log("🔄 连接已断开，正在重新连接...");
					start();
				} else {
					console.log("🛑 连接已关闭，您已登出。");
				}
			} else if (connection === "open") {
				console.log("✅ WhatsApp 连接已建立！");
				console.log("📱 已注册:", !!sock.authState?.creds?.registered);
			}
		}

		// 处理接收到的消息
		if (events["messages.upsert"]) {
			const upsert = events["messages.upsert"];
			for (const msg of upsert.messages) {
				if (!msg.key.fromMe && msg.message) {
					console.log("收到消息:", msg);

					// 简单的自动回复示例
					const messageText = msg.message.conversation ||
									   msg.message.extendedTextMessage?.text ||
									   "";

					if (messageText.toLowerCase().includes("hello") ||
					    messageText.toLowerCase().includes("你好")) {
						await sock.sendMessage(msg.key.remoteJid, {
							text: "你好！我是一个基于 Baileys 的 WhatsApp 机器人。"
						});
					}
				}
			}
		}
	});
	return sock;
	} catch (error) {
		console.error("启动过程中发生错误:", error);
		process.exit(1);
	}
}

// 优雅退出处理
process.on('SIGINT', () => {
	console.log('\n正在关闭 WhatsApp bot...');
	rl.close();
	process.exit(0);
});

process.on('uncaughtException', (error) => {
	console.error('未捕获的异常:', error);
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('未处理的 Promise 拒绝:', reason);
	console.error('Promise:', promise);
});

console.log("🤖 正在启动 WhatsApp Bot...");
console.log("📂 AUTH 目录: AUTH/cli");
console.log("🔄 配对流程：生成配对码 → 用户输入 → 连接断开(restartRequired) → 自动重连 → 成功");
console.log("=====================================");

start().catch(error => {
	console.error("❌ 启动失败:", error);
	console.error("📍 错误堆栈:", error.stack);
	process.exit(1);
});

/*

path login (pairingCode)
params
return 返回配对码，后台等待30s，成功就自动保存auth


path status
params phoneNumber (不同号码token放在AUTH子目录下，目录名是phonenumber)
return 返回账号状态


 */
  
