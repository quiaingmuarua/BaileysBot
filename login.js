import makeWASocket, {
	Browsers,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
} from "./baileys/lib/index.js";
import pino from "pino";
import NodeCache from "node-cache";
import readline from "readline";
import fs from "fs";
import {SocksProxyAgent} from 'socks-proxy-agent'

// Removed maxRetries - using simple reconnection like mini_example

function randomString(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const sessionId = randomString(8);
const proxyUrl = `socks5://${process.env.SOCKS5_PREFIX}_${sessionId}:${process.env.SOCKS5_PASSWORD}@gate1.ipweb.cc:7778`;


// 创建代理 agent
let proxyAgent = new SocksProxyAgent(proxyUrl);

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
let PROCESSSTATUS="init"
let max_retry_cnt=5

const args = process.argv.slice(2).join("&").replace(/--/g, "");

const params = new URLSearchParams(args);
console.log("params:",params)

async function start() {
	console.log("🚀 开始启动 WhatsApp 连接...");
	let phoneNumber = params.get("phoneNumber");
	if (!phoneNumber) {
		console.log("phoneNumber is null or empty, please input it again")
		return
	}
	let methodType =params.get("methodType");
	let target_number =params.get("target_number");
	let content =params.get("content");

	phoneNumber=phoneNumber.replace(/[^0-9]/g, '');
	const authPath = `AUTH/${phoneNumber}`;
	PROCESSSTATUS="getNumber"
	if (params.get("proxy")==="direct"){
		proxyAgent=null
	}
	try {
		let { state, saveCreds } = await useMultiFileAuthState(authPath);
		let { version, isLatest } = await fetchLatestBaileysVersion();

		console.log("📋 已注册状态:", !!state?.creds?.registered);
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
			  agent: proxyAgent,
		});

		console.log("💾 设置凭据自动保存...");
		sock.ev.on("creds.update", saveCreds);
		PROCESSSTATUS="login"
		if(methodType==="account_verify"){
			console.log("sock.authState.creds.registered "+sock.authState.creds.registered)
			if(!sock.authState.creds.registered){
				process.exit(100);
			}

		}

	if (!sock.authState.creds.registered) {
		console.log("🔍 账号未注册，开始配对流程...");
		//await 5s
		await new Promise(resolve => setTimeout(resolve, 5000));
		console.log(`📞 手机号: ${phoneNumber}`);
		console.log("🔗 当前连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");

		console.log("📝 正在请求配对码...");
		PROCESSSTATUS="requestPairCode"
		const code = await sock.requestPairingCode(phoneNumber);
		console.log(`🔑 配对码生成成功: ${code}`);
		console.log(`pairCode:${code} `)
		console.log("🔗 配对码生成后连接状态:", sock.ws?.readyState === 1 ? "OPEN" : "NOT_OPEN");
		console.log("⏳ 等待用户在 WhatsApp 中输入配对码...");
		PROCESSSTATUS="successGetPairCode"
	}

	// 处理连接状态更新
	sock.ev.process(async events => {
		// 处理连接状态更新
		if (!events["connection.update"]) {
			return;
		}
		const update = events["connection.update"];
		const {connection, lastDisconnect, qr} = update;
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
				console.log("🔄 连接已断开，正在重新连接... ", lastDisconnect?.error?.output?.statusCode);
				max_retry_cnt -= 1
				if (max_retry_cnt < 0) {

					throw new Error("max_retry_cnt is 0, please check your network")
				}
				if (lastDisconnect?.error?.output?.statusCode === 401) {
					fs.rmSync(authPath, {recursive: true, force: true});
				}
				start();
			} else {
				console.log("🛑 连接已关闭，您已登出。");
			}
		} else if (connection === "open") {
			console.log("✅ WhatsApp 连接已建立！");
			console.log("📱 已注册:", !!sock.authState?.creds?.registered);
			console.log(`loginStatus:${!!state?.creds?.registered} `)

			console.log("=====================================");

			console.log(`${methodType} target_number ${target_number} content ${content} `)
			if(!target_number ||target_number.length ===0){
				process.exit(200);
			}
			for (const number of target_number.split(",")) {
				let data = {number, target_number, methodType}
				try {
					switch (methodType) {

						case "message_send":
							data.raw_result = await sock.sendMessage(number + "@s.whatsapp.net", {
								text: content
							});
							break;
						case "filter_number":
							data.result = await sock.profilePictureUrl(`${number}@s.whatsapp.net`, "image")
							break

					}

					data.code = 200

					console.log(`success_handle_result raw_result ${JSON.stringify(data)}`)

				} catch (e) {
					data.code = 300
					data.raw_result=e.toString()
					console.log(`failed_handle_result handle ${number} has_exception ${e}`)
				}

				const jsonString = JSON.stringify(data);
				const base64Encoded = Buffer.from(jsonString, 'utf8').toString('base64');
				console.log(`Base64StrEncode encoded_result_${base64Encoded}`)

			}

			process.exit(200);

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
		if(PROCESSSTATUS==="requestPairCode"){
			fs.rmSync(authPath, { recursive: true, force: true });
		}
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
  
