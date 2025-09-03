# WhatsApp Bot Web API 使用指南

## 🚀 快速开始

### 启动 API 服务器

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm run server

# 后台运行
nohup npm run server > api.log 2>&1 &
```

服务器默认监听端口 `3000`，您可以通过环境变量 `PORT` 自定义端口：

```bash
PORT=8080 npm run server
```

## 📋 API 接口文档

### 1. 健康检查

**GET** `/health`

检查服务器运行状态。

**响应示例：**
```json
{
  "success": true,
  "message": "服务正常运行",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### 2. 登录接口

**POST** `/login`

为指定手机号生成配对码或执行登录。

**请求体：**
```json
{
  "phoneNumber": "1234567890"
}
```

**响应示例（需要配对）：**
```json
{
  "success": false,
  "requiresPairing": true,
  "pairingCode": "ABCD-EFGH",
  "message": "请在 WhatsApp 中输入配对码完成登录",
  "expiresIn": "5分钟"
}
```

**响应示例（登录成功）：**
```json
{
  "success": true,
  "message": "登录成功",
  "jid": "1234567890@s.whatsapp.net"
}
```

**错误响应示例：**
```json
{
  "success": false,
  "message": "手机号码格式不正确",
  "error": "INVALID_PHONE_NUMBER"
}
```

### 3. 账号状态检查

**GET** `/status?phoneNumber=1234567890`

检查指定手机号的账号状态。

**查询参数：**
- `phoneNumber` - 手机号码

**响应示例（已认证）：**
```json
{
  "success": true,
  "phoneNumber": "1234567890",
  "registered": true,
  "authenticated": true,
  "message": "账号在线",
  "jid": "1234567890@s.whatsapp.net",
  "name": "用户名"
}
```

**响应示例（未认证）：**
```json
{
  "success": true,
  "phoneNumber": "1234567890",
  "registered": false,
  "authenticated": false,
  "message": "账号未注册，需要先进行配对"
}
```

## 💡 使用示例

### 使用 curl 命令

```bash
# 1. 检查服务器状态
curl http://localhost:3000/health

# 2. 发起登录请求
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890"}'

# 3. 检查账号状态
curl "http://localhost:3000/status?phoneNumber=1234567890"
```

### 使用 JavaScript

```javascript
// 登录请求
async function login(phoneNumber) {
  const response = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phoneNumber })
  });
  
  const result = await response.json();
  
  if (result.requiresPairing) {
    console.log(`请在 WhatsApp 中输入配对码: ${result.pairingCode}`);
  } else if (result.success) {
    console.log('登录成功:', result.jid);
  } else {
    console.error('登录失败:', result.message);
  }
  
  return result;
}

// 检查状态
async function checkStatus(phoneNumber) {
  const response = await fetch(`http://localhost:3000/status?phoneNumber=${phoneNumber}`);
  const result = await response.json();
  
  console.log('账号状态:', result);
  return result;
}

// 使用示例
login('1234567890').then(result => {
  console.log(result);
});

checkStatus('1234567890').then(result => {
  console.log(result);
});
```

### 使用 Python

```python
import requests
import json

# 登录请求
def login(phone_number):
    url = "http://localhost:3000/login"
    data = {"phoneNumber": phone_number}
    
    response = requests.post(url, json=data)
    result = response.json()
    
    if result.get('requiresPairing'):
        print(f"请在 WhatsApp 中输入配对码: {result['pairingCode']}")
    elif result.get('success'):
        print(f"登录成功: {result['jid']}")
    else:
        print(f"登录失败: {result['message']}")
    
    return result

# 检查状态
def check_status(phone_number):
    url = f"http://localhost:3000/status?phoneNumber={phone_number}"
    
    response = requests.get(url)
    result = response.json()
    
    print(f"账号状态: {result}")
    return result

# 使用示例
if __name__ == "__main__":
    phone = "1234567890"
    
    # 登录
    login_result = login(phone)
    
    # 检查状态
    status_result = check_status(phone)
```

## 🔧 配置说明

### 环境变量

- `PORT` - API 服务器监听端口（默认: 3000）
- `NODE_ENV` - 运行环境（development/production）

### 文件存储

- `AUTH/` - 认证文件存储目录
- `AUTH/{phoneNumber}/` - 每个手机号的认证文件独立存储

## ⚠️ 重要说明

### 1. 安全考虑

- 该 API 不包含身份验证机制，建议在生产环境中添加认证
- 手机号码会作为文件夹名存储，确保输入的手机号码格式正确
- 建议在防火墙后或内网环境中使用

### 2. 使用限制

- 每个手机号同时只能有一个登录请求
- 配对码有效期为 5 分钟
- 连接超时时间为 60 秒（登录）/ 10 秒（状态检查）

### 3. 错误处理

**常见错误代码：**
- `MISSING_PHONE_NUMBER` - 缺少手机号码参数
- `INVALID_PHONE_NUMBER` - 手机号码格式不正确
- `LOGIN_IN_PROGRESS` - 该手机号已有正在进行的登录请求
- `LOGIN_ERROR` - 登录过程中发生错误
- `STATUS_CHECK_ERROR` - 检查状态时发生错误

## 📝 日志

服务器会输出详细的日志信息，包括：

- 登录请求和配对码生成
- 连接状态变化
- 错误信息
- API 请求记录

查看日志：
```bash
# 如果使用 npm run server
# 日志会直接输出到终端

# 如果使用后台运行
tail -f api.log
```

## 🔄 与 CLI 版本的区别

| 功能 | CLI 版本 (example.js) | API 版本 (index.js) |
|------|----------------------|-------------------|
| 交互方式 | 终端交互 | HTTP API |
| 连接类型 | 长连接 | 短连接（按需） |
| 认证存储 | `AUTH/` 固定目录 | `AUTH/{phoneNumber}/` 分目录 |
| 消息处理 | 实时处理 | 不处理消息 |
| 适用场景 | 开发调试 | 生产集成 |

这两个版本可以并行使用，互不干扰。
