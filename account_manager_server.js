// 🚀 WhatsApp 账号管理器 - 命令行参数版本
// 基于已验证可行的 example.js 逐步开发
// 
// 使用方法:
// node account_manager_server.js action=login number=66961687880 timeout=60
// node account_manager_server.js action=status number=66961687880
// node account_manager_server.js action=logout number=66961687880

import makeWASocket, {
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
	Browsers,
	DisconnectReason,
} from "./baileys/lib/index.js";
import pino from "pino";
import NodeCache from "node-cache";
import fs from "fs";

let maxRetries = 5;

// 解析命令行参数
function parseArgs() {
	const args = {};
	const defaultArgs = {
		action: 'login',
		number: '66961687880',
		timeout: '60',
		clean: 'false'
	};

	process.argv.slice(2).forEach(arg => {
		const [key, value] = arg.split('=');
		if (key && value) {
			args[key] = value;
		} else if (arg === '--clean' || arg === 'clean') {
			args.clean = 'true';
		}
	});

	return { ...defaultArgs, ...args };
}

// 静默日志配置 - 和 example.js 一致
const P = pino({
	level: "silent",
});

const msgRetryCounterCache = new NodeCache();

// 核心功能：登录配对
async function loginAction(phoneNumber, timeoutSeconds = 60, shouldClean = false) {
	try {
		console.log("🚀 开始启动 WhatsApp 连接...");
		console.log(`📱 手机号: ${phoneNumber}`);
		console.log(`⏰ 超时时间: ${timeoutSeconds} 秒`);
		if (shouldClean) {
			console.log("🧹 清理模式: 已启用");
		}
		console.log("=====================================");

		const authPath = `AUTH/cmd_${phoneNumber}`;
		
		// 🧹 如果启用清理模式，先清理认证状态
		if (shouldClean && fs.existsSync(authPath)) {
			console.log("🧹 正在清理可能污染的认证状态...");
			fs.rmSync(authPath, { recursive: true, force: true });
			console.log("✅ 认证状态已清理");
		}
		let { state, saveCreds } = await useMultiFileAuthState(authPath);
		let { version, isLatest } = await fetchLatestBaileysVersion();

		console.log("📋 已注册状态:", !!state?.creds?.registered);
		console.log("正在使用 WhatsApp v" + version.join(".") + ", 是最新版本: " + isLatest);

		console.log("🔌 创建 WhatsApp socket...");
		
		// 🔍 添加详细诊断信息
		console.log("🔍 诊断信息:");
		console.log("   Auth creds exist:", !!state.creds);
		console.log("   Auth keys exist:", !!state.keys);
		console.log("   Registered:", !!state?.creds?.registered);
		console.log("   Version:", version);
		console.log("   Auth path:", authPath);
		
		const sock = makeWASocket({
			version,
			logger: P, // 保持静默日志，和 example.js 一致
			printQRInTerminal: false,
			browser: Browsers.macOS("Safari"), // 和 example.js 完全一致
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, P),
			},
			msgRetryCounterCache,
		});
		
		console.log("✅ Socket 创建完成");
		console.log("🔗 初始连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");

		console.log("💾 设置凭据自动保存...");
		sock.ev.on("creds.update", saveCreds);

		// 配对流程 - 完全按照 example.js 的成功方式
		let pairingResult = null;
		const resultPromise = new Promise((resolve) => {
			pairingResult = resolve;
		});

		if (!sock.authState.creds.registered) {
			console.log("🔍 账号未注册，开始配对流程...");
			console.log(`📞 手机号: ${phoneNumber}`);
			console.log("🔗 当前连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");

			// 🔥 添加等待时间，让连接稳定
			console.log("⏳ 等待连接稳定 (3秒)...");
			await new Promise(resolve => setTimeout(resolve, 3000));
			console.log("🔗 等待后连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");

			console.log("📝 正在请求配对码...");
			try {
				const code = await sock.requestPairingCode(phoneNumber);
				console.log(`🔑 配对码生成成功: ${code}`);
				console.log("🔗 配对码生成后连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");
				console.log("⏳ 等待用户在 WhatsApp 中输入配对码...");
				console.log("┌─────────────────────────────────────────┐");
				console.log(`│           配对码: ${code}             │`);
				console.log("└─────────────────────────────────────────┘");
			} catch (error) {
				console.error("❌ 配对码生成失败:", error.message);
				console.error("🔍 错误详情:", error);
				
				// 🔥 检查是否是状态污染问题，尝试清理重试
				if (error.message.includes("Connection Closed") || error.message.includes("Connection Failure")) {
					console.log("🧹 检测到连接问题，尝试清理 AUTH 状态并重试...");
					
					// 清理 AUTH 目录
					if (fs.existsSync(authPath)) {
						fs.rmSync(authPath, { recursive: true, force: true });
						console.log("✅ AUTH 状态已清理");
					}
					
					// 等待一段时间后重试
					console.log("⏳ 等待 5 秒后重试...");
					await new Promise(resolve => setTimeout(resolve, 5000));
					
					console.log("🔄 正在重试配对...");
					const result = {
						success: false,
						action: 'login',
						phoneNumber,
						error: '连接问题，已清理状态，请重新运行程序重试'
					};
					pairingResult(result);
					return result;
				}
				
				const result = {
					success: false,
					action: 'login',
					phoneNumber,
					error: '配对码生成失败: ' + error.message
				};
				pairingResult(result);
				return result;
			}
		} else {
			console.log("✅ 账号已注册，等待连接...");
		}

		// 处理连接状态更新 - 完全按照 example.js 的方式
		sock.ev.process(async events => {
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
					const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
					const loggedOut = code === DisconnectReason.loggedOut;
					const restartRequired = code === DisconnectReason.restartRequired;

					console.log("❌ 连接关闭:");
					console.log("   错误代码:", code);
					console.log("   loggedOut:", loggedOut);
					console.log("   restartRequired:", restartRequired);
					console.log("   错误详情:", lastDisconnect?.error);

					if (restartRequired) {
						console.log("✅ 配对成功！WhatsApp 要求重启连接，这是正常的");
						console.log("🔄 等待自动重新连接...");
					} else if (loggedOut) {
						console.log("🚪 账号已登出，停止重连");
						pairingResult({
							success: false,
							action: 'login',
							phoneNumber,
							error: '账号已登出'
						});
					} else {
						const shouldReconnect = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

						if (shouldReconnect) {
							console.log("🔄 连接已断开，尝试重新连接... 剩余重试:" + maxRetries);
							maxRetries -= 1;
							if (maxRetries < 0) {
								console.log("❌ 重试次数已用完，退出");
								pairingResult({
									success: false,
									action: 'login',
									phoneNumber,
									error: '重试次数已用完'
								});
							} else {
								setTimeout(() => loginAction(phoneNumber, timeoutSeconds), 5000);
							}
						} else {
							console.log("🛑 连接已关闭，您已登出。");
							pairingResult({
								success: false,
								action: 'login',
								phoneNumber,
								error: '连接已关闭'
							});
						}
					}
				} else if (connection === "open") {
					console.log("✅ WhatsApp 连接已建立！");
					console.log("📱 已注册:", !!sock.authState?.creds?.registered);
					pairingResult({
						success: true,
						action: 'login',
						phoneNumber,
						message: '配对成功，连接已建立'
					});
				}
			}

			// 处理接收到的消息 - 简单的演示
			if (events["messages.upsert"]) {
				const upsert = events["messages.upsert"];
				for (const msg of upsert.messages) {
					if (!msg.key.fromMe && msg.message) {
						console.log("📨 收到消息:", msg.message.conversation || '多媒体消息');
					}
				}
			}
		});

		// 设置超时
		setTimeout(() => {
			if (pairingResult) {
				console.log(`⏰ ${timeoutSeconds} 秒超时`);
				pairingResult({
					success: false,
					action: 'login',
					phoneNumber,
					error: '等待超时'
				});
			}
		}, timeoutSeconds * 1000);

		return await resultPromise;

	} catch (error) {
		console.error("启动过程中发生错误:", error);
		return {
			success: false,
			action: 'login',
			phoneNumber,
			error: '启动失败: ' + error.message
		};
	}
}

