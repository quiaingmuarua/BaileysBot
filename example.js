import makeWASocket, {
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
	Browsers,
	DisconnectReason,
} from "./baileys/lib/index.js";
import pino from "pino";
import NodeCache from "node-cache";

let maxRetries = 5;

const logger = pino({
	timestamp: () => `,"time":"${new Date().toJSON()}"`,
	level: "info"
});

const msgRetryCounterCache = new NodeCache();

const P = pino({
	level: "silent",
});

// 获取命令行参数
const phoneNumber = process.argv[2];

// 检查参数
if (!phoneNumber) {
	console.log("📱 WhatsApp Bot 配对码生成器");
	console.log("");
	console.log("用法: node example.js <手机号>");
	console.log("示例: node example.js 1234567890");
	console.log("");
	console.log("说明:");
	console.log("- 手机号请使用国际格式（不含+号）");
	console.log("- 配对码有效期为5分钟");
	console.log("- 认证信息将保存在 AUTH/cli/ 目录");
	process.exit(1);
}

// 简单的手机号验证
const cleanPhone = phoneNumber.replace(/\D/g, '');
if (cleanPhone.length < 10) {
	console.error("❌ 错误: 手机号格式不正确");
	console.log("请提供有效的手机号码（至少10位数字）");
	process.exit(1);
}

console.log(`📞 手机号: ${cleanPhone}`);

async function generatePairingCode() {
	try {
		let { state, saveCreds } = await useMultiFileAuthState("AUTH/cli");
		let { version, isLatest } = await fetchLatestBaileysVersion();
		
		console.log(`🔄 正在使用 WhatsApp v${version.join(".")}, 是最新版本: ${isLatest}`);
		
		const sock = makeWASocket({
			version,
			logger: P,
			printQRInTerminal: false,
			browser: Browsers.ubuntu("Chrome"),
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, P),
			},
			msgRetryCounterCache,
			connectTimeoutMs: 60000,
			defaultQueryTimeoutMs: 60000,
			keepAliveIntervalMs: 30000,
			markOnlineOnConnect: false,
			syncFullHistory: false,
			shouldSyncHistoryMessage: () => false,
		});

		sock.ev.on("creds.update", saveCreds);

		// 检查是否已经注册
		if (sock.authState.creds.registered) {
			console.log("✅ 账号已经注册，尝试连接...");
			
			// 监听连接状态
			sock.ev.on("connection.update", (update) => {
				const { connection, lastDisconnect } = update;
				
				if (connection === "open") {
					console.log("🎉 连接成功！账号已在线");
					console.log(`📱 JID: ${sock.authState.creds.me?.id || "未知"}`);
					sock.end();
					process.exit(0);
				} else if (connection === "close") {
					const statusCode = lastDisconnect?.error?.output?.statusCode;
					if (statusCode === DisconnectReason.loggedOut) {
						console.log("⚠️  账号已登出，需要重新配对");
						sock.end();
						process.exit(1);
					} else {
						console.log("❌ 连接失败，请稍后重试");
						sock.end();
						process.exit(1);
					}
				}
			});
			
			// 设置超时
			setTimeout(() => {
				console.log("⏰ 连接超时");
				sock.end();
				process.exit(1);
			}, 15000);
			
		} else {
			console.log("🔑 生成配对码中...");
			
			try {
				const code = await sock.requestPairingCode(cleanPhone);
				console.log("");
				console.log("🎯 配对码生成成功！");
				console.log("═".repeat(50));
				console.log(`📋 配对码: ${code}`);
				console.log("═".repeat(50));
				console.log("");
				console.log("📱 请在 WhatsApp 中:");
				console.log("   1. 打开 WhatsApp");
				console.log("   2. 选择 '链接设备'");
				console.log("   3. 选择 '使用手机号码链接'");
				console.log("   4. 输入上面的配对码");
				console.log("");
				console.log("⏰ 配对码有效期: 5分钟");
				console.log("💾 认证信息保存路径: AUTH/cli/");
				
				// 可选：监听配对结果
				let pairingCompleted = false;
				sock.ev.on("connection.update", (update) => {
					const { connection, lastDisconnect } = update;
					
					if (connection === "open" && !pairingCompleted) {
						pairingCompleted = true;
						console.log("");
						console.log("🎉 配对成功！连接已建立");
						console.log(`📱 JID: ${sock.authState.creds.me?.id || "未知"}`);
						sock.end();
						process.exit(0);
					} else if (connection === "close") {
						const statusCode = lastDisconnect?.error?.output?.statusCode;
						if (statusCode === DisconnectReason.loggedOut) {
							console.log("");
							console.log("❌ 配对失败或被拒绝");
						}
						sock.end();
						process.exit(pairingCompleted ? 0 : 1);
					}
				});
				
				// 30秒后自动退出（配对码显示完成）
				setTimeout(() => {
					if (!pairingCompleted) {
						console.log("");
						console.log("⏰ 等待配对超时，配对码仍然有效");
						console.log("💡 您可以在5分钟内继续使用上面的配对码");
					}
					sock.end();
					process.exit(0);
				}, 30000);
				
			} catch (error) {
				console.error("❌ 生成配对码失败:", error.message);
				sock.end();
				process.exit(1);
			}
		}

	} catch (error) {
		console.error("❌ 启动过程中发生错误:", error.message);
		process.exit(1);
	}
}

// 优雅退出处理
process.on('SIGINT', () => {
	console.log('\n🛑 正在关闭 WhatsApp Bot...');
	process.exit(0);
});

process.on('uncaughtException', (error) => {
	console.error('❌ 未捕获的异常:', error.message);
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('❌ 未处理的 Promise 拒绝:', reason);
	process.exit(1);
});

// 启动配对码生成
console.log("🚀 正在启动 WhatsApp Bot 配对码生成器...");
generatePairingCode().catch(error => {
	console.error("❌ 启动失败:", error.message);
	process.exit(1);
});
  
