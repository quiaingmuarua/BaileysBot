@echo off
echo Starting HTTP and WebSocket servers for demo...
echo.

echo Starting HTTP server on port 8000...
start cmd /k "npm run http-server"

timeout /t 2 /nobreak > nul

echo Starting WebSocket server on port 8001...
start cmd /k "npm run ws-server"

echo.
echo Both servers are starting...
echo HTTP Server: http://127.0.0.1:8000
echo WebSocket Server: ws://127.0.0.1:8001/ws
echo.
echo You can now run the Python demos:
echo   python tests/http_demo.py
echo   python tests/websocket_demo.py
echo.
echo Press any key to exit...
pause > nul
