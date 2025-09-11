import {
	makeWASocket,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
	Browsers,
} from "./baileys/lib/index.js";
import pino from "pino";
import NodeCache from "node-cache";
import readline from "readline";

const MAIN_LOGGER = pino({
	timestamp: () => `,"time":"${new Date().toJSON()}"`,
});

const logger = MAIN_LOGGER.child({});
logger.level = "trace";

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
	let { state, saveCreds } = await useMultiFileAuthState("AUTH/mini_cli");
	let { version, isLatest } = await fetchLatestBaileysVersion();
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
	});
	// Note: store is not available in this version, removing store binding

	sock.ev.on("creds.update", saveCreds);

	if (!sock.authState.creds.registered) {
		const phoneNumber = await question("Enter your active whatsapp number: ");
		const code = await sock.requestPairingCode(phoneNumber);
		console.log(`pairing with this code: ${code}`);
	}

	// to upsert message from whatsapp
	sock.ev.process(async events => {
		if (events["connection.update"]) {
			const update = events["connection.update"];
			const { connection, lastDisconnect } = update;
			if (connection === "close") {
				if (
					lastDisconnect &&
					lastDisconnect.error
					// &&
					// lastDisconnect.error.output &&
					// lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
				) {
					start();
				} else {
					console.log("Connection closed. You are logged out.");
				}
			}
			console.log("connection update", update);
		}
	});
	return sock;
}

start();

