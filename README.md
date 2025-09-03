# WhatsApp Bot 基于 Baileys

一个使用 Baileys 库构建的简单 WhatsApp 机器人示例，支持配对码登录。

## 功能特性

- 🔐 支持配对码登录（无需扫描二维码）
- 🔄 自动重连机制
- 💬 基础消息处理和自动回复
- 📝 会话状态持久化
- 🛡️ 错误处理和优雅退出

## 环境要求

- Node.js 17 或更高版本
- 有效的 WhatsApp 账号

## 安装

1. 克隆或下载这个项目
2. 安装依赖：

```bash
npm install
```

## 使用方法

1. 启动机器人：

```bash
npm start
```

2. 首次运行时，系统会提示输入您的 WhatsApp 手机号码
3. 系统会生成配对码，在您的 WhatsApp 应用中输入此代码完成配对
4. 配对成功后，机器人将开始运行

## 配置选项

在 `example.js` 文件中，您可以修改以下配置：

- `useStore`: 设置为 `true` 以启用消息存储功能
- 自动回复逻辑可在消息处理部分自定义

## 依赖包

- `@whiskeysockets/baileys`: ^6.6.0 - WhatsApp Web API
- `pino`: 日志记录
- `node-cache`: 缓存管理

## 文件结构

- `example.js`: 主要的机器人代码
- `package.json`: 项目配置和依赖
- `AUTH/`: 存储认证信息的目录（自动创建）
- `store.json`: 消息存储文件（如果启用）

## 注意事项

- 首次运行后，认证信息会保存在 `AUTH` 目录中
- 不要删除 `AUTH` 目录，否则需要重新配对
- 机器人会自动处理连接断开和重连

## 自定义消息处理

您可以在 `messages.upsert` 事件处理器中添加自定义逻辑：

```javascript
// 在消息处理部分添加您的逻辑
if (messageText.includes("您的关键词")) {
    await sock.sendMessage(msg.key.remoteJid, {
        text: "您的回复"
    });
}
```

## 故障排除

如果遇到连接问题：
1. 确保网络连接正常
2. 检查 WhatsApp 账号是否正常
3. 删除 `AUTH` 目录重新配对
4. 确保 Node.js 版本符合要求

---

**免责声明**: 此项目仅用于学习和测试目的，请遵守 WhatsApp 的服务条款。
