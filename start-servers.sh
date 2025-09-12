#!/bin/bash

echo "Starting HTTP and WebSocket servers for demo..."
echo

# 检查端口是否被占用
check_port() {
    if netstat -tuln 2>/dev/null | grep -q ":$1 "; then
        echo "⚠️  Port $1 is already in use"
        return 1
    fi
    return 0
}

# 启动 HTTP 服务器
echo "Starting HTTP server on port 8000..."
if check_port 8000; then
    npm run http-server &
    HTTP_PID=$!
    echo "✅ HTTP server started (PID: $HTTP_PID)"
else
    echo "❌ Cannot start HTTP server - port 8000 in use"
    exit 1
fi

sleep 2

# 启动 WebSocket 服务器
echo "Starting WebSocket server on port 8001..."
if check_port 8001; then
    npm run ws-server &
    WS_PID=$!
    echo "✅ WebSocket server started (PID: $WS_PID)"
else
    echo "❌ Cannot start WebSocket server - port 8001 in use"
    kill $HTTP_PID 2>/dev/null
    exit 1
fi

echo
echo "🚀 Both servers are running:"
echo "   HTTP Server: http://127.0.0.1:8000"
echo "   WebSocket Server: ws://127.0.0.1:8001/ws"
echo
echo "📋 You can now run the Python demos:"
echo "   python tests/http_demo.py"
echo "   python tests/websocket_demo.py"
echo
echo "Press Ctrl+C to stop all servers..."

# 等待中断信号
trap 'echo; echo "Stopping servers..."; kill $HTTP_PID $WS_PID 2>/dev/null; echo "✅ All servers stopped"; exit 0' INT

# 保持脚本运行
wait
