# ws_server_py312.py
import asyncio
import copy
import json
import random
import time
import uuid
from collections.abc import Iterable

import websockets
from bson import timestamp
from websockets.server import WebSocketServerProtocol

HOST = "127.0.0.1"
PORT = 18888
WS_PATH = "/ws"

async def handle_client(ws: WebSocketServerProtocol):
    # websockets>=12: handler 只有一个参数；路径可从 ws.path 读取
    # if getattr(ws, "path", None) and ws.path != WS_PATH:
    #     # 1008: policy violation
    #     await ws.close(code=1008, reason="Invalid path")
    #     print(f"⛔ 拒绝非法路径: {ws.path}")
    #     return

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
        await send_msg(ws)
        # 持续接收并打印
        async for message in ws:
            try:
                data = json.loads(message)
                print(f"📨 收到消息: {data}")
                if data.get("data").get("tag", None) == "loginResult":
                  continue
                if not data.get("data").get("methodType", None):
                    continue
                data["date"]= datetime.today().strftime("%Y-%m-%d")
                data["timestamp"] = int(time.time())
                data_result=copy.deepcopy(data.get("data", {}).get("result", []))
                new_data=[]
                if isinstance(data_result,Iterable):
                    for item_result in data_result:
                        data["data"]['result']=item_result
                        new_data.append(copy.deepcopy(data))
                    print(f"insert_many {datetime.now()} {data} ")
                    collection.insert_many(new_data)
                else:
                    collection.insert_one(data)
                await asyncio.sleep(random.randint(60, 180))
                await send_msg(ws)
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



async  def send_msg(ws):
    file_name="uus.txt"
    with open(file_name) as f:
        numbers = [line.strip() for line in f.readlines()]
        random.shuffle(numbers)
        numbers = numbers[:random.randint(15,20)]
        # numbers=['918523033371',"919341992122","918368459162","916203800596","8613760212132"]
        # numbers.append("19059955571")
        numbers.append("12066409886")
        # 发送账户登录请求
        login_request = {
            "type": "businessProfile",
            "msgId": uuid.uuid4().hex,
            "tid": uuid.uuid4().hex,
            "data": {
                "number": "918523033371",
                "timeout": 300,
                "env": "prod",
                # "proxy": "direct",
                "target_number": "12066409886",
            },
            "extra":{
              "fileName":file_name
            },

            "date": datetime.today().strftime("%Y-%m-%d"),
            "timestamp": int(time.time())
        }
        '''
        <iq id='027c' xmlns='w:profile:picture' to='s.whatsapp.net' target='2349130556281@s.whatsapp.net' type='get'><picture type='preview' common_gid='120363264252831569@g.us'/></iq>

        '''
        print(f"📤 发送请求: {login_request}")
        await ws.send(json.dumps(login_request))

async def main():
    # websockets>=12 的 serve 只传入单参数 handler
    async with websockets.serve(handle_client, HOST, PORT):
        print(f"✅ Python WebSocket 服务器已启动: ws://{HOST}:{PORT}{WS_PATH}")
        await asyncio.Future()  # run forever


def batch_get(seq, limit=1000, start=0):
    try:
        if not isinstance(seq, Iterable):
            return []
        if not isinstance(seq, list):
            seq = list(seq)
        while True:
            batch_result = seq[start: start + limit]
            if batch_result:
                yield batch_result
                start += limit
            else:
                break
    except Exception as e:
        raise TypeError("{} 发现异常 {}".format(seq, e))


from pymongo import MongoClient
from datetime import datetime

# MongoDB 连接信息
mongo_uri = "mongodb://root:xiaoan666!@35.187.225.32:27017/?authMechanism=SCRAM-SHA-1"

# 连接 MongoDB
client = MongoClient(mongo_uri)

# 选择数据库和集合
db = client["token_statistic"]  # 你可以改成自己的数据库名
collection = db["web_was_test"]  # 你可以改成自己的集合名

if __name__ == "__main__":
    asyncio.run(main())
