# WebSocket 消息结构示例

## 统一消息格式

所有 WebSocket 消息都遵循以下基本结构：

```json
{
  "type": "消息类型",
  "msgId": "消息ID（用于追踪，可选）",
  "timestamp": "ISO时间戳",
  "data": "消息数据（可选）",
  "error": "错误信息（可选）",
  "code": "状态码（可选）"
}
```

## 客户端发送消息示例

### 1. 账户登录请求
```json
{
  "type": "account_login",
  "msgId": "abc123def456",
  "data": {
    "number": "447999803105",
    "timeout": 60,
    "env": "prod"
  }
}
```

### 2. 心跳检测
```json
{
  "type": "ping",
  "msgId": "ping_001"
}
```

### 3. 获取状态
```json
{
  "type": "get_status",
  "msgId": "status_001"
}
```

## 服务器响应消息示例

### 1. 连接确认
```json
{
  "type": "connected",
  "timestamp": "2025-09-12T10:30:00.123Z",
  "data": {
    "clientId": 1,
    "message": "WebSocket 连接成功"
  }
}
```

### 2. 账户登录成功响应
```json
{
  "type": "account_login_response",
  "msgId": "abc123def456",
  "timestamp": "2025-09-12T10:30:05.456Z",
  "data": {
    "pairCode": "ABCD-EFGH",
    "mode": "early",
    "code": "200"
  }
}
```

### 3. 账户登录错误响应
```json
{
  "type": "account_login_error",
  "msgId": "abc123def456",
  "timestamp": "2025-09-12T10:30:05.456Z",
  "error": "number 必填",
  "code": 400
}
```

### 4. 实时日志
```json
{
  "type": "log",
  "msgId": "abc123def456",
  "timestamp": "2025-09-12T10:30:02.789Z",
  "data": {
    "content": "正在连接到 WhatsApp 服务器...",
    "stream": "stdout"
  }
}
```

### 5. Pong 响应
```json
{
  "type": "pong",
  "msgId": "ping_001",
  "timestamp": "2025-09-12T10:30:00.321Z"
}
```

### 6. 状态响应
```json
{
  "type": "status",
  "msgId": "status_001",
  "timestamp": "2025-09-12T10:30:00.654Z",
  "data": {
    "number": "447999803105"
  }
}
```

### 7. 错误响应
```json
{
  "type": "error",
  "msgId": "invalid_request_001",
  "timestamp": "2025-09-12T10:30:00.987Z",
  "error": "未知的消息类型: invalid_type"
}
```

### 8. 服务器关闭通知
```json
{
  "type": "server_shutdown",
  "timestamp": "2025-09-12T10:30:00.123Z",
  "data": {
    "message": "服务器即将关闭"
  }
}
```

## 统一发送方法 (sendMessage)

服务器端使用统一的 `sendMessage` 函数来确保消息格式一致：

```javascript
function sendMessage(ws, type, data = null, msgId = null, error = null, code = null) {
  const message = {
    type,
    timestamp: new Date().toISOString()
  };
  
  // 添加 msgId（如果提供）
  if (msgId) {
    message.msgId = msgId;
  }
  
  // 添加数据（如果提供）
  if (data !== null) {
    message.data = data;
  }
  
  // 添加错误信息（如果提供）
  if (error !== null) {
    message.error = error;
  }
  
  // 添加状态码（如果提供）
  if (code !== null) {
    message.code = code;
  }
  
  ws.send(JSON.stringify(message));
}
```

## 使用优势

1. **消息追踪**: 通过 `msgId` 可以追踪请求和响应的对应关系
2. **统一格式**: 所有消息都有一致的结构
3. **可扩展性**: 可以轻松添加新的字段而不破坏现有功能
4. **调试友好**: 每个消息都有时间戳，便于调试
5. **错误处理**: 统一的错误信息格式

## 实际应用示例

Python 客户端代码：
```python
import json
import uuid

# 创建带 msgId 的请求
msg_id = uuid.uuid4().hex
request = {
    "type": "account_login",
    "msgId": msg_id,
    "data": {
        "number": "447999803105",
        "timeout": 60,
        "env": "prod"
    }
}

# 发送请求
await ws.send(json.dumps(request))

# 接收响应并验证 msgId
response = await ws.recv()
message = json.loads(response)

if message.get('msgId') == msg_id:
    print(f"收到对应响应: {message}")
else:
    print(f"收到其他消息: {message}")
```
