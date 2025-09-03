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
let maxRetries = 5;

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
		let { state, saveCreds } = await useMultiFileAuthState("AUTH/cli");
		let { version, isLatest } = await fetchLatestBaileysVersion();

		console.log("正在使用 WhatsApp v" + version.join(".") + ", 是最新版本: " + isLatest);

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

	sock.ev.on("creds.update", saveCreds);

	if (!sock.authState.creds.registered) {
		const phoneNumber = await question("Enter your active whatsapp number: ");
		const code = await sock.requestPairingCode(phoneNumber);
		console.log(`pairing with this code: ${code}`);
	}

	// 处理连接状态更新
	sock.ev.process(async events => {
		// 处理连接状态更新
		if (events["connection.update"]) {
			const update = events["connection.update"];
			const { connection, lastDisconnect } = update;

			if (connection === "close") {
				const shouldReconnect =
					lastDisconnect &&
					lastDisconnect.error &&
					lastDisconnect.error.output &&
					lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

				if (shouldReconnect) {
					console.log("连接已断开，尝试重新连接..." + maxRetries);
					maxRetries-=1
					if(maxRetries<0){
						process.exit(1);
					}
					setTimeout(() => start(), 5000); // 5秒后重新连接
				} else {
					console.log("连接已关闭，您已登出。");
				}
			} else if (connection === "open") {
				console.log("WhatsApp 连接已建立！");
			}
			console.log("连接状态更新:", update);
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

console.log("正在启动 WhatsApp Bot...");
start().catch(error => {
	console.error("启动失败:", error);
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
  
