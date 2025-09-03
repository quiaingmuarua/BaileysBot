# 🤖 WhatsApp Bot 基于 Baileys
# WhatsApp Bot API

基于 Baileys 的 WhatsApp Bot 接口服务。

## 安装

```bash
npm install
```

## 运行

```bash
# 启动 Web API 服务
npm run server

# 启动示例客户端
npm run start

# 开发模式（自动重启）
npm run dev
```

## 中文显示问题

如果在控制台遇到中文乱码问题，以下是解决方法：

### Windows 用户

1. 确保使用的终端支持 UTF-8
2. 在 CMD 中运行前设置代码页：`chcp 65001`
3. 使用 PowerShell 或 Windows Terminal 可能有更好的 UTF-8 支持

### 所有用户

本项目已配置 pino-pretty 插件和适当的编码设置，应该能正确显示中文。如果仍有问题，可以尝试：

1. 确保终端/控制台使用 UTF-8 编码
2. 在 Node.js 环境变量中添加 `NODE_OPTIONS="--max-old-space-size=4096"`

## API 接口

- `POST /login` - 登录/配对 WhatsApp 账号
- `GET /status` - 查询账号状态

详细使用方法请参考代码示例。
[![CI](https://github.com/YOUR_USERNAME/BaileysBot/workflows/CI/badge.svg)](https://github.com/YOUR_USERNAME/BaileysBot/actions/workflows/ci.yml)
[![Security Scan](https://github.com/YOUR_USERNAME/BaileysBot/workflows/Security%20Scan/badge.svg)](https://github.com/YOUR_USERNAME/BaileysBot/actions/workflows/security.yml)
[![Code Quality](https://github.com/YOUR_USERNAME/BaileysBot/workflows/Code%20Quality/badge.svg)](https://github.com/YOUR_USERNAME/BaileysBot/actions/workflows/code-quality.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

一个功能强大的 WhatsApp 机器人，基于 [Baileys](https://github.com/WhiskeySockets/Baileys) 库开发，使用 Git Submodule 方式集成，支持自定义功能扩展。

## ✨ 功能特性

- 🔐 **安全登录**: 支持配对码登录（无需扫描二维码）
- 🔄 **智能重连**: 自动重连机制，确保服务稳定
- 💬 **消息处理**: 基础消息处理和自动回复功能
- 📝 **状态持久化**: 会话状态和认证信息持久化存储
- 🛡️ **错误处理**: 完善的错误处理和优雅退出机制
- 🛠️ **易于定制**: 基于 Git Submodule 的 Baileys，方便修改和扩展
- 🚀 **CI/CD 支持**: 完整的 GitHub Actions 自动化工作流
- 📊 **代码质量**: 自动化代码检查、安全扫描和质量保障
- 🔄 **自动更新**: 自动检查和更新 Baileys 依赖

## 📋 环境要求

- **Node.js**: 18.0.0 或更高版本
- **有效的 WhatsApp 账号**
- **Git**: 用于管理 submodule

## 🚀 快速开始

### 1. 克隆项目（包含 submodule）

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

### 3. 启动机器人

```bash
npm start
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

## 📦 项目架构

### 依赖包

- **Baileys**: WhatsApp Web API (通过 Git Submodule)
- **pino**: 高性能日志记录
- **node-cache**: 消息重试缓存管理
- **@adiwajshing/keyed-db**: 键值数据库

### 🏗️ 文件结构

```
BaileysBot/
├── baileys/                    # Baileys 库 (Git Submodule)
│   ├── src/                   # 源代码 (可自定义修改)
│   ├── lib/                   # 编译后的代码
│   └── package.json           # Baileys 依赖配置
├── .github/                   # GitHub Actions 工作流
│   └── workflows/
│       ├── ci.yml             # 持续集成
│       ├── security.yml       # 安全扫描
│       ├── code-quality.yml   # 代码质量检查
│       ├── update-submodule.yml # 自动更新 submodule
│       └── release.yml        # 自动发布
├── AUTH/                      # 认证文件存储（自动创建）
├── example.js                 # 主程序文件
├── package.json               # 项目配置
├── store.json                 # 消息存储（可选）
└── README.md                  # 项目文档
```

## 🔧 自定义 Baileys

由于使用 Git Submodule 方式集成 Baileys，您可以轻松自定义：

1. **修改源码**:
   ```bash
   cd baileys/src
   # 编辑您需要的文件
   ```

2. **重新构建**:
   ```bash
   cd baileys
   npm run build
   ```

3. **提交更改**:
   ```bash
   cd baileys
   git add .
   git commit -m "feat: 添加自定义功能"
   git push origin master
   ```

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

## 🚀 CI/CD 工作流

项目包含完整的 GitHub Actions 自动化工作流：

### 🔄 持续集成 (CI)
- **多版本测试**: 支持 Node.js 18.x, 20.x, 22.x
- **代码语法检查**: 自动验证 JavaScript 语法
- **安全审计**: npm audit 安全漏洞检查
- **依赖检查**: 检查过时的依赖包

### 🛡️ 安全扫描
- **依赖审计**: 定时检查安全漏洞
- **代码质量分析**: CodeQL 静态代码分析
- **密钥扫描**: Trivy 扫描敏感信息泄露
- **许可证检查**: 依赖许可证合规性检查

### 📊 代码质量
- **格式检查**: Prettier 代码格式化
- **代码规范**: ESLint 代码质量检查
- **复杂度分析**: 代码复杂度和重复度检查
- **文档完整性**: 检查项目文档完整性

### 🔄 自动化更新
- **Submodule 更新**: 每周自动检查 Baileys 更新
- **自动 PR**: 发现更新时自动创建 Pull Request
- **兼容性测试**: 更新前自动测试代码兼容性

### 📦 自动发布
- **版本管理**: 支持语义化版本控制
- **更新日志**: 自动生成版本更新日志
- **GitHub Releases**: 自动创建 GitHub 发布

## 🛠️ 开发指南

### 1. 代码提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式化
refactor: 代码重构
test: 添加测试
chore: 构建工具或辅助工具的变动
```

### 2. 分支策略

- `main`: 主分支，用于生产环境
- `develop`: 开发分支，用于功能开发
- `feature/*`: 功能分支
- `hotfix/*`: 热修复分支

### 3. Pull Request 流程

1. Fork 项目
2. 创建功能分支
3. 提交更改（遵循提交规范）
4. 创建 Pull Request
5. 等待 CI 检查通过
6. 代码审查
7. 合并到主分支

## 📋 维护指南

### 更新 Baileys Submodule

```bash
# 手动更新到最新版本
git submodule update --remote baileys
cd baileys
npm install
npm run build
cd ..

# 提交更新
git add baileys
git commit -m "chore: 更新 baileys submodule"
```

### 本地开发环境设置

```bash
# 克隆项目
git clone --recursive https://github.com/YOUR_USERNAME/BaileysBot.git
cd BaileysBot

# 安装开发依赖
npm install --include=dev

# 安装代码质量工具
npm install --save-dev prettier eslint

# 设置 Git hooks (可选)
npx husky install
```

### 运行质量检查

```bash
# 代码格式检查
npx prettier --check "**/*.{js,json,md}"

# 代码格式修复
npx prettier --write "**/*.{js,json,md}"

# 代码质量检查
npx eslint example.js

# 安全审计
npm audit
```

---

**免责声明**: 此项目仅用于学习和测试目的，请遵守 WhatsApp 的服务条款。

**贡献**: 欢迎提交 Issue 和 Pull Request，让我们一起改进这个项目！
