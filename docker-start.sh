#!/bin/bash

# WhatsApp Bot Docker 启动脚本

echo "🚀 启动 WhatsApp Bot Docker 容器..."

# 检查是否存在 AUTH 目录
if [ ! -d "AUTH" ]; then
    echo "📁 创建 AUTH 目录..."
    mkdir -p AUTH
    echo "✅ AUTH 目录已创建"
fi

# 检查是否存在 logs 目录
if [ ! -d "logs" ]; then
    echo "📁 创建 logs 目录..."
    mkdir -p logs
    echo "✅ logs 目录已创建"
fi

# 检查 Docker 是否在运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 没有运行，请先启动 Docker"
    exit 1
fi

echo "🔨 构建并启动容器..."
docker-compose up --build -d

echo "📊 查看容器状态..."
docker-compose ps

echo "📝 查看实时日志 (按 Ctrl+C 退出)..."
echo "   或者使用命令: docker-compose logs -f"
echo ""
echo "🌐 服务地址: http://localhost:8000"
echo "❤️  健康检查: http://localhost:8000/health"
echo ""
echo "⚙️  其他有用命令:"
echo "   查看日志: docker-compose logs -f"
echo "   停止服务: docker-compose down"
echo "   重启服务: docker-compose restart"
echo "   进入容器: docker-compose exec wabot sh"
echo ""

# 等待一下让容器启动
sleep 3

# 显示日志
docker-compose logs -f
