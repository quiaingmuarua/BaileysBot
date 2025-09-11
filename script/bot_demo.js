// index.js
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers
} from "../baileys/lib/index.js";
import express from "express"
import NodeCache from "node-cache";
import pino from "pino";
const msgRetryCounterCache = new NodeCache();
const P = pino({
	level: "silent",
});

async function start() {
  // 使用多文件 auth 存储 (假设已经有 auth 文件)
  const {state, saveCreds} = await useMultiFileAuthState("AUTH/447999803105")
  let { version, isLatest } = await fetchLatestBaileysVersion();
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
  sock.ev.on("creds.update", saveCreds)
  
  // 监听连接状态
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if(connection === 'close') {
      console.log('连接已关闭')
    } else if(connection === 'open') {
      console.log('连接已建立，准备获取联系人信息')
    }
    console.log('连接状态更新:', update)
  })
  
  // 监听消息历史记录同步 - 这里可以获取到联系人信息
  sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
    console.log(`收到 ${chats.length} 个聊天, ${contacts.length} 个联系人, ${messages.length} 条消息`)
    
    if (contacts && contacts.length > 0) {
      console.log('=== 联系人列表 ===')
      contacts.forEach((contact, index) => {
        console.log(`${index + 1}. ${contact.name || contact.id} (${contact.id})`)
        if (contact.notify) {
          console.log(`   通知名称: ${contact.notify}`)
        }
      })
    }
  })
  
  // 监听联系人更新
  sock.ev.on('contacts.update', (contacts) => {
    console.log('联系人信息更新:')
    for(const contact of contacts) {
      console.log(`联系人 ${contact.id} 更新:`, contact)
      
      // 如果有头像更新，获取新的头像URL
      if(typeof contact.imgUrl !== 'undefined') {
        sock.profilePictureUrl(contact.id).then(url => {
          console.log(`联系人 ${contact.id} 的新头像: ${url}`)
        }).catch(() => {
          console.log(`无法获取联系人 ${contact.id} 的头像`)
        })
      }
    }
  })
  
  // 监听聊天更新 - 也可以从这里获取联系人信息
  sock.ev.on('chats.set', (chats) => {
    console.log(`收到 ${chats.length} 个聊天`)
    
    // 从聊天中提取联系人信息
    const contacts = chats.filter(chat => chat.id.endsWith('@s.whatsapp.net')) // 个人聊天
    if (contacts.length > 0) {
      console.log('=== 从聊天中获取的联系人 ===')
      contacts.forEach((chat, index) => {
        console.log(`${index + 1}. ${chat.name || chat.id} (${chat.id})`)
        if (chat.unreadCount > 0) {
          console.log(`   未读消息: ${chat.unreadCount}`)
        }
      })
    }
  })
  
  // 监听聊天更新
  sock.ev.on('chats.update', (chats) => {
    console.log('聊天信息更新:')
    chats.forEach(chat => {
      if (chat.id.endsWith('@s.whatsapp.net')) {
        console.log(`联系人聊天更新: ${chat.name || chat.id}`)
      }
    })
  })
  
  // 获取所有联系人的函数
  const getAllContacts = async () => {
    try {
      console.log('等待联系人信息通过消息历史同步...')
      
      // 尝试获取现有的聊天记录
      setTimeout(() => {
        console.log('5秒后尝试手动显示可用信息...')
        
        // 如果有store的话，可以尝试访问store中的联系人信息
        if (sock.authState && sock.authState.creds) {
          console.log('当前登录用户:', sock.authState.creds.me?.id)
        }
        
        console.log('提示：联系人信息通常在接收到消息或聊天更新时显示。')
        console.log('你可以：')
        console.log('1. 发送一条消息给任何联系人')
        console.log('2. 等待接收新消息')
        console.log('3. 或者查看 chats.set 事件中的联系人信息')
      }, 5000)
      
    } catch (error) {
      console.error('获取联系人失败:', error)
    }
  }
  
  // 连接建立后尝试获取联系人
  sock.ev.on('connection.update', async (update) => {
    if (update.connection === 'open') {
      console.log('WhatsApp 连接成功！')
      console.log('当前用户信息:', sock.user)
      await getAllContacts()
    }
  })

}


start()

