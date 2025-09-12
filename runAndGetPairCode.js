// runAndGetPairCode.js
import { spawn } from 'child_process';
import readline from 'node:readline';

/**
 * 执行命令并在输出中提取 pairCode（不中断子进程，直到自然退出或超时）
 * @param {object} options
 * @param {string} options.cmdString                 - 整条命令字符串（会用 shell 执行）
 * @param {number} [options.timeoutMs]               - 超时（毫秒），到时 TERM -> KILL
 * @param {number} [options.graceKillMs=5000]        - 发送 TERM 后等待多长再 KILL
 * @param {string} [options.cwd]                     - 工作目录
 * @param {object} [options.env]                     - 环境变量
 * @param {(code:string)=>void} [options.onPairCode] - 捕获到 pairCode 的即时回调
 * @param {(chunk:string, stream:'stdout'|'stderr')=>void} [options.onOutput] - 实时日志回调
 * @returns {Promise<{ pairCode: string|null, exitCode: number|null, output: string, timedOut: boolean, signal: NodeJS.Signals|null }>}
 */
export function runAndGetPairCode({
  cmdString,
  timeoutMs,
  graceKillMs = 5000,
  cwd,
  env,
  onPairCode, onLoginStatus,
  onOutput,
}) {
  return new Promise((resolve, reject) => {
    if (!cmdString) return reject(new Error('必须提供 cmdString'));

    // 关键：使用 shell 执行，但在 *nix 上把子进程置于新会话/进程组
    const child = spawn(cmdString, {
      shell: true,
      cwd,
      env,
      detached: process.platform !== 'win32', // *nix 创建新进程组，便于 group kill
    });

    let pairCode = null;
    let output = '';
    let finished = false;
    let timedOut = false;
    let exitCode = null;
    let exitSignal = null;
    let killerTimer = null;
    let hardKillerTimer = null;
    let loginStatus = null;

    const rlOut = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    const rlErr = readline.createInterface({ input: child.stderr, crlfDelay: Infinity });

    const tryMatchPairCode = (text) => {
      const m = text.match(/pairCode:(\S+)/);
      if (m && !pairCode) {
        pairCode = m[1];
        onPairCode?.(pairCode);
      }
    };


    const tryMatchLoginStatus = (text) => {
      const m = text.match(/loginStatus:(\S+)/);
      if (m && !loginStatus) {
        loginStatus = m[1];
        onLoginStatus?.(loginStatus);

      }
    };

    const onLine = (line, stream) => {
      const chunk = line + '\n';
      output += chunk;
      onOutput?.(chunk, stream);
      tryMatchPairCode(line);
      tryMatchLoginStatus(line);
    };

    rlOut.on('line', (l) => onLine(l, 'stdout'));
    rlErr.on('line', (l) => onLine(l, 'stderr'));

    const cleanup = () => {
      rlOut.removeAllListeners(); rlErr.removeAllListeners();
      rlOut.close(); rlErr.close();
      clearTimeout(killerTimer); clearTimeout(hardKillerTimer);
    };

    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    });

    child.on('exit', (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });

    child.on('close', () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({ pairCode, exitCode, output, timedOut, signal: exitSignal });
    });

    // 超时：先 TERM 进程组/树，再等宽限期后 KILL
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      killerTimer = setTimeout(() => {
        if (finished) return;
        timedOut = true;

        const pid = child.pid;
        if (process.platform === 'win32') {
          // 尽可能杀进程树（不依赖第三方）
          try {
            spawn('taskkill', ['/PID', String(pid), '/T', '/F']);
          } catch {
            // 兜底：至少杀下当前子进程
            child.kill('SIGTERM');
          }
        } else {
          // 对“负 pid”发信号 => 杀整个进程组（shell + 真子进程）
          try {
            process.kill(-pid, 'SIGTERM');
          } catch {
            // 兜底：只杀到 shell
            child.kill('SIGTERM');
          }
        }

        hardKillerTimer = setTimeout(() => {
          if (finished) return;
          if (process.platform === 'win32') {
            // 再尝试一次；taskkill 已经 /F 了，一般不需要额外动作
            try { spawn('taskkill', ['/PID', String(pid), '/T', '/F']); } catch {}
          } else {
            try { process.kill(-pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
          }
        }, Math.max(0, graceKillMs));
      }, timeoutMs);
    }
  });
}
