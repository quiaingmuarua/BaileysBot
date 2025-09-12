# WebSocket API 对接文档

## 🔗 连接信息

- **WebSocket 地址**: `ws://localhost:8001/ws`
- **协议**: WebSocket
- **消息格式**: JSON

## 📋 消息结构

### 统一消息格式
```json
{
  "type": "消息类型",
  "msgId": "消息唯一标识",
  "tag": "消息标签（可选）",
  "timestamp": "ISO时间戳",
  "data": "消息数据（可选）"
}
```

## 🚀 连接流程

### 1. 建立连接
客户端连接后，服务器会发送欢迎消息：
```json
{
  "type": "connected",
  "timestamp": "2025-09-12T08:56:55.609Z",
  "data": {
    "clientId": 1,
    "message": "WebSocket 连接成功"
  }
}
```

## 📤 客户端请求

### 账户登录请求
```json
{
  "type": "account_login",
  "msgId": "af2219f373b74fda980b47aaac457ab8",
  "tag": "ack",
  "data": {
    "number": "66952407035",
    "timeout": 60,
    "env": "prod"
  }
}
```

**请求参数说明:**
- `type`: 固定为 `"account_login"`
- `msgId`: 客户端生成的唯一标识，用于追踪响应
- `tag`: 请求标签，通常为 `"ack"`
- `data.number`: 手机号码（必填）
- `data.timeout`: 超时时间（秒），默认60
- `data.env`: 环境标识，通常为 `"prod"`

## 📨 服务器响应

### 1. 确认响应 (ACK)
服务器收到请求后立即返回确认：
```json
{
  "type": "ack",
  "timestamp": "2025-09-12T08:56:55.616Z",
  "msgId": "af2219f373b74fda980b47aaac457ab8",
  "data": {
    "number": "66952407035",
    "timeout": 60,
    "env": "prod"
  }
}
```

### 2. 登录结果响应

#### 已登录成功（直接返回）
```json
{
  "type": "account_login",
  "timestamp": "2025-09-12T08:56:58.270Z",
  "msgId": "af2219f373b74fda980b47aaac457ab8",
  "data": {
    "code": 200,
    "note": "has login before"
  }
}
```

#### 获取配对码成功
```json
{
  "type": "account_login",
  "timestamp": "2025-09-12T08:48:43.241Z",
  "msgId": "04f01507d70d444aa61c859127241d59",
  "data": {
    "pairCode": "5FRF4RZW",
    "code": 200
  }
}
```

#### 配对码超时
```json
{
  "type": "account_login",
  "timestamp": "2025-09-12T08:49:47.289Z",
  "msgId": "04f01507d70d444aa61c859127241d59",
  "data": {
    "code": 503,
    "note": "waiting for pair code timeout"
  }
}
```

## 📊 状态码定义

### 处理状态码 (1xx)
| 状态码 | 说明 |
|--------|------|
| 100 | 开始处理 |
| 101 | 请求配对码 |
| 102 | 等待配对（配对码请求成功） |

### 成功状态码 (2xx)
| 状态码 | 说明 |
|--------|------|
| 200 | 登录成功 |

### 错误状态码 (5xx)
| 状态码 | 说明 |
|--------|------|
| 500 | 进程异常断开 |
| 501 | 账号登录中，并发处理被拒绝 |
| 502 | 获取配对码被拒绝 |
| 503 | 进程超时退出 |

## 🔄 典型交互流程

### 场景1: 首次登录需要配对码
```
1. 客户端 → 服务器: account_login 请求
2. 服务器 → 客户端: ack 确认
3. 服务器 → 客户端: account_login (code: 101, 请求配对码)
4. 服务器 → 客户端: account_login (code: 102, pairCode: "5FRF4RZW")
5. [用户在WhatsApp中输入配对码]
6. 服务器 → 客户端: account_login (code: 200, 登录成功)
```

### 场景2: 已登录过的账号
```
1. 客户端 → 服务器: account_login 请求
2. 服务器 → 客户端: ack 确认
3. 服务器 → 客户端: account_login (code: 200, note: "has login before")
```

