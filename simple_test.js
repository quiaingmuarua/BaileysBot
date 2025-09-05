// 简单的配对测试
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001');

const phoneNumber = process.argv[2];
if (!phoneNumber) {
  console.log('使用方法: node simple_test.js 66961687880');
  console.log('注意：号码不需要加号前缀');
  process.exit(1);
}

ws.on('open', () => {
  console.log('✅ 连接到服务器');
  console.log(`🚀 正在测试手机号: ${phoneNumber}`);
  
  // 发送登录请求
  ws.send(JSON.stringify({
    action: 'login',
    phoneNumber,
    waitMs: 30000,
    requestId: 'simple-test-' + Date.now()
  }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('\n📨 收到响应:');
    console.log(JSON.stringify(msg, null, 2));
    
    if (msg.action === 'login' && msg.phase === 'pairing' && msg.pairingCode) {
      console.log(`\n🔑 配对码: ${msg.pairingCode}`);
      console.log('📱 请在WhatsApp中输入此配对码！');
      console.log('⏳ 等待配对完成...\n');
    }
    
    if (msg.action === 'login' && msg.phase === 'final') {
      if (msg.status === 'connected') {
        console.log('🎉 配对成功！');
        console.log('✅ 长连接已建立，可以查看状态：');
        console.log(`   node manager_test.js 然后输入: status ${phoneNumber}`);
      } else {
        console.log('⏰ 配对超时，但连接仍在后台运行');
        console.log('💡 你可以稍后再次尝试输入配对码');
      }
      
      console.log('\n按 Ctrl+C 退出');
    }
    
    if (!msg.ok) {
      console.error('❌ 错误:', msg.error);
      process.exit(1);
    }
  } catch (e) {
    console.error('解析消息失败:', e);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error);
});

ws.on('close', () => {
  console.log('🔌 连接已关闭');
  process.exit(0);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在退出...');
  ws.close();
});
