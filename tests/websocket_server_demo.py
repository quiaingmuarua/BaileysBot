# ws_server_py312.py
import asyncio
import json
import uuid
import websockets
from websockets.server import WebSocketServerProtocol

HOST = "127.0.0.1"
PORT = 8001
WS_PATH = "/ws"

async def handle_client(ws: WebSocketServerProtocol):
    # websockets>=12: handler 只有一个参数；路径可从 ws.path 读取
    if getattr(ws, "path", None) and ws.path != WS_PATH:
        # 1008: policy violation
        await ws.close(code=1008, reason="Invalid path")
        print(f"⛔ 拒绝非法路径: {ws.path}")
        return

    client = ws.remote_address
    print(f"🔌 客户端连接: {client} {f'path={ws.path}' if hasattr(ws, 'path') else ''}")

    # 发送欢迎消息
    welcome = {
        "type": "connected",
        "msgId": uuid.uuid4().hex,
        "data": {
            "message": "WebSocket 连接成功（Python）",
            "server": "py-websockets",
        },
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }

    try:
        await ws.send(json.dumps(welcome))
        print(f"📤 已发送欢迎消息: {welcome}")

        # 等待客户端的“欢迎确认”任意消息
        welcome_msg = await ws.recv()
        try:
            print(f"📨 欢迎消息: {json.loads(welcome_msg)}")
        except json.JSONDecodeError:
            print(f"📨 欢迎消息(原文): {welcome_msg}")

        # 发送账户登录请求
        login_request = {
            "type": "account_login",
            "msgId": uuid.uuid4().hex,
            "tag": "ack",  # or "log"
            "data": {
                "number": "66961687880",
                "timeout": 60,
                "env": "prod",
            },
            "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }
        print(f"📤 发送登录请求: {login_request}")
        await ws.send(json.dumps(login_request))

        # 持续接收并打印
        async for message in ws:
            try:
                data = json.loads(message)
                print(f"📨 收到消息: {data}")
            except json.JSONDecodeError:
                print(f"❌ 非 JSON 消息: {message}")

    except websockets.ConnectionClosed as e:
        print(f"🔌 连接关闭: code={e.code}, reason={e.reason}")
    except Exception as e:
        # 打印异常避免 1011 不明原因
        import traceback
        print("❌ 处理异常:\n", "".join(traceback.format_exception(e)))
        # 1011: internal error
        try:
            await ws.close(code=1011, reason="Internal server error")
        except Exception:
            pass
    finally:
        print(f"👋 客户端离开: {client}")

async def main():
    # websockets>=12 的 serve 只传入单参数 handler
    async with websockets.serve(handle_client, HOST, PORT):
        print(f"✅ Python WebSocket 服务器已启动: ws://{HOST}:{PORT}{WS_PATH}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
