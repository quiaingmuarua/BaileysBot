#!/bin/bash

# 🧪 WhatsApp 账号管理器测试脚本
# 测试基于 example.js 开发的命令行版本

echo "🧪 WhatsApp 账号管理器 - 测试脚本"
echo "====================================="

# 测试号码
TEST_NUMBER="66961687880"

echo "📱 测试号码: $TEST_NUMBER"
echo "====================================="

# 测试1: 显示帮助
echo "📖 测试1: 显示帮助信息"
echo "-------------------------------------"
node account_manager_server.js --help
echo ""

# 测试2: 查询状态（应该显示未注册）
echo "📊 测试2: 查询账号状态"
echo "-------------------------------------"
node account_manager_server.js action=status number=$TEST_NUMBER
echo ""

# 测试3: 登录配对（核心测试）
echo "🔑 测试3: 登录配对"
echo "-------------------------------------"
echo "⚠️  这个测试会实际尝试生成配对码"
echo "💡 如果成功，请在 WhatsApp 中输入配对码"
echo "⏳ 60秒超时，或按 Ctrl+C 中断"
echo ""
read -p "按 Enter 继续测试登录，或 Ctrl+C 取消: "

node account_manager_server.js action=login number=$TEST_NUMBER timeout=60
echo ""

# 测试4: 再次查询状态
echo "📊 测试4: 再次查询账号状态"
echo "-------------------------------------"
node account_manager_server.js action=status number=$TEST_NUMBER
echo ""

# 测试5: 登出清理
echo "🚪 测试5: 登出清理"
echo "-------------------------------------"
read -p "是否执行登出测试（会清理认证文件）? [y/N]: " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    node account_manager_server.js action=logout number=$TEST_NUMBER
else
    echo "跳过登出测试"
fi

echo ""
echo "✅ 测试脚本完成！"
echo "====================================="
