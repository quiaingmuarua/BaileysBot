@echo off
rem 设置控制台为 UTF-8 编码
chcp 65001

rem 运行 Node.js 程序
node %*

rem 恢复为系统默认编码
rem chcp 936
