import express from 'express';
import cors from 'cors';
import makeWASocket, {
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
	Browsers,
	DisconnectReason,
} from "./baileys/lib/index.js";
import pino from "pino";
import NodeCache from "node-cache";
import { existsSync } from 'fs';
import { join } from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 日志配置
const logger = pino({
	level: "info",
	timestamp: () => `,"time":"${new Date().toJSON()}"`,
});

// 缓存配置
const msgRetryCounterCache = new NodeCache();
const pendingLogins = new Map(); // 存储待处理的登录请求

// 静默日志（用于 Baileys）
const silentLogger = pino({ level: "silent" });

/**
 * 检查账号状态
 * @param {string} phoneNumber - 手机号码
 * @returns {Promise<object>} 账号状态信息
 */
async function checkAccountStatus(phoneNumber) {
	try {
		const authPath = join("AUTH", phoneNumber);
		
		// 检查认证文件是否存在
		if (!existsSync(authPath)) {
			return {
				registered: false,
				authenticated: false,
				message: "账号未注册，需要先进行配对"
			};
		}

		// 尝试加载认证状态
		const { state } = await useMultiFileAuthState(authPath);
		
		if (!state.creds || !state.creds.me) {
			return {
				registered: false,
				authenticated: false,
				message: "认证信息不完整，需要重新配对"
			};
		}

		// 尝试创建连接来验证状态
		const { version } = await fetchLatestBaileysVersion();
		const sock = makeWASocket({
			version,
			logger: silentLogger,
			printQRInTerminal: false,
			browser: Browsers.macOS("Safari"),
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
			},
			msgRetryCounterCache,
		});

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				sock.end();
				resolve({
					registered: true,
					authenticated: false,
					message: "连接超时，可能需要重新配对"
				});
			}, 10000); // 10秒超时

			sock.ev.on("connection.update", (update) => {
				const { connection, lastDisconnect } = update;
				
				if (connection === "open") {
					clearTimeout(timeout);
					sock.end();
					resolve({
						registered: true,
						authenticated: true,
						message: "账号在线",
						jid: state.creds.me?.id || "未知",
						name: state.creds.me?.name || "未设置"
					});
				} else if (connection === "close") {
					clearTimeout(timeout);
					sock.end();
					
					const statusCode = lastDisconnect?.error?.output?.statusCode;
					if (statusCode === DisconnectReason.loggedOut) {
						resolve({
							registered: false,
							authenticated: false,
							message: "账号已登出，需要重新配对"
						});
					} else {
						resolve({
							registered: true,
							authenticated: false,
							message: "连接已断开，可能需要重新配对"
						});
					}
				}
			});
		});

	} catch (error) {
		logger.error("检查账号状态时发生错误:", error);
		return {
			registered: false,
			authenticated: false,
			message: "检查状态时发生错误: " + error.message,
			error: true
		};
	}
}

/**
 * 执行登录流程
 * @param {string} phoneNumber - 手机号码
 * @returns {Promise<object>} 登录结果
 */
async function performLogin(phoneNumber) {
	try {
		const authPath = join("AUTH", phoneNumber);
		const { state, saveCreds } = await useMultiFileAuthState(authPath);
		const { version } = await fetchLatestBaileysVersion();
		
		logger.info(`开始为手机号 ${phoneNumber} 执行登录流程`);
		
		const sock = makeWASocket({
			version,
			logger: silentLogger,
			printQRInTerminal: false,
			browser: Browsers.macOS("Safari"),
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
			},
			msgRetryCounterCache,
		});

		sock.ev.on("creds.update", saveCreds);

		return new Promise(async (resolve, reject) => {
			const timeout = setTimeout(() => {
				sock.end();
				pendingLogins.delete(phoneNumber);
				reject(new Error("登录超时，请重试"));
			}, 60000); // 60秒超时

			try {
				// 如果已经注册，直接尝试连接
				if (sock.authState.creds.registered) {
					sock.ev.on("connection.update", (update) => {
						const { connection, lastDisconnect } = update;
						
						if (connection === "open") {
							clearTimeout(timeout);
							sock.end();
							pendingLogins.delete(phoneNumber);
							resolve({
								success: true,
								message: "登录成功",
								jid: sock.authState.creds.me?.id || "未知"
							});
						} else if (connection === "close") {
							const statusCode = lastDisconnect?.error?.output?.statusCode;
							if (statusCode === DisconnectReason.loggedOut) {
								clearTimeout(timeout);
								sock.end();
								pendingLogins.delete(phoneNumber);
								reject(new Error("账号已登出，需要重新配对"));
							}
						}
					});
				} else {
					// 需要配对码
					const code = await sock.requestPairingCode(phoneNumber);
					logger.info(`为手机号 ${phoneNumber} 生成配对码: ${code}`);
					
					// 监听配对结果
					sock.ev.on("connection.update", (update) => {
						const { connection, lastDisconnect } = update;
						
						if (connection === "open") {
							clearTimeout(timeout);
							sock.end();
							pendingLogins.delete(phoneNumber);
							resolve({
								success: true,
								message: "配对成功，登录完成",
								jid: sock.authState.creds.me?.id || "未知"
							});
						} else if (connection === "close") {
							const statusCode = lastDisconnect?.error?.output?.statusCode;
							if (statusCode === DisconnectReason.loggedOut) {
								clearTimeout(timeout);
								sock.end();
								pendingLogins.delete(phoneNumber);
								reject(new Error("配对失败或被拒绝"));
							}
						}
					});

					// 立即返回配对码
					resolve({
						success: false,
						requiresPairing: true,
						pairingCode: code,
						message: "请在 WhatsApp 中输入配对码完成登录",
						expiresIn: "5分钟"
					});
				}
			} catch (error) {
				clearTimeout(timeout);
				sock.end();
				pendingLogins.delete(phoneNumber);
				reject(error);
			}
		});

	} catch (error) {
		logger.error("登录过程中发生错误:", error);
		pendingLogins.delete(phoneNumber);
		throw error;
	}
}

