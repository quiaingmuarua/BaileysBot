// idle-100s.js

console.log("程序启动中...");

setTimeout(() => {
  console.log("100 秒已到，程序即将结束。");
  process.exit(0); // 正常退出
}, 100 * 1000); // 100 秒

console.log("程序已启动，正在空转中...");
