import { runAndGetPairCode } from '../extra/runAndGetPairCode.js';

(async () => {
  const result = await runAndGetPairCode({
    cmdString: 'node ../timeout.js',   // 或任何 shell 命令
    timeoutMs: 10000,                     // 10s 超时
    graceKillMs: 3000,                    // TERM 后 3s 再 KILL
    cwd: process.cwd(),
    env: { ...process.env, FOO: 'bar' },
    pairCodeRegex: /pairCode:\s*([A-Za-z0-9_-]+)/,
    maxOutputBytes: 2 * 1024 * 1024,      // 最多累积 2MB 输出
    killTreeOnWindows: true,              // Windows 上结束进程树
    onPairCode: (code) => {
      console.log('[pairCode]', code);
    },
    onOutput: (chunk, stream) => {
      process[stream].write(chunk);       // 直接透传到当前进程 stdout/stderr
    },
  });

  console.log('--- 结果 ---');
  console.log(result);
})();