// API 路由

/**
 * POST /login - 登录接口
 * Body: { phoneNumber: "手机号码" }
 */
app.post('/login', async (req, res) => {
	try {
		const { phoneNumber } = req.body;

		if (!phoneNumber) {
			return res.status(400).json({
				success: false,
				message: "请提供手机号码",
				error: "MISSING_PHONE_NUMBER"
			});
		}

		// 验证手机号格式（简单验证）
		const cleanPhone = phoneNumber.replace(/\D/g, '');
		if (cleanPhone.length < 10) {
			return res.status(400).json({
				success: false,
				message: "手机号码格式不正确",
				error: "INVALID_PHONE_NUMBER"
			});
		}

		// 检查是否已有待处理的登录请求
		if (pendingLogins.has(cleanPhone)) {
			return res.status(409).json({
				success: false,
				message: "该手机号已有正在进行的登录请求",
				error: "LOGIN_IN_PROGRESS"
			});
		}

		// 标记为正在处理
		pendingLogins.set(cleanPhone, true);

		const result = await performLogin(cleanPhone);
		
		res.json(result);

	} catch (error) {
		logger.error("登录接口错误:", error);
		res.status(500).json({
			success: false,
			message: error.message || "登录过程中发生错误",
			error: "LOGIN_ERROR"
		});
	}
});

/**
 * GET /status - 账号状态接口
 * Query: ?phoneNumber=手机号码
 */
app.get('/status', async (req, res) => {
	try {
		const { phoneNumber } = req.query;

		if (!phoneNumber) {
			return res.status(400).json({
				success: false,
				message: "请提供手机号码",
				error: "MISSING_PHONE_NUMBER"
			});
		}

		const cleanPhone = phoneNumber.replace(/\D/g, '');
		const status = await checkAccountStatus(cleanPhone);
		
		res.json({
			success: true,
			phoneNumber: cleanPhone,
			...status
		});

	} catch (error) {
		logger.error("状态检查接口错误:", error);
		res.status(500).json({
			success: false,
			message: error.message || "检查状态时发生错误",
			error: "STATUS_CHECK_ERROR"
		});
	}
});

/**
 * GET /health - 健康检查接口
 */
app.get('/health', (req, res) => {
	res.json({
		success: true,
		message: "服务正常运行",
		timestamp: new Date().toISOString(),
		uptime: process.uptime()
	});
});

/**
 * GET / - 根路径，显示 API 文档
 */
app.get('/', (req, res) => {
	res.json({
		name: "WhatsApp Bot API",
		version: "1.0.0",
		endpoints: {
			"POST /login": {
				description: "登录接口，返回配对码",
				body: { phoneNumber: "手机号码" },
				example: "curl -X POST http://localhost:3000/login -H 'Content-Type: application/json' -d '{\"phoneNumber\":\"1234567890\"}'"
			},
			"GET /status": {
				description: "检查账号状态",
				query: "phoneNumber=手机号码",
				example: "curl http://localhost:3000/status?phoneNumber=1234567890"
			},
			"GET /health": {
				description: "健康检查",
				example: "curl http://localhost:3000/health"
			}
		}
	});
});

// 错误处理中间件
app.use((error, req, res, next) => {
	logger.error("未处理的错误:", error);
	res.status(500).json({
		success: false,
		message: "服务器内部错误",
		error: "INTERNAL_SERVER_ERROR"
	});
});

// 404 处理
app.use((req, res) => {
	res.status(404).json({
		success: false,
		message: "接口不存在",
		error: "NOT_FOUND"
	});
});

// 启动服务器
app.listen(PORT, () => {
	logger.info(`WhatsApp Bot API 服务器已启动`);
	logger.info(`监听端口: ${PORT}`);
	logger.info(`API 文档: http://localhost:${PORT}`);
	logger.info(`健康检查: http://localhost:${PORT}/health`);
});

// 优雅退出处理
process.on('SIGINT', () => {
	logger.info('收到 SIGINT 信号，正在关闭服务器...');
	process.exit(0);
});

process.on('SIGTERM', () => {
	logger.info('收到 SIGTERM 信号，正在关闭服务器...');
	process.exit(0);
});

process.on('uncaughtException', (error) => {
	logger.error('未捕获的异常:', error);
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	logger.error('未处理的 Promise 拒绝:', reason);
	logger.error('Promise:', promise);
});
