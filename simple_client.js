// 简单配对测试客户端
import WebSocket from 'ws';

const phoneNumber = process.argv[2] || '66961687880';

console.log('🚀 连接到简单配对服务器...');
const ws = new WebSocket('ws://localhost:3002');

ws.on('open', () => {
  console.log('✅ 连接成功');
  
  // 发送配对请求
  ws.send(JSON.stringify({
    action: 'pair',
    phoneNumber: phoneNumber,
    requestId: `test-${Date.now()}`
  }));
  
  console.log(`📱 开始配对手机号: ${phoneNumber}`);
});

ws.on('message', (data) => {
  try {
    const response = JSON.parse(data.toString());
    console.log('📨 收到响应:', JSON.stringify(response, null, 2));
    
    if (response.phase === 'starting') {
      console.log('🏁 配对流程已开始...');
    }
    
    if (response.pairingCode) {
      console.log(`🔑 配对码: ${response.pairingCode}`);
      console.log('📱 请在WhatsApp中输入此配对码！');
    }
    
    if (response.phase === 'final') {
      console.log(`✨ 配对结果: ${response.status}`);
      console.log(`💬 消息: ${response.message}`);
      
      if (response.status === 'connected') {
        console.log('🎉 配对成功！');
      } else {
        console.log('⏰ 配对超时，但连接仍在后台运行');
      }
      
      setTimeout(() => {
        console.log('👋 3秒后退出...');
        process.exit(0);
      }, 3000);
    }
    
    if (!response.ok) {
      console.error('❌ 错误:', response.error);
      process.exit(1);
    }
    
  } catch (e) {
    console.error('❌ 解析响应失败:', e);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket错误:', error);
});

ws.on('close', () => {
  console.log('🔌 连接已关闭');
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在退出...');
  ws.close();
  process.exit(0);
});