### 场景3: 配对码超时
```
1. 客户端 → 服务器: account_login 请求
2. 服务器 → 客户端: ack 确认
3. 服务器 → 客户端: account_login (code: 101, 请求配对码)
4. 服务器 → 客户端: account_login (code: 102, pairCode: "5FRF4RZW")
5. [用户未及时输入配对码]
6. 服务器 → 客户端: account_login (code: 503, note: "waiting for pair code timeout")
```

## 💻 客户端实现示例

### Python 实现
```python
import asyncio
import json
import uuid
import websockets

async def login_account(number, timeout=60):
    """账户登录"""
    uri = "ws://localhost:8001/ws"
    
    async with websockets.connect(uri) as websocket:
        # 等待欢迎消息
        welcome = await websocket.recv()
        print(f"连接成功: {json.loads(welcome)}")
        
        # 发送登录请求
        msg_id = uuid.uuid4().hex
        request = {
            "type": "account_login",
            "msgId": msg_id,
            "tag": "ack",
            "data": {
                "number": number,
                "timeout": timeout,
                "env": "prod"
            }
        }
        
        await websocket.send(json.dumps(request))
        print(f"发送请求: {request}")
        
        # 处理响应
        while True:
            response = await websocket.recv()
            message = json.loads(response)
            
            if message.get("msgId") == msg_id:
                print(f"收到响应: {message}")
                
                if message["type"] == "ack":
                    print("✅ 请求已确认")
                    continue
                    
                elif message["type"] == "account_login":
                    code = message["data"]["code"]
                    
                    if code == 200:
                        pair_code = message["data"].get("pairCode")
                        if pair_code:
                            print(f"🔑 配对码: {pair_code}")
                            print("请在 WhatsApp 中输入此配对码")
                        else:
                            print("✅ 登录成功!")
                            break
                            
                    elif code in [101, 102]:
                        print("⏳ 正在处理登录...")
                        
                    elif code >= 500:
                        note = message["data"].get("note", "未知错误")
                        print(f"❌ 登录失败: {note}")
                        break

# 使用示例
asyncio.run(login_account("66952407035"))
```

### JavaScript 实现
```javascript
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

function loginAccount(number, timeout = 60) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://localhost:8001/ws');
        
        ws.on('open', () => {
            console.log('WebSocket 连接成功');
        });
        
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'connected') {
                // 发送登录请求
                const msgId = uuidv4().replace(/-/g, '');
                const request = {
                    type: 'account_login',
                    msgId: msgId,
                    tag: 'ack',
                    data: {
                        number: number,
                        timeout: timeout,
                        env: 'prod'
                    }
                };
                
                ws.send(JSON.stringify(request));
                console.log('发送登录请求:', request);
                return;
            }
            
            if (message.type === 'ack') {
                console.log('✅ 请求已确认');
                return;
            }
            
            if (message.type === 'account_login') {
                const code = message.data.code;
                
                if (code === 200) {
                    const pairCode = message.data.pairCode;
                    if (pairCode) {
                        console.log(`🔑 配对码: ${pairCode}`);
                        resolve({ success: true, pairCode: pairCode });
                    } else {
                        console.log('✅ 登录成功!');
                        resolve({ success: true, message: '登录成功' });
                    }
                } else if (code >= 500) {
                    const note = message.data.note || '未知错误';
                    console.log(`❌ 登录失败: ${note}`);
                    reject(new Error(note));
                }
                
                ws.close();
            }
        });
        
        ws.on('error', (error) => {
            console.error('WebSocket 错误:', error);
            reject(error);
        });
    });
}

// 使用示例
loginAccount('66952407035')
    .then(result => console.log('结果:', result))
    .catch(error => console.error('错误:', error));
```

## 🔧 错误处理建议

1. **连接断开**: 实现自动重连机制
2. **消息超时**: 为每个请求设置合理的超时时间
3. **状态码处理**: 根据不同状态码采取相应的处理策略
4. **并发限制**: 避免同一账号并发登录请求

## 📝 注意事项

1. **msgId 追踪**: 客户端必须通过 msgId 来匹配请求和响应
2. **配对码时效**: 配对码有时效性，需要及时在 WhatsApp 中输入
3. **环境标识**: 建议在生产环境中使用 `"env": "prod"`
4. **超时设置**: 根据网络情况合理设置超时时间
5. **错误重试**: 对于临时错误（5xx），可以实现重试机制