// 状态查询功能
async function statusAction(phoneNumber) {
	try {
		console.log("📊 查询账号状态...");
		console.log(`📱 手机号: ${phoneNumber}`);

		const authPath = `AUTH/cmd_${phoneNumber}`;
		
		if (!fs.existsSync(authPath)) {
			return {
				success: true,
				action: 'status',
				phoneNumber,
				registered: false,
				connection: 'disconnected',
				message: '未找到认证文件'
			};
		}

		let { state } = await useMultiFileAuthState(authPath);
		const registered = !!state?.creds?.registered;

		console.log("📋 已注册状态:", registered);
		
		return {
			success: true,
			action: 'status',
			phoneNumber,
			registered,
			connection: 'disconnected', // 简单版本只检查文件状态
			message: registered ? '账号已注册' : '账号未注册'
		};

	} catch (error) {
		console.error("状态查询失败:", error);
		return {
			success: false,
			action: 'status',
			phoneNumber,
			error: '状态查询失败: ' + error.message
		};
	}
}

// 登出功能
async function logoutAction(phoneNumber) {
	try {
		console.log("🚪 执行登出操作...");
		console.log(`📱 手机号: ${phoneNumber}`);

		const authPath = `AUTH/cmd_${phoneNumber}`;
		
		if (fs.existsSync(authPath)) {
			fs.rmSync(authPath, { recursive: true, force: true });
			console.log("✅ 认证文件已清理");
		}

		return {
			success: true,
			action: 'logout',
			phoneNumber,
			message: '登出成功，认证文件已清理'
		};

	} catch (error) {
		console.error("登出失败:", error);
		return {
			success: false,
			action: 'logout',
			phoneNumber,
			error: '登出失败: ' + error.message
		};
	}
}

