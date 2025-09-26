# WhatsApp Bot Docker 部署指南

本指南涵盖了单客户端和多客户端的 Docker 部署方案。

## 🌟 部署模式

### 🔄 单客户端模式
传统的单一 WebSocket 客户端连接模式。

### 🌐 多客户端模式 (推荐)
支持同时运行多个 WebSocket 客户端，实现多账号管理和负载分担。

## 🚀 快速启动

### 🌐 多客户端部署 (推荐)

#### 步骤 1: 启动 WebSocket 服务器
```bash
# 安装 Python 依赖
cd tests
pip3 install -r requirements.txt

# 启动服务器
python3 websocket_server_demo.py
```

#### 步骤 2: 启动多个客户端
```bash
# 启动 3 个客户端实例
docker compose up --build --scale wabot=3

# 后台运行 5 个实例
docker compose up --build --scale wabot=5 -d

podman compose up -d
podman compose build

```

#### 步骤 3: 管理客户端
在服务器控制台使用交互式命令管理客户端。详见 [多客户端使用指南](MULTI_CLIENT_USAGE.md)。

### 🔄 单客户端部署 (传统模式)

#### 方式一：使用启动脚本

**Windows:**
```bash
./docker-start.bat
```

**Linux/Mac:**
```bash
./docker-start.sh
```

### 方式二：手动启动

1. **构建并启动容器**
```bash
docker-compose up --build -d
```

2. **查看容器状态**
```bash
docker-compose ps
```

3. **查看实时日志**
```bash
docker-compose logs -f
```

## 📁 目录映射

- `./AUTH` → `/app/AUTH` - **重要！** WhatsApp 认证数据持久化
- `./logs` → `/app/logs` - 日志文件（可选）

## 🌐 访问地址

- **主服务**: http://localhost:8000
- **健康检查**: http://localhost:8000/health

## 🛠 常用命令

| 功能 | 命令 |
|------|------|
| 启动服务 | `docker-compose up -d` |
| 停止服务 | `docker-compose down` |
| 重启服务 | `docker-compose restart` |
| 查看日志 | `docker-compose logs -f` |
| 进入容器 | `docker-compose exec wabot sh` |
| 查看状态 | `docker-compose ps` |
| 强制重建 | `docker-compose up --build --force-recreate` |

## 📊 监控和维护

### 健康检查
容器内置健康检查，每30秒检查一次：
```bash
# 手动检查健康状态
curl http://localhost:8000/health
```

### 日志管理
```bash
# 查看最近100行日志
docker-compose logs --tail=100

# 查看特定时间的日志
docker-compose logs --since="2024-01-01T00:00:00"
```

### 资源监控
```bash
# 查看容器资源使用情况
docker stats wabot-server
```

## 🔧 配置说明

### 环境变量
- `NODE_ENV=production` - 生产环境模式
- `PORT=8000` - 服务端口

### 资源限制
- **CPU**: 最大 1 核心，保留 0.25 核心
- **内存**: 最大 1GB，保留 256MB

## 📁 数据持久化

### AUTH 目录结构
```
AUTH/
├── 447999803105/          # 用户账号目录
│   ├── creds.json         # 认证凭据
│   ├── pre-key-*.json     # 预共享密钥
│   └── session-*.json     # 会话数据
└── 其他账号目录/
```

⚠️ **重要提示**: 不要删除 AUTH 目录，否则需要重新登录所有 WhatsApp 账号。

## 🚨 故障排除

### 端口占用
如果端口 8000 被占用：
```bash
# 查看端口占用
netstat -ano | findstr :8000

# 或修改 docker-compose.yml 中的端口映射
ports:
  - "8001:8000"  # 宿主机端口:容器端口
```

### 权限问题
```bash
# 确保 AUTH 目录有正确权限
chmod 755 AUTH
```

### 容器无法启动
```bash
# 查看详细错误信息
docker-compose logs wabot

# 重新构建镜像
docker-compose build --no-cache
```

### 清理和重置
```bash
# 停止并删除容器
docker-compose down

# 删除镜像 (谨慎操作)
docker rmi baileysbot_wabot

# 清理未使用的资源
docker system prune
```

## 📝 API 使用示例

### 登录账号
```bash
curl -X POST http://localhost:8000/account/login \
  -H "Content-Type: application/json" \
  -d '{"number":"66961687827","timeout":60}'
```

### 健康检查
```bash
curl http://localhost:8000/health
```

## 🔄 更新部署

1. 停止当前容器
```bash
docker-compose down
```

2. 拉取最新代码
```bash
git pull
```

3. 重新构建并启动
```bash
docker-compose up --build -d
```

## 🏷 版本信息

- **Node.js**: 20-alpine
- **端口**: 8000
- **重启策略**: unless-stopped
- **健康检查**: 30s 间隔

## 🌐 多客户端高级配置

### 资源管理
```yaml
# 自定义资源限制
deploy:
  resources:
    limits: { cpus: '0.5', memory: '512M' }
    reservations: { cpus: '0.1', memory: '128M' }
```

### 扩展配置
```bash
# 动态调整实例数量
docker compose up --scale wabot=3     # 3个实例
docker compose up --scale wabot=5     # 扩展到5个实例
```

### 网络配置 (Bridge模式)
```yaml
# 如果host模式不可用
environment:
  - WS_URL=ws://192.168.1.100:8001/ws  # 使用主机IP
networks:
  - wabot-network
```

## 🔧 相关文档

- [多客户端使用指南](MULTI_CLIENT_USAGE.md) - 详细配置和管理
- [故障排除指南](TROUBLESHOOTING.md) - 常见问题解决

---

🎉 **部署完成！** 你的 WhatsApp Bot 现在运行在 Docker 容器中，支持多客户端架构和高可用部署。
