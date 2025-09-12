@echo off
chcp 65001 >nul
echo 🚀 启动 WhatsApp Bot Docker 容器...

REM 检查是否存在 AUTH 目录
if not exist "AUTH" (
    echo 📁 创建 AUTH 目录...
    mkdir AUTH
    echo ✅ AUTH 目录已创建
)

REM 检查是否存在 logs 目录
if not exist "logs" (
    echo 📁 创建 logs 目录...
    mkdir logs
    echo ✅ logs 目录已创建
)

REM 检查 Docker 是否在运行
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker 没有运行，请先启动 Docker Desktop
    pause
    exit /b 1
)

echo 🔨 构建并启动容器...
docker-compose up --build -d

echo 📊 查看容器状态...
docker-compose ps

echo.
echo 🌐 服务地址: http://localhost:8000
echo ❤️  健康检查: http://localhost:8000/health
echo.
echo ⚙️  其他有用命令:
echo    查看日志: docker-compose logs -f
echo    停止服务: docker-compose down
echo    重启服务: docker-compose restart
echo    进入容器: docker-compose exec wabot sh
echo.

REM 等待一下让容器启动
timeout /t 3 /nobreak >nul

echo 📝 查看实时日志 (按 Ctrl+C 退出)...
docker-compose logs -f
