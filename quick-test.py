#!/usr/bin/env python3
"""
快速测试 WebSocket 消息结构的脚本
演示 msgId 的使用和统一消息格式
"""

import asyncio
import json
import uuid
import websockets

async def quick_test():
    """快速测试新的消息结构"""
    print("🚀 快速测试 WebSocket 新消息结构...")
    
    try:
        # 连接 WebSocket
        ws = await websockets.connect('ws://localhost:8001/ws')
        print("✅ 连接成功")
        
        # 等待连接确认
        welcome = await ws.recv()
        print(f"📨 欢迎消息: {json.loads(welcome)}")
        
        # 测试 Ping with msgId
        ping_id = uuid.uuid4().hex[:8]  # 短一些的 ID
        ping_msg = {"type": "ping", "msgId": ping_id}
        print(f"\n📤 发送 Ping (msgId: {ping_id})")
        await ws.send(json.dumps(ping_msg))
        
        # 接收 Pong
        pong = await asyncio.wait_for(ws.recv(), timeout=5)
        pong_data = json.loads(pong)
        print(f"📨 收到 Pong: type={pong_data['type']}, msgId={pong_data.get('msgId', 'N/A')}")
        
        # 验证 msgId 匹配
        if pong_data.get('msgId') == ping_id:
            print("✅ msgId 匹配成功！")
        else:
            print("❌ msgId 不匹配")
        
        # 测试账户登录
        login_id = uuid.uuid4().hex[:8]
        login_msg = {
            "type": "account_login",
            "msgId": login_id,
            "data": {
                "number": "1234567890",  # 测试号码
                "timeout": 10,
                "env": "test"
            }
        }
        print(f"\n📤 发送登录请求 (msgId: {login_id})")
        await ws.send(json.dumps(login_msg))
        
        # 接收几条响应消息
        for i in range(3):
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=5)
                data = json.loads(response)
                msg_type = data.get('type', 'unknown')
                msg_id = data.get('msgId', 'N/A')
                
                print(f"📨 [{i+1}] {msg_type} (msgId: {msg_id})")
                
                if msg_type == 'log':
                    log_content = data.get('data', {}).get('content', '')
                    print(f"    📄 日志: {log_content}")
                elif msg_type in ['account_login_response', 'account_login_error']:
                    print(f"    ✅ 登录结果: {data}")
                    break
                    
            except asyncio.TimeoutError:
                print("⏰ 接收超时")
                break
        
        await ws.close()
        print("\n🎉 测试完成！")
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")

if __name__ == '__main__':
    print("请确保 WebSocket 服务器正在运行: npm run ws-server")
    print("=" * 50)
    asyncio.run(quick_test())
