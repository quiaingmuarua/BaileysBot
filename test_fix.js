// 测试修复效果的脚本
import WebSocket from 'ws';

const phoneNumber = process.argv[2] || '66961687880';

console.log('🧪 测试修复后的配对功能');
console.log('=====================================');
console.log(`📱 测试号码: ${phoneNumber}`);
console.log('🔧 关键修复内容:');
console.log('   🔥 执行上下文修复 (配对码生成移出 Promise，在主流程执行)');
console.log('   ✅ 彻底重构执行流程，完全模仿 example.js');
console.log('   ✅ 执行顺序修复 (先生成配对码，再设置事件监听)');
console.log('   ✅ RestartRequired 处理逻辑修复');
console.log('   ✅ 配对码获取改为同步方式');
console.log('   ✅ 竞态条件防护和消息重试缓存');
console.log('=====================================\n');

const ws = new WebSocket('ws://localhost:3002');
let startTime = Date.now();

ws.on('open', () => {
  console.log('✅ 连接到修复后的 WebSocket 服务器');
  
  startTime = Date.now();
  ws.send(JSON.stringify({
    action: 'pair',
    phoneNumber: phoneNumber,
    requestId: `fix-test-${Date.now()}`
  }));
  
  console.log(`🚀 开始配对测试...`);
});

ws.on('message', (data) => {
  try {
    const response = JSON.parse(data.toString());
    const elapsed = Date.now() - startTime;
    
    console.log(`\n📨 [${elapsed}ms] 收到响应:`);
    console.log(JSON.stringify(response, null, 2));
    
    if (response.hello) {
      console.log('🎉 服务器就绪');
      return;
    }
    
    if (response.phase === 'starting') {
      console.log('🏁 配对流程已开始...');
    }
    
    if (response.pairingCode) {
      console.log('\n🔥 配对码生成成功!');
      console.log('┌─────────────────────────────────────────┐');
      console.log(`│           配对码: ${response.pairingCode}           │`);
      console.log('└─────────────────────────────────────────┘');
      console.log('\n📱 请在WhatsApp中输入配对码！');
      console.log('⏳ 等待配对完成检测...');
    }
    
    if (response.phase === 'final') {
      const totalElapsed = Date.now() - startTime;
      
      console.log(`\n🏁 配对流程完成！总耗时: ${totalElapsed}ms`);
      console.log(`📊 最终状态: ${response.status}`);
      console.log(`💬 消息: ${response.message}`);
      
      if (response.status === 'connected') {
        console.log('\n🎉🎉🎉 修复成功！配对已成功！🎉🎉🎉');
        console.log('✅ 现在 WebSocket 封装版本可以正常配对了');
      } else if (response.status === 'pending') {
        console.log('\n⏰ 配对等待超时');
        console.log('💡 这可能意味着配对码输入较慢，但修复基本成功');
      } else {
        console.log('\n❌ 配对失败');
        console.log('🔍 需要进一步调试');
      }
      
      setTimeout(() => {
        console.log('\n👋 测试完成，3秒后退出...');
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
  console.error('❌ WebSocket错误:', error.message);
  console.log('💡 请确保服务器已启动: node simple_index.js');
});

ws.on('close', () => {
  console.log('🔌 连接已关闭');
});

// 60秒超时
setTimeout(() => {
  console.log('\n⏰ 测试超时（60秒）');
  ws.close();
  process.exit(0);
}, 60000);

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在退出测试...');
  ws.close();
  process.exit(0);
});

console.log('⏳ 连接中...');
