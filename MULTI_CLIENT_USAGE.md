# 多客户端 WebSocket 使用指南

本文档介绍如何使用 BaileysBot 的多客户端 WebSocket 功能，实现多个 WhatsApp 客户端同时连接到单个服务器。

## 🎯 功能概述

- ✅ **多实例支持** - 同时运行多个 WebSocket 客户端
- ✅ **选择性登录** - 精确控制向哪个客户端发送登录请求
- ✅ **实时管理** - 通过交互式命令管理所有连接
- ✅ **状态隔离** - 每个客户端独立管理认证状态
- ✅ **扩展性强** - 支持任意数量的客户端连接

## 📋 系统要求

### 服务器端
- Python 3.7+
- websockets >= 11.0.3
- requests >= 2.31.0

### 客户端端
- Docker & Docker Compose
- Node.js 20+ (如果本地运行)

## 🚀 快速开始

### 1. 启动 WebSocket 服务器

```bash
# 进入测试目录
cd tests

# 安装 Python 依赖
pip3 install -r requirements.txt

# 启动 WebSocket 服务器
python3 websocket_server_demo.py
```

服务器启动后会显示：
```
✅ Python WebSocket 服务器已启动: ws://127.0.0.1:8001/ws
💡 等待客户端连接...

==============================================================
📟 交互式命令:
  list          - 显示所有客户端
  login <id> <phone>  - 向指定客户端发送登录请求
  例如: login client-1 919079478346
  quit          - 退出服务器
==============================================================
```

### 2. 启动多个 WebSocket 客户端

#### 方式一：动态扩展（推荐）

```bash
# 启动 3 个客户端实例
docker compose up --build --scale wabot=3

# 启动 5 个客户端实例（后台运行）
docker compose up --build --scale wabot=5 -d

# 查看运行状态
docker compose ps
```

#### 方式二：预定义多服务

```bash
# 创建多服务配置文件（可选）
# 然后启动所有预定义客户端
docker compose -f docker-compose.multi.yml up --build
```

### 3. 管理客户端连接

#### 查看连接的客户端

在服务器控制台输入：
```bash
> list
```

输出示例：
```
📋 当前连接的客户端:
  - client-1: ('172.17.0.2', 33644) (连接时间: 15.3秒)
  - client-2: ('172.17.0.3', 33645) (连接时间: 8.1秒)
  - client-3: ('172.17.0.4', 33646) (连接时间: 3.2秒)
```

#### 发送登录请求

```bash
# 向 client-1 发送登录请求
> login client-1 919079478346

# 向 client-2 发送登录请求
> login client-2 918987654321
```

#### 退出服务器

```bash
> quit
```

## 🔧 详细配置

### Docker Compose 配置说明

#### 主配置文件 (`docker-compose.yml`)

```yaml
services:
  wabot:
    build:
      context: .
      dockerfile: Dockerfile
    # 支持多实例，移除固定 container_name
    network_mode: host  # 使用主机网络模式
    volumes:
      - ./AUTH:/app/AUTH:rw      # WhatsApp 认证数据持久化
      - ./logs:/app/logs:rw      # 日志文件映射
    environment:
      - NODE_ENV=production
      - WS_URL=ws://127.0.0.1:8001/ws
    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
```

#### 优化后的 Dockerfile

```dockerfile
# 精简文件复制，提高构建速度
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 只复制必要的应用文件
COPY index.js ws-client.js accountHandler.js ./
COPY login.js webserverCli.js ws-server.js ./
COPY runAndGetPairCode.js ./
```

### 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `WS_URL` | `ws://127.0.0.1:8001/ws` | WebSocket 服务器地址 |
| `NODE_ENV` | `production` | Node.js 运行环境 |
| `CLIENT_ID` | 自动生成 | 客户端标识符（可选） |

## 📊 使用场景

### 场景一：多账号管理

```bash
# 启动 5 个客户端
docker compose up --scale wabot=5 -d

# 分别为不同客户端绑定不同手机号
> login client-1 919079478346  # 印度号码
> login client-2 8613812345678 # 中国号码
> login client-3 14155552671   # 美国号码
```

### 场景二：负载分担

```bash
# 启动 3 个客户端分担消息处理
docker compose up --scale wabot=3 -d

# 只选择一个客户端进行登录（其他作为备用）
> login client-1 919079478346
```

### 场景三：测试环境

```bash
# 启动多个客户端进行并发测试
docker compose up --scale wabot=10 -d

# 选择性测试不同功能
> login client-1 919079478346  # 生产测试
> login client-2 918987654321  # 开发测试
```

## 🔍 监控和调试

### 实时日志查看

```bash
# 查看所有客户端日志
docker compose logs -f

# 查看特定客户端日志
docker compose logs -f wabot

# 查看服务器日志
# 在服务器控制台直接查看
```

### 客户端状态检查

```bash
# 查看运行的容器
docker compose ps

# 检查容器资源使用
docker stats

# 进入容器调试
docker compose exec wabot sh
```

### 网络连接测试

```bash
# 测试 WebSocket 连接
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: test" \
     -H "Sec-WebSocket-Version: 13" \
     http://127.0.0.1:8001/ws

# 检查端口监听
netstat -tlnp | grep :8001
```

## ⚠️ 故障排除

### 常见问题

#### 1. 客户端无法连接服务器

**症状：**
```
❌ Error { message: 'connect ECONNREFUSED 127.0.0.1:8001' }
```

**解决方案：**
```bash
# 检查服务器是否运行
netstat -tlnp | grep :8001

# 重启服务器
cd tests && python3 websocket_server_demo.py
```

#### 2. Docker 构建缓慢

**症状：**
```
#6 [internal] load build context
#6 transferring context: 2.50MB 350.2s
```

**解决方案：**
```bash
# 清理 Docker 缓存
docker system prune -f

# 检查 .dockerignore 配置
cat .dockerignore
```

#### 3. 容器名称冲突

**症状：**
```
ERROR: Conflict. The container name "wabot-client" is already in use
```

**解决方案：**
```bash
# 停止现有容器
docker compose down

# 清理冲突容器
docker rm -f wabot-client

# 使用动态扩展避免命名冲突
docker compose up --scale wabot=3
```

#### 4. 客户端连接但无响应

**症状：**
客户端显示已连接，但服务器端看不到连接。

**解决方案：**
```bash
# 检查网络模式
# 确保 docker-compose.yml 中使用 network_mode: host

# 或者尝试 bridge 网络模式
# 修改 WS_URL 为主机 IP 地址
```

### 性能优化

#### 资源限制调整

```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'     # 减少 CPU 限制
      memory: 512M    # 减少内存限制
    reservations:
      cpus: '0.1'
      memory: 128M
```

#### 并发连接优化

```python
# 在服务器代码中增加连接池限制
MAX_CLIENTS = 100

async def handle_client(ws):
    if len(clients) >= MAX_CLIENTS:
        await ws.close(code=1013, reason="Server overloaded")
        return
    # ... 其他代码
```

## 📈 最佳实践

### 1. 资源管理

- **合理设置实例数量** - 根据服务器性能调整客户端数量
- **监控内存使用** - 每个客户端约占用 256MB 内存
- **定期清理日志** - 避免日志文件过大

### 2. 安全考虑

- **网络隔离** - 生产环境建议使用 bridge 网络
- **访问控制** - 限制 WebSocket 服务器访问
- **数据备份** - 定期备份 AUTH 目录

### 3. 运维管理

- **自动重启** - 配置 `restart: unless-stopped`
- **健康检查** - 监控客户端进程状态
- **日志收集** - 集中管理所有客户端日志

## 🔗 相关文档

- [Docker 配置说明](DOCKER_README.md)
- [WebSocket API 文档](WEBSOCKET_API_DOC.md)
- [HTTP/WS 使用指南](HTTP_WS_USAGE.md)
- [API 使用说明](API_USAGE.md)

## 🆘 获取帮助

如遇到问题，请检查：

1. **服务器日志** - 查看 Python 服务器输出
2. **客户端日志** - 使用 `docker compose logs -f`
3. **网络连接** - 确认防火墙和端口配置
4. **资源使用** - 检查 CPU 和内存占用

更多技术支持，请参考项目 [GitHub Issues](https://github.com/your-repo/issues)。
