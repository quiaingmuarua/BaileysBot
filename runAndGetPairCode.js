// runAndGetPairCode.js
import { spawn } from 'child_process';
import readline from 'node:readline';

/**
 * 执行命令并在输出中提取 pairCode（不中断子进程，直到自然退出或超时）
 * @param {object} options
 * @param {string} options.cmdString                 - 整条命令字符串
 * @param {number} [options.timeoutMs]               - 超时（毫秒），到时会 TERM -> KILL
 * @param {string} [options.cwd]                     - 工作目录
 * @param {object} [options.env]                     - 环境变量
 * @param {(code:string)=>void} [options.onPairCode] - 捕获到 pairCode 的即时回调
 * @param {(chunk:string, stream:'stdout'|'stderr')=>void} [options.onOutput] - 实时日志回调
 * @returns {Promise<{ pairCode: string|null, exitCode: number|null, output: string, timedOut: boolean }>}
 */
export function runAndGetPairCode({
  cmdString,
  timeoutMs,
  cwd,
  env,
  onPairCode,
  onOutput,
}) {
  return new Promise((resolve, reject) => {
    if (!cmdString) return reject(new Error('必须提供 cmdString'));

    const child = spawn(cmdString, { shell: true, cwd, env });

    let pairCode = null;
    let output = '';
    let finished = false;
    let timedOut = false;
    let killerTimer = null;

    const rlOut = readline.createInterface({ input: child.stdout });
    const rlErr = readline.createInterface({ input: child.stderr });

    const tryMatch = (text) => {
      const m = text.match(/pairCode:(\S+)/);
      if (m && !pairCode) {
        pairCode = m[1];
        onPairCode?.(pairCode);
      }
    };

    rlOut.on('line', (line) => {
      output += line + '\n';
      onOutput?.(line + '\n', 'stdout');
      tryMatch(line);
    });

    rlErr.on('line', (line) => {
      output += line + '\n';
      onOutput?.(line + '\n', 'stderr');
      tryMatch(line);
    });

    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(killerTimer);
      reject(err);
    });

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(killerTimer);
      resolve({ pairCode, exitCode: code, output, timedOut });
    });

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      killerTimer = setTimeout(() => {
        timedOut = true;
        if (process.platform === 'win32') {
          child.kill();
        } else {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!finished) child.kill('SIGKILL');
          }, 5000);
        }
      }, timeoutMs);
    }
  });
}
