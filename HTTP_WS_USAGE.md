# HTTP 和 WebSocket 服务器使用指南

本项目现在同时支持 HTTP REST API 和 WebSocket 实时通信，两种协议共享相同的业务逻辑。

## 架构概览

- **共用逻辑**: `accountHandler.js` - 核心业务处理逻辑
- **HTTP 服务器**: `webserverCli.js` - REST API 服务
- **WebSocket 服务器**: `index.js` - 实时通信服务
- **Python 演示**: `tests/http_demo.py` 和 `tests/websocket_demo.py` - 功能演示
- **启动脚本**: `start-servers.bat/sh` - 便捷启动工具

## 启动服务器

### 启动 HTTP 服务器
```bash
npm run http-server
# 或者开发模式（自动重启）
npm run dev-http
```
- 默认端口: `8000`
- 健康检查: `http://127.0.0.1:8000/health`

### 启动 WebSocket 服务器
```bash
npm run ws-server
# 或者开发模式（自动重启）
npm run dev-ws
```
- 默认端口: `8001`
- WebSocket 端点: `ws://127.0.0.1:8001/ws`
- 健康检查: `http://127.0.0.1:8001/health`

### 同时启动两个服务器
```bash
# 在不同终端窗口中分别运行
npm run http-server
npm run ws-server
```

## HTTP API 使用

### 账户登录
```bash
curl -X POST http://127.0.0.1:8000/account/login \
  -H "Content-Type: application/json" \
  -d '{
    "number": "1234567890",
    "timeout": 60,
    "script": "example"
  }'
```

**响应格式:**
```json
{
  "pairCode": "ABCD-EFGH",
  "mode": "early",
  "code": "200"
}
```

## WebSocket 使用

### 连接建立
```javascript
const ws = new WebSocket('ws://127.0.0.1:8001/ws');

ws.on('open', () => {
  console.log('WebSocket 连接成功');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('收到消息:', message);
});
```

### 消息类型

#### 1. 账户登录
**发送:**
```json
{
  "type": "account_login",
  "data": {
    "number": "1234567890",
    "timeout": 60,
    "script": "example"
  }
}
```

**接收:**
```json
{
  "type": "account_login_response",
  "data": {
    "pairCode": "ABCD-EFGH",
    "mode": "early",
    "code": "200"
  },
  "timestamp": "2025-09-12T10:30:00.000Z"
}
```

**实时输出:**
```json
{
  "type": "account_login_output",
  "data": {
    "content": "正在连接...",
    "stream": "stdout"
  },
  "timestamp": "2025-09-12T10:30:01.000Z"
}
```

#### 2. Ping-Pong 心跳
**发送:**
```json
{
  "type": "ping"
}
```

**接收:**
```json
{
  "type": "pong",
  "timestamp": "2025-09-12T10:30:00.000Z"
}
```

#### 3. 获取状态
**发送:**
```json
{
  "type": "get_status"
}
```

**接收:**
```json
{
  "type": "status",
  "data": {
    "number": "1234567890"
  },
  "timestamp": "2025-09-12T10:30:00.000Z"
}
```

## 环境变量配置

```bash
# HTTP 服务器
PORT=8000
HOST=127.0.0.1

# WebSocket 服务器
WS_PORT=8001
```

## 测试

### Python 演示客户端

#### 安装 Python 依赖
```bash
cd tests
pip install -r requirements.txt
```

#### HTTP 演示
```bash
python tests/http_demo.py
```

演示功能:
- 账户登录请求
- 超时场景测试
- 联系人同步（可选）

#### WebSocket 演示
```bash
python tests/websocket_demo.py
```

演示功能:
- Ping-Pong 心跳检测
- 状态查询
- 错误处理
- 账户登录（含实时日志）
- 超时场景
- 实时监控（展示 WebSocket 优势）

### 快速启动演示

使用提供的启动脚本同时启动两个服务器:

**Windows:**
```bash
start-servers.bat
```

**Linux/macOS:**
```bash
./start-servers.sh
```

测试包括:
- HTTP 健康检查
- HTTP 账户登录
- WebSocket 连接
- WebSocket 消息通信
- 错误处理
- 实时日志接收

## 对比：HTTP vs WebSocket

| 特性 | HTTP | WebSocket |
|------|------|-----------|
| 连接方式 | 请求-响应 | 持久连接 |
| 实时性 | 低 | 高 |
| 实时日志 | 不支持 | 支持 |
| 复杂度 | 简单 | 中等 |
| 适用场景 | API 调用 | 实时监控 |

## 最佳实践

### HTTP 适用场景
- 简单的 API 调用
- 一次性操作
- 不需要实时反馈

### WebSocket 适用场景
- 需要实时日志输出
- 长时间运行的任务
- 需要双向通信
- 实时状态监控

## 错误处理

### HTTP 错误
```json
{
  "error": "number 必填"
}
```

### WebSocket 错误
```json
{
  "type": "error",
  "error": "未知的消息类型: invalid_type",
  "timestamp": "2025-09-12T10:30:00.000Z"
}
```

## 安全注意事项

1. 在生产环境中配置适当的 CORS 策略
2. 实现身份验证和授权
3. 限制连接数量和频率
4. 验证所有输入数据
5. 使用 HTTPS 和 WSS（生产环境）

## 故障排除

### 端口被占用
```bash
# 查找占用端口的进程
netstat -ano | findstr :8000
netstat -ano | findstr :8001

# 或者修改端口
PORT=8080 npm run http-server
WS_PORT=8081 npm run ws-server
```

### 连接失败
1. 确保服务器已启动
2. 检查防火墙设置
3. 验证端口配置
4. 查看服务器日志

## 扩展开发

### 添加新的 WebSocket 消息类型
1. 在 `index.js` 的 `switch` 语句中添加新的 case
2. 在 `accountHandler.js` 中添加相应的处理逻辑（如需要）
3. 更新此文档的消息类型部分

### 添加新的 HTTP 端点
1. 在 `webserverCli.js` 中添加新的路由
2. 使用 `handleAccountLogin` 或创建新的处理函数
3. 确保错误处理一致性
