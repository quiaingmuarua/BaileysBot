import asyncio
import json
import uuid
import websockets
from datetime import datetime

# WebSocket 服务器地址
WS_URL = 'ws://localhost:8001/ws'

async def connect_websocket():
    """建立 WebSocket 连接"""
    try:
        websocket = await websockets.connect(WS_URL)
        print(f"✅ WebSocket 连接成功: {WS_URL}")
        return websocket
    except Exception as e:
        print(f"❌ WebSocket 连接失败: {e}")
        return None

async def login_demo():
    """账户登录演示 - 对应 HTTP 的 login_demo"""
    print("\n🔍 WebSocket 账户登录演示...")
    
    ws = await connect_websocket()
    if not ws:
        return
    
    try:
        # 等待连接确认消息
        welcome_msg = await ws.recv()
        print(f"📨 欢迎消息: {json.loads(welcome_msg)}")
        
        # 发送账户登录请求
        login_request = {
            "type": "account_login",
            "msgId": uuid.uuid4().hex,
            "tag": "ack", #log
            "data": {
                "number": "66952407035",
                "timeout": 60,
                "env": "prod",
            }
        }
        
        print(f"📤 发送登录请求: {login_request}")
        await ws.send(json.dumps(login_request))
        
        # 接收消息（包括实时日志和最终响应）
        message_count = 0
        max_messages = 10  # 限制接收消息数量，避免无限等待
        
        while message_count < max_messages:
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=100)
                message = json.loads(response)
                message_count += 1
                
                print(f"new_message {message}" )
                    
            except asyncio.TimeoutError:
                print("⏰ 等待响应超时")
                break
                
    except Exception as e:
        print(f"❌ 登录演示失败: {e}")
    finally:
        await ws.close()
        print("🔌 WebSocket 连接已关闭")

async def ping_pong_demo():
    """心跳检测演示"""
    print("\n🔍 WebSocket Ping-Pong 演示...")
    
    ws = await connect_websocket()
    if not ws:
        return
    
    try:
        # 等待连接确认
        await ws.recv()
        
        # 发送 ping
        ping_msg_id = uuid.uuid4().hex
        ping_request = {"type": "ping", "msgId": ping_msg_id}
        print(f"📤 发送 Ping: {ping_request}")
        await ws.send(json.dumps(ping_request))
        
        # 等待 pong 响应
        response = await asyncio.wait_for(ws.recv(), timeout=10)
        message = json.loads(response)
        
        if message['type'] == 'pong' and message.get('msgId') == ping_msg_id:
            print(f"✅ 收到 Pong (msgId匹配): {message}")
        else:
            print(f"❌ 期望 pong with msgId {ping_msg_id}，实际收到: {message}")
            
    except Exception as e:
        print(f"❌ Ping-Pong 演示失败: {e}")
    finally:
        await ws.close()

async def status_demo():
    """状态查询演示"""
    print("\n🔍 WebSocket 状态查询演示...")
    
    ws = await connect_websocket()
    if not ws:
        return
    
    try:
        # 等待连接确认
        await ws.recv()
        
        # 发送状态查询
        status_msg_id = uuid.uuid4().hex
        status_request = {"type": "get_status", "msgId": status_msg_id}
        print(f"📤 发送状态查询: {status_request}")
        await ws.send(json.dumps(status_request))
        
        # 等待状态响应
        response = await asyncio.wait_for(ws.recv(), timeout=10)
        message = json.loads(response)
        
        if message['type'] == 'status' and message.get('msgId') == status_msg_id:
            print(f"✅ 状态响应 (msgId匹配): {message['data']}")
        else:
            print(f"❌ 期望 status with msgId {status_msg_id}，实际收到: {message}")
            
    except Exception as e:
        print(f"❌ 状态查询演示失败: {e}")
    finally:
        await ws.close()

async def timeout_demo():
    """超时场景演示 - 对应 HTTP 的 timeout_demo"""
    print("\n🔍 WebSocket 超时演示...")
    
    ws = await connect_websocket()
    if not ws:
        return
    
    try:
        # 等待连接确认
        await ws.recv()
        
        # 发送短超时的登录请求
        timeout_msg_id = uuid.uuid4().hex
        timeout_request = {
            "type": "account_login",
            "msgId": timeout_msg_id,
            "data": {
                "number": "66952407035",
                "timeout": 10,
                "env": "prod"
            }
        }
        
        print(f"📤 发送超时测试请求: {timeout_request}")
        await ws.send(json.dumps(timeout_request))
        
        # 接收响应
        message_count = 0
        while message_count < 5:  # 限制消息数量
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=15)
                message = json.loads(response)
                message_count += 1
                
                print(f"📨 [{message_count}] 消息: {message}")
                
                if message['type'] in ['account_login_response', 'account_login_error']:
                    break
                    
            except asyncio.TimeoutError:
                print("⏰ 等待响应超时")
                break
                
    except Exception as e:
        print(f"❌ 超时演示失败: {e}")
    finally:
        await ws.close()