// 主程序
async function main() {
	const args = parseArgs();
	const { action, number, timeout, clean } = args;
	const shouldClean = clean === 'true';

	console.log("🤖 WhatsApp 账号管理器");
	console.log("=====================================");
	console.log(`🎯 操作: ${action}`);
	console.log(`📱 号码: ${number}`);
	if (action === 'login') {
		console.log(`⏰ 超时: ${timeout} 秒`);
		if (shouldClean) {
			console.log(`🧹 清理: 启用`);
		}
	}
	console.log("=====================================\n");

	let result;

	switch (action) {
		case 'login':
			result = await loginAction(number, parseInt(timeout), shouldClean);
			break;
		case 'status':
			result = await statusAction(number);
			break;
		case 'logout':
			result = await logoutAction(number);
			break;
		default:
			result = {
				success: false,
				error: `未知操作: ${action}。支持的操作: login, status, logout`
			};
	}

	console.log("\n📊 操作结果:");
	console.log("=====================================");
	console.log(JSON.stringify(result, null, 2));
	console.log("=====================================");

	if (result.success) {
		console.log("✅ 操作成功完成");
		process.exit(0);
	} else {
		console.log("❌ 操作失败");
		process.exit(1);
	}
}

// 优雅退出处理
process.on('SIGINT', () => {
	console.log('\n👋 正在退出...');
	process.exit(0);
});

process.on('uncaughtException', (error) => {
	console.error('❌ 未捕获的异常:', error);
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('❌ 未处理的 Promise 拒绝:', reason);
	process.exit(1);
});

// 显示使用帮助
if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log(`
🤖 WhatsApp 账号管理器 - 使用帮助

📋 支持的操作:
  login   - 登录配对操作
  status  - 查询账号状态  
  logout  - 登出并清理认证

🚀 使用示例:
  node account_manager_server.js action=login number=8613760212132 timeout=60
  node account_manager_server.js action=login number=66961687880 timeout=60 clean=true
  node account_manager_server.js action=status number=66961687880
  node account_manager_server.js action=logout number=66961687880

📝 参数说明:
  action   - 操作类型 (login/status/logout)
  number   - 手机号码 (不包含+号和-号)
  timeout  - 超时时间 (仅对login有效, 单位：秒)
  clean    - 是否清理认证状态 (true/false, 默认false)

💡 注意事项:
  - 手机号格式: 66961687880 (纯数字, 包含国家码)
  - AUTH 文件保存在: AUTH/cmd_手机号/ 目录
  - 基于已验证的 example.js 核心逻辑开发
`);
	process.exit(0);
}

// 启动主程序
main().catch(error => {
	console.error("❌ 程序异常:", error);
	process.exit(1);
});
