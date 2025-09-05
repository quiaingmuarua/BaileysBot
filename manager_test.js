// 长连接管理测试客户端
import WebSocket from 'ws';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (text) => new Promise(resolve => rl.question(text, resolve));

const ws = new WebSocket('ws://localhost:3001');

// 显示菜单
function showMenu() {
  console.log('\n🔧 长连接管理器 - 可用操作:');
  console.log('1. login <手机号>     - 登录/配对 (如: login 66961687880)');
  console.log('2. status <手机号>    - 查看状态');
  console.log('3. list              - 列出所有连接');
  console.log('4. disconnect <手机号> - 断开连接');
  console.log('5. reconnect <手机号> - 重新连接');
  console.log('6. help              - 显示帮助');
  console.log('7. exit              - 退出');
  console.log('=====================================');
  console.log('注意：手机号格式不带加号，如: 66961687880');
}

ws.on('open', () => {
  console.log('✅ 连接到长连接管理服务器');
  showMenu();
  startCommandLoop();
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('\n📨 服务器响应:');
    console.log(JSON.stringify(msg, null, 2));
    
    // 特殊处理配对码显示
    if (msg.action === 'login' && msg.phase === 'pairing' && msg.pairingCode) {
      console.log(`\n🔑 配对码: ${msg.pairingCode}`);
      console.log('📱 请在WhatsApp中输入此配对码');
    }
    
    if (msg.action === 'login' && msg.phase === 'final') {
      if (msg.status === 'connected') {
        console.log('🎉 登录成功！连接已建立并保持活跃');
      } else {
        console.log('⏰ 登录超时，但连接仍在后台运行');
      }
    }
    
    console.log('\n> 请输入命令:');
  } catch (e) {
    console.error('解析消息失败:', e);
  }
});

async function startCommandLoop() {
  while (true) {
    try {
      const input = await question('\n> ');
      const parts = input.trim().split(' ');
      const command = parts[0].toLowerCase();
      
      if (command === 'exit') {
        break;
      }
      
      if (command === 'help') {
        showMenu();
        continue;
      }
      
      if (command === 'login') {
        const phoneNumber = parts[1];
        if (!phoneNumber) {
          console.log('❌ 请提供手机号，例如: login 66961687880');
          continue;
        }
        
        ws.send(JSON.stringify({
          action: 'login',
          phoneNumber,
          waitMs: 30000,
          requestId: 'test-' + Date.now()
        }));
        continue;
      }
      
      if (command === 'status') {
        const phoneNumber = parts[1];
        if (!phoneNumber) {
          console.log('❌ 请提供手机号，例如: status 66961687880');
          continue;
        }
        
        ws.send(JSON.stringify({
          action: 'status',
          phoneNumber
        }));
        continue;
      }
      
      if (command === 'list') {
        ws.send(JSON.stringify({
          action: 'list'
        }));
        continue;
      }
      
      if (command === 'disconnect') {
        const phoneNumber = parts[1];
        if (!phoneNumber) {
          console.log('❌ 请提供手机号，例如: disconnect 66961687880');
          continue;
        }
        
        ws.send(JSON.stringify({
          action: 'disconnect',
          phoneNumber
        }));
        continue;
      }
      
      if (command === 'reconnect') {
        const phoneNumber = parts[1];
        if (!phoneNumber) {
          console.log('❌ 请提供手机号，例如: reconnect 66961687880');
          continue;
        }
        
        ws.send(JSON.stringify({
          action: 'reconnect',
          phoneNumber
        }));
        continue;
      }
      
      console.log('❌ 未知命令，输入 help 查看帮助');
    } catch (e) {
      console.error('命令处理出错:', e);
    }
  }
  
  ws.close();
}

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error);
});

ws.on('close', () => {
  console.log('🔌 连接已关闭');
  rl.close();
  process.exit(0);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在退出...');
  ws.close();
});