async def error_handling_demo():
    """错误处理演示"""
    print("\n🔍 WebSocket 错误处理演示...")
    
    ws = await connect_websocket()
    if not ws:
        return
    
    try:
        # 等待连接确认
        await ws.recv()
        
        # 发送无效消息类型
        invalid_msg_id = uuid.uuid4().hex
        invalid_request = {"type": "invalid_message_type", "msgId": invalid_msg_id}
        print(f"📤 发送无效消息: {invalid_request}")
        await ws.send(json.dumps(invalid_request))
        
        # 等待错误响应
        response = await asyncio.wait_for(ws.recv(), timeout=10)
        message = json.loads(response)
        
        if message['type'] == 'error' and message.get('msgId') == invalid_msg_id:
            print(f"✅ 错误处理正常 (msgId匹配): {message['error']}")
        else:
            print(f"❌ 期望 error with msgId {invalid_msg_id}，实际收到: {message}")
            
        # 发送缺少必填字段的登录请求
        invalid_login_msg_id = uuid.uuid4().hex
        invalid_login = {
            "type": "account_login",
            "msgId": invalid_login_msg_id,
            "data": {
                # 缺少 number 字段
                "timeout": 30,
                "env": "prod"
            }
        }
        
        print(f"📤 发送无效登录请求: {invalid_login}")
        await ws.send(json.dumps(invalid_login))
        
        # 等待错误响应
        response = await asyncio.wait_for(ws.recv(), timeout=10)
        message = json.loads(response)
        print(f"📨 登录错误响应 (msgId: {message.get('msgId', 'N/A')}): {message}")
            
    except Exception as e:
        print(f"❌ 错误处理演示失败: {e}")
    finally:
        await ws.close()

async def realtime_monitoring_demo():
    """实时监控演示 - 展示 WebSocket 的实时优势"""
    print("\n🔍 WebSocket 实时监控演示...")
    
    ws = await connect_websocket()
    if not ws:
        return
    
    try:
        # 等待连接确认
        await ws.recv()
        
        print("🎯 启动实时监控，将显示所有实时日志...")
        
        # 发送登录请求
        monitor_msg_id = uuid.uuid4().hex
        login_request = {
            "type": "account_login",
            "msgId": monitor_msg_id,
            "data": {
                "number": "1234567890",
                "timeout": 30,
                "env": "prod"
            }
        }
        
        await ws.send(json.dumps(login_request))
        
        # 持续接收并显示实时日志
        start_time = datetime.now()
        
        while True:
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=35)
                message = json.loads(response)
                current_time = datetime.now()
                elapsed = (current_time - start_time).total_seconds()
                msg_id = message.get('msgId', 'N/A')
                
                if message['type'] == 'log':
                    log_data = message.get('data', {})
                    if 'content' in log_data:
                        print(f"[{elapsed:6.2f}s] 📄 [{msg_id}] {log_data.get('stream', 'unknown')}: {log_data['content']}")
                    else:
                        print(f"[{elapsed:6.2f}s] 📄 [{msg_id}] 日志: {log_data}")
                elif message['type'] == 'account_login_response':
                    print(f"[{elapsed:6.2f}s] ✅ [{msg_id}] 最终响应: {message.get('data', {})}")
                    break
                elif message['type'] == 'account_login_error':
                    print(f"[{elapsed:6.2f}s] ❌ [{msg_id}] 错误响应: {message.get('error', 'Unknown error')}")
                    break
                else:
                    print(f"[{elapsed:6.2f}s] 📨 [{msg_id}] {message['type']}: {message}")
                    
            except asyncio.TimeoutError:
                print("⏰ 监控超时结束")
                break
                
    except Exception as e:
        print(f"❌ 实时监控失败: {e}")
    finally:
        await ws.close()

async def main():
    """主函数 - 运行所有演示"""
    print("🚀 WebSocket 演示程序开始...")
    print("=" * 50)
    
    # 运行各种演示
    await login_demo()
    print("🎉 所有 WebSocket 演示完成！")

if __name__ == '__main__':
    # 运行演示
    try:
        asyncio.run(main())
    except ImportError as e:
        if 'websockets' in str(e):
            print("❌ 缺少 websockets 库，请安装:")
            print("pip install websockets")
        else:
            print(f"❌ 导入错误: {e}")
        exit(1)
