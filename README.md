# 🚀 Baileys WebSocket API Server

一个基于 [Baileys](https://github.com/WhiskeySockets/Baileys) 的 WhatsApp WebSocket API 服务器，提供简单易用的 WhatsApp 账号登录和状态查询接口。

## ✨ 功能特性

- 🔐 **配对码登录**: 无需扫描二维码，使用配对码登录 WhatsApp
- 📱 **多账号支持**: 支持多个手机号并发操作，内置互斥锁机制
- 🔄 **实时状态**: WebSocket 实时推送登录状态和配对码
- 💾 **状态持久化**: 认证信息自动保存到 AUTH 目录
- ⚡ **临时连接**: 每次操作创建临时 socket，操作完成后自动清理
- 🛡️ **错误处理**: 完善的超时机制和错误处理

## 📋 环境要求

- **Node.js**: 18.0.0 或更高版本
- **有效的 WhatsApp 账号**

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone --recursive https://github.com/YOUR_USERNAME/BaileysBot.git
cd BaileysBot
```

### 2. 安装依赖

```bash
# 安装主项目依赖
npm install

# 构建 Baileys submodule
cd baileys
npm install
npm run build
cd ..
```

### 3. 启动服务器

```bash
node index.js
```

服务器将在 `ws://localhost:3001` 启动。

## 📡 WebSocket API

### 连接服务器

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('连接已建立');
});

ws.on('message', (data) => {
  const response = JSON.parse(data);
  console.log('收到响应:', response);
});
```

### API 接口

#### 1. 登录接口 (login)

发送登录请求并获取配对码：

```javascript
// 请求格式
{
  "action": "login",
  "phoneNumber": "+1234567890",  // 必需：包含国家码的手机号
  "waitMs": 30000,               // 可选：等待时间（毫秒），默认 30000
  "requestId": "unique-id"       // 可选：请求 ID，用于跟踪
}
```

**响应流程**：

1. **第一条响应**（立即返回配对码）：
```javascript
{
  "ok": true,
  "action": "login",
  "phase": "pairing",
  "phoneNumber": "+1234567890",
  "pairingCode": "ABCD-EFGH",    // 8位配对码，在 WhatsApp 中输入
  "status": "waiting",
  "requestId": "unique-id"
}
```

2. **第二条响应**（最终状态）：
```javascript
{
  "ok": true,
  "action": "login",
  "phase": "final",
  "phoneNumber": "+1234567890",
  "pairingCode": "ABCD-EFGH",
  "status": "connected",         // "connected" 或 "pending"
  "requestId": "unique-id"
}
```

#### 2. 状态查询接口 (status)

查询账号注册状态和连接状态：

```javascript
// 请求格式
{
  "action": "status",
  "phoneNumber": "+1234567890",  // 必需：手机号
  "activeCheck": false           // 可选：是否进行活跃连接检查，默认 false
}
```

**响应格式**：

```javascript
// activeCheck: false（仅读取本地状态）
{
  "ok": true,
  "action": "status",
  "phoneNumber": "+1234567890",
  "registered": true,            // 是否已注册
  "connection": "unknown"        // "unknown" 或 "disconnected"
}

// activeCheck: true（实际连接测试）
{
  "ok": true,
  "action": "status",
  "phoneNumber": "+1234567890",
  "registered": true,
  "connection": "open",          // "open" 或 "disconnected"
  "error": "错误信息"            // 仅在出现错误时存在
}
```

### 错误响应

```javascript
{
  "ok": false,
  "error": "错误描述"
}
```

## 💻 使用示例

### 完整的 WebSocket 客户端示例

```javascript
const WebSocket = require('ws');

