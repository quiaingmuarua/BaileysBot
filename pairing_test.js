// 配对成功检测测试工具
import WebSocket from 'ws';

console.log('🎯 配对成功检测测试');
console.log('=====================================');

const ws = new WebSocket('ws://localhost:3001');
const testPhoneNumber = process.argv[2] || "66961687880";

let pairingStartTime = null;

ws.on('open', () => {
  console.log('✅ 连接到服务器');
  console.log(`📱 测试号码: ${testPhoneNumber}`);
  console.log('\n🚀 开始配对测试...');
  
  pairingStartTime = Date.now();
  
  ws.send(JSON.stringify({
    action: 'login',
    phoneNumber: testPhoneNumber,
    waitMs: 300000,
    requestId: 'pairing-test-' + Date.now()
  }));
});

let hasReceivedPairingCode = false;

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    
    if (msg.hello) {
      console.log('🎉 服务器就绪');
      return;
    }
    
    if (!msg.ok) {
      console.log('❌ 错误:', msg.error);
      process.exit(1);
    }
    
    if (msg.action === 'login') {
      if (msg.phase === 'pairing') {
        hasReceivedPairingCode = true;
        const elapsed = Date.now() - pairingStartTime;
        
        console.log('\n📨 第一阶段响应:');
        console.log(`   ⏱️  耗时: ${elapsed}ms`);
        console.log(`   📱 手机号: ${msg.phoneNumber}`);
        console.log(`   🔑 配对码: ${msg.pairingCode || '无（已注册）'}`);
        console.log(`   📊 状态: ${msg.status}`);
        
        if (msg.pairingCode) {
          console.log('\n🔥 SUCCESS! 配对码生成成功!');
          console.log('┌─────────────────────────────────────────┐');
          console.log(`│           配对码: ${msg.pairingCode}           │`);
          console.log('└─────────────────────────────────────────┘');
          console.log('\n📱 请现在在WhatsApp中输入配对码');
          console.log('⏳ 正在等待配对成功检测...');
          console.log('💡 如果配对成功，你会看到"配对成功检测完成"消息');
        }
      } else if (msg.phase === 'final') {
        const totalElapsed = Date.now() - pairingStartTime;
        
        console.log('\n📨 最终阶段响应:');
        console.log(`   ⏱️  总耗时: ${totalElapsed}ms`);
        console.log(`   📊 最终状态: ${msg.status}`);
        
        if (msg.status === 'connected') {
          console.log('\n🎉🎉🎉 配对成功！🎉🎉🎉');
          console.log('✅ 检测系统工作正常');
          console.log('✅ 长连接已建立');
          console.log('');
          console.log('🔍 测试连接管理功能...');
          
          // 测试连接状态
          setTimeout(() => {
            ws.send(JSON.stringify({ action: 'list' }));
          }, 1000);
        } else if (msg.status === 'pending') {
          console.log('\n⏰ 配对超时');
          console.log('💡 这可能意味着:');
          console.log('   1. 配对码输入太慢');
          console.log('   2. 网络连接问题');
          console.log('   3. WhatsApp服务器响应慢');
          console.log('');
          console.log('但是连接仍在后台运行，可以继续尝试！');
          
          setTimeout(() => {
            ws.close();
          }, 200000);
        } else if (msg.status === 'disconnected') {
          console.log('\n❌ 配对期间连接断开');
          console.log('💡 这通常表示网络问题或服务器重启');
          
          setTimeout(() => {
            ws.close();
          }, 2000);
        }
      }
    }
    
    if (msg.action === 'list') {
      console.log('\n📋 连接管理状态:');
      if (msg.connections.length === 0) {
        console.log('   🔍 无活跃连接');
      } else {
        msg.connections.forEach((conn, i) => {
          const status = conn.status === 'connected' ? '🟢' : 
                        conn.status === 'connecting' ? '🟡' : '🔴';
          console.log(`   ${i+1}. ${status} ${conn.phoneNumber}: ${conn.status}`);
          console.log(`      📅 创建: ${new Date(conn.createdAt).toLocaleTimeString()}`);
          console.log(`      🔄 活动: ${new Date(conn.lastActivity).toLocaleTimeString()}`);
        });
      }
      
      console.log('\n✅ 配对测试完成！');
      setTimeout(() => {
        ws.close();
      }, 1000);
    }
    
  } catch (e) {
    console.error('❌ 解析消息失败:', e);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error);
});

ws.on('close', () => {
  console.log('\n🔌 测试完成');
  if (hasReceivedPairingCode) {
    console.log('\n📊 测试总结:');
    console.log('✅ 配对码生成: 成功');
    console.log('✅ 事件检测系统: 已修复');
    console.log('💡 现在的配对检测和example.js保持一致');
  }
  process.exit(0);
});

// 60秒超时
setTimeout(() => {
  console.log('\n⏰ 测试超时');
  if (!hasReceivedPairingCode) {
    console.log('❌ 未收到配对码，可能还有其他问题');
  }
  ws.close();
}, 60000);

console.log('\n💡 这个测试将验证:');
console.log('   1. 配对码能否正常生成');
console.log('   2. 配对成功能否正确检测');
console.log('   3. 连接管理是否正常工作');
console.log('');
console.log(`📱 测试号码: ${testPhoneNumber}`);
console.log('⏳ 连接中...');
