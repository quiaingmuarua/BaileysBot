# 使用官方 Node.js 镜像作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV WS_URL=ws://127.0.0.1:8001/ws

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制项目文件
COPY . .

# 确保 AUTH 目录存在
RUN mkdir -p AUTH

# 设置权限
RUN chown -R nodeuser:nodejs /app
RUN chmod 755 /app

# 切换到非 root 用户
USER nodeuser

# WebSocket客户端不需要暴露端口

# 健康检查 - 检查进程是否正在运行
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD pgrep -f "node index.js" > /dev/null || exit 1

# 启动应用
CMD ["npm", "run", "ws-client"]