class WhatsAppClient {
  constructor(serverUrl = 'ws://localhost:3001') {
    this.ws = new WebSocket(serverUrl);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('✅ 已连接到 WhatsApp API 服务器');
    });

    this.ws.on('message', (data) => {
      const response = JSON.parse(data);
      this.handleResponse(response);
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket 错误:', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 连接已断开');
    });
  }

  handleResponse(response) {
    if (response.hello) {
      console.log('🤖 服务器就绪，支持的操作:', response.actions);
      return;
    }

    if (response.action === 'login') {
      if (response.phase === 'pairing') {
        console.log(`📱 配对码: ${response.pairingCode}`);
        console.log('请在 WhatsApp 中输入此配对码');
      } else if (response.phase === 'final') {
        console.log(`🔐 登录${response.status === 'connected' ? '成功' : '超时'}`);
      }
    }

    if (response.action === 'status') {
      console.log(`📊 账号状态:`, {
        注册状态: response.registered ? '已注册' : '未注册',
        连接状态: response.connection,
        错误信息: response.error || '无'
      });
    }
  }

  // 登录账号
  login(phoneNumber, waitMs = 30000) {
    const request = {
      action: 'login',
      phoneNumber,
      waitMs,
      requestId: Date.now().toString()
    };
    this.ws.send(JSON.stringify(request));
  }

  // 查询状态
  checkStatus(phoneNumber, activeCheck = false) {
    const request = {
      action: 'status',
      phoneNumber,
      activeCheck
    };
    this.ws.send(JSON.stringify(request));
  }
}

// 使用示例
const client = new WhatsAppClient();

// 等待连接建立后进行操作
setTimeout(() => {
  // 登录账号
  client.login('+1234567890');
  
  // 检查状态（3秒后）
  setTimeout(() => {
    client.checkStatus('+1234567890', true);
  }, 3000);
}, 1000);
```

## 🏗️ 项目架构

### 核心组件

- **WebSocket 服务器**: 处理客户端连接和消息
- **临时 Socket 管理**: 每次操作创建和清理 WhatsApp socket
- **认证状态管理**: 使用文件系统持久化认证信息
- **并发控制**: 手机号级别的互斥锁，防止竞态条件

### 文件结构

```
BaileysBot/
├── baileys/                    # Baileys 库 (Git Submodule)
│   ├── src/                   # 源代码
│   ├── lib/                   # 编译后的代码
│   └── package.json           # Baileys 依赖配置
├── AUTH/                      # 认证文件存储（自动创建）
│   └── +1234567890/           # 按手机号分目录存储
├── index.js                   # 主服务器文件
├── example.js                 # 示例客户端
├── package.json               # 项目配置
└── README.md                  # 项目文档
```

### 工作流程

1. **接收请求**: WebSocket 服务器接收 JSON 格式的操作请求
2. **参数验证**: 验证手机号格式和必需参数
3. **并发控制**: 使用手机号级别的互斥锁确保操作串行
4. **临时连接**: 创建临时的 Baileys socket 进行操作
5. **状态监听**: 监听连接状态变化，实时推送结果
6. **自动清理**: 操作完成后自动清理资源和保存认证信息

## ⚙️ 配置选项

### 环境变量

- `PORT`: 服务器端口，默认 3001

### 超时设置

- **登录超时**: `waitMs` 参数，默认 30000ms（30秒）
- **状态检查超时**: 活跃检查时限制为 8000ms（8秒）
- **WebSocket 连接超时**: 10000ms（10秒）

## 🔧 开发指南

### 本地开发

```bash
# 启动开发服务器
node index.js

# 在另一个终端测试客户端
node example.js
```

### 调试模式

修改 `index.js` 中的日志级别：

```javascript
const logger = pino({ level: "debug" });  // 改为 debug 查看详细日志
```

## ⚠️ 注意事项

1. **手机号格式**: 必须包含国家码，如 `+1234567890`
2. **认证持久化**: AUTH 目录包含重要的认证信息，请勿删除
3. **并发限制**: 同一手机号的操作会串行执行，避免竞态条件
4. **资源管理**: 每次操作都会创建临时连接，适合低频 API 调用
5. **网络要求**: 需要稳定的网络连接到 WhatsApp 服务器

## 🚨 故障排除

### 常见问题

1. **配对码获取失败**
   - 检查手机号格式是否正确
   - 确认网络连接正常
   - 验证 WhatsApp 账号是否有效

2. **连接超时**
   - 增加 `waitMs` 参数值
   - 检查防火墙设置
   - 确认 WhatsApp 服务器可访问

3. **认证失效**
   - 删除对应的 AUTH 目录重新登录
   - 检查是否在其他地方登录了 WhatsApp Web

### 日志分析

启用调试日志查看详细信息：

```bash
# 设置环境变量启用详细日志
NODE_ENV=development node index.js
```

## 📜 许可证

ISC License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**免责声明**: 此项目仅用于学习和测试目的，请遵守 WhatsApp 的服务条款。