# 🔧 故障排除指南

本文档提供常见问题的快速解决方案。

## 🚨 连接问题

### WebSocket 连接失败

**症状:**
```
❌ Error { message: 'connect ECONNREFUSED 127.0.0.1:8001' }
```

**解决方案:**
1. 确认 WebSocket 服务器已启动:
   ```bash
   cd tests && python3 websocket_server_demo.py
   ```
2. 检查端口占用:
   ```bash
   netstat -tlnp | grep :8001
   ```
3. 检查防火墙设置

### Docker 容器无法连接服务器

**症状:**
```
wabot-client | [2025-09-16T09:15:41.187Z] ❌ Error { message: 'connect ECONNREFUSED 172.17.0.1:8001' }
```

**解决方案:**
1. 使用主机网络模式 (已配置):
   ```yaml
   network_mode: host
   ```
2. 或修改为bridge模式并使用主机IP:
   ```yaml
   environment:
     - WS_URL=ws://192.168.1.100:8001/ws  # 替换为实际主机IP
   ```

## 🐳 Docker 问题

### 构建速度慢

**症状:**
```
#6 [internal] load build context
#6 transferring context: 2.50MB 350.2s
```

**解决方案:**
1. 清理Docker缓存:
   ```bash
   docker system prune -f
   ```
2. 检查 `.dockerignore` 配置是否正确
3. 移除大文件和目录:
   ```bash
   # 确保这些目录被忽略
   echo "baileys/" >> .dockerignore
   echo ".git/" >> .dockerignore
   echo "node_modules/" >> .dockerignore
   ```

### 容器名称冲突

**症状:**
```
ERROR: Conflict. The container name "wabot-client" is already in use
```

**解决方案:**
1. 停止现有容器:
   ```bash
   docker compose down
   ```
2. 使用动态扩展避免命名冲突:
   ```bash
   docker compose up --scale wabot=3  # 不使用固定container_name
   ```

## 📱 WhatsApp 登录问题

### 配对码无效

**解决方案:**
1. 确认手机号格式正确 (包含国家码)
2. 检查网络连接稳定性
3. 重新生成配对码:
   ```bash
   > login client-1 919079478346
   ```

### 认证状态丢失

**解决方案:**
1. 检查AUTH目录是否正确映射:
   ```yaml
   volumes:
     - ./AUTH:/app/AUTH:rw
   ```
2. 确认AUTH目录权限:
   ```bash
   chmod -R 755 AUTH/
   ```

## 💾 文件权限问题

### AUTH目录权限错误

**症状:**
```
Error: EACCES: permission denied, open 'AUTH/xxx/creds.json'
```

**解决方案:**
```bash
# 修复目录权限
sudo chown -R $USER:$USER AUTH/
chmod -R 755 AUTH/
```

## 🔍 调试技巧

### 查看详细日志

**Docker容器日志:**
```bash
# 查看所有容器日志
docker compose logs -f

# 查看特定容器日志
docker compose logs -f wabot
```

**服务器端调试:**
在Python服务器控制台直接查看实时日志和连接状态。

### 网络诊断

**测试WebSocket连接:**
```bash
# 使用wscat测试 (需要安装 npm install -g wscat)
wscat -c ws://127.0.0.1:8001/ws

# 或使用curl测试
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: test" \
     -H "Sec-WebSocket-Version: 13" \
     http://127.0.0.1:8001/ws
```

**检查端口状态:**
```bash
# Linux/Mac
netstat -tlnp | grep :8001
lsof -i :8001

# Windows
netstat -an | findstr :8001
```

## 🚀 性能优化

### 减少资源使用

**调整Docker资源限制:**
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
```

**限制客户端数量:**
根据服务器性能，建议同时运行的客户端数量:
- 1GB RAM: 3-5个客户端
- 2GB RAM: 5-10个客户端
- 4GB RAM: 10-20个客户端

## 📞 获取更多帮助

如果以上解决方案无法解决问题，请:

1. **查看完整日志** - 包含错误发生前后的完整日志
2. **提供环境信息** - 操作系统、Docker版本、Python版本等
3. **描述重现步骤** - 详细的操作步骤和预期结果
4. **检查相关文档** - [多客户端使用指南](MULTI_CLIENT_USAGE.md)

---

**更新时间**: 2025-09-16  
**适用版本**: v0.0.1+
