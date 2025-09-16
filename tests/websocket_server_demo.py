# ws_server_py312.py
import asyncio
import json
import uuid
import websockets
import threading
import time

HOST = "127.0.0.1"
PORT = 8001
WS_PATH = "/ws"

# 全局客户端管理
clients = {}  # {client_id: {'ws': websocket, 'info': client_info}}
client_counter = 0
main_loop = None  # 主事件循环引用

async def handle_client(ws):
    global client_counter
    
    # websockets>=12: handler 只有一个参数；路径可从 ws.path 读取
    if getattr(ws, "path", None) and ws.path != WS_PATH:
        # 1008: policy violation
        await ws.close(code=1008, reason="Invalid path")
        print(f"⛔ 拒绝非法路径: {ws.path}")
        return

    # 生成客户端ID并注册
    client_counter += 1
    client_id = f"client-{client_counter}"
    client_address = ws.remote_address
    
    clients[client_id] = {
        'ws': ws,
        'info': {
            'address': client_address,
            'connected_at': time.time(),
            'path': getattr(ws, 'path', WS_PATH)
        }
    }
    
    print(f"🔌 客户端连接: {client_id} ({client_address}) {f'path={ws.path}' if hasattr(ws, 'path') else ''}")
    print(f"📊 当前连接数: {len(clients)}")

    # 发送欢迎消息（包含客户端ID）
    welcome = {
        "type": "connected",
        "msgId": uuid.uuid4().hex,
        "data": {
            "message": "WebSocket 连接成功（Python）",
            "server": "py-websockets",
            "client_id": client_id,
            "total_clients": len(clients)
        },
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }

    try:
        await ws.send(json.dumps(welcome))
        print(f"📤 已发送欢迎消息: {welcome}")

        # 等待客户端的"欢迎确认"任意消息
        welcome_msg = await ws.recv()
        try:
            print(f"📨 [{client_id}] 欢迎消息: {json.loads(welcome_msg)}")
        except json.JSONDecodeError:
            print(f"📨 [{client_id}] 欢迎消息(原文): {welcome_msg}")

        # 登录请求现在通过交互式选择发送，不在这里自动发送
        # 可以通过键盘输入选择向哪个客户端发送登录请求

        # 持续接收并打印
        async for message in ws:
            try:
                data = json.loads(message)
                print(f"📨 [{client_id}] 收到消息: {data}")
            except json.JSONDecodeError:
                print(f"❌ [{client_id}] 非 JSON 消息: {message}")

    except websockets.ConnectionClosed as e:
        print(f"🔌 [{client_id}] 连接关闭: code={e.code}, reason={e.reason}")
    except Exception as e:
        # 打印异常避免 1011 不明原因
        import traceback
        print(f"❌ [{client_id}] 处理异常:\n", "".join(traceback.format_exception(e)))
        # 1011: internal error
        try:
            await ws.close(code=1011, reason="Internal server error")
        except Exception:
            pass
    finally:
        # 清理客户端连接
        if client_id in clients:
            del clients[client_id]
        print(f"👋 [{client_id}] 客户端离开: {client_address}")
        print(f"📊 当前连接数: {len(clients)}")

# 发送登录请求到指定客户端
async def send_login_request(client_id, phone_number):
    if client_id not in clients:
        print(f"❌ 客户端 {client_id} 不存在")
        return False
        
    login_request = {
        "type": "account_login",
        "msgId": uuid.uuid4().hex,
        "tag": "ack",  # or "log"
        "data": {
            "number": phone_number,
            "timeout": 60,
            "env": "prod",
        },
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    
    try:
        ws = clients[client_id]['ws']
        await ws.send(json.dumps(login_request))
        print(f"📤 已向 [{client_id}] 发送登录请求: {login_request}")
        return True
    except Exception as e:
        print(f"❌ 向 [{client_id}] 发送登录请求失败: {e}")
        return False

# 显示所有连接的客户端
def show_clients():
    if not clients:
        print("📭 当前没有连接的客户端")
        return
        
    print("📋 当前连接的客户端:")
    for client_id, client_info in clients.items():
        addr = client_info['info']['address']
        connected_time = time.time() - client_info['info']['connected_at']
        print(f"  - {client_id}: {addr} (连接时间: {connected_time:.1f}秒)")

# 交互式命令处理
def handle_user_input():
    """在单独线程中处理用户输入"""
    print("\n" + "="*60)
    print("📟 交互式命令:")
    print("  list          - 显示所有客户端")
    print("  login <id> <phone>  - 向指定客户端发送登录请求")
    print("  例如: login client-1 919079478346")
    print("  quit          - 退出服务器")
    print("="*60)
    
    while True:
        try:
            command = input("\n> ").strip()
            if not command:
                continue
                
            parts = command.split()
            cmd = parts[0].lower()
            
            if cmd == "quit":
                print("👋 服务器即将退出...")
                import os
                os._exit(0)
            elif cmd == "list":
                show_clients()
            elif cmd == "login" and len(parts) >= 3:
                client_id = parts[1]
                phone_number = parts[2]
                # 使用主事件循环执行异步任务
                asyncio.run_coroutine_threadsafe(
                    send_login_request(client_id, phone_number), 
                    main_loop
                )
            else:
                print("❓ 未知命令。可用命令: list, login <id> <phone>, quit")
        except KeyboardInterrupt:
            print("\n👋 服务器即将退出...")
            import os
            os._exit(0)
        except Exception as e:
            print(f"❌ 命令处理错误: {e}")

async def main():
    global main_loop
    main_loop = asyncio.get_event_loop()
    
    # 启动交互式输入线程
    input_thread = threading.Thread(target=handle_user_input, daemon=True)
    input_thread.start()
    
    # websockets>=12 的 serve 只传入单参数 handler
    async with websockets.serve(handle_client, HOST, PORT):
        print(f"✅ Python WebSocket 服务器已启动: ws://{HOST}:{PORT}{WS_PATH}")
        print("💡 等待客户端连接...")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
