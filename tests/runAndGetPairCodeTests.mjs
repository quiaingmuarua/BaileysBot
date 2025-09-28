import { runAndGetPairCode } from '../runAndGetPairCode.js';
import * as timers from "node:timers";

(async () => {
  let s_time = new Date().getTime();
  console.log("now time ",new Date().getTime());
  const result = await runAndGetPairCode({
    cmdString: 'node timeout.js',   // 或任何 shell 命令
    timeoutMs: 30_000,                     // 10s 超时
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

  console.log('--- 结果 ---',new Date().getTime());
  console.log("total time ",new Date().getTime()-s_time,"ms")
  console.log(result);
})();
