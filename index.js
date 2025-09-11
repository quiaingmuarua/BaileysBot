// server.js  (ESM)
import express from 'express';
import cors from 'cors';
import { runAndGetPairCode } from './runAndGetPairCode.js';

const app = express();
app.use(cors());
// 一定要在路由前挂载 json 解析中间件
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * POST /account/login
 * body 例如:
 * { "number":"66961687827", "timeout":60, "clean":"true" }
 * 一旦捕获到 pairCode，立即返回 {"pairCode": "...", "mode":"early", ...}
 * 子进程继续在后台运行直到结束
 */
app.post('/account/login', async (req, res) => {
  // —— 调试日志 —— //
  console.log('📥 /account/login 收到请求');
  console.log('Headers:', req.headers);
  console.log('Body   :', req.body);

  try {
    const body = req.body ?? {};
    const script =body.script ?? "example";
    const number = (body.number ?? '').toString().trim();
    const timeout = Number.isFinite(Number(body.timeout)) ? Number(body.timeout) : 60;

    if (!number) {
      console.log('❌ 缺少 number 字段');
      return res.status(400).json({ error: 'number 必填' });
    }

    // 把额外字段（如 clean）也拼进 CLI
    const params = { action: 'login', number, timeout, ...body };

    // 拼接命令：node account_manager_server.js key=value ...
    const args = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${v}`);
    const cmdString = `node ${script}.js ${number} `;

    // 兜底超时（给主程序 timeout 多加 10s）
    const timeoutMs = timeout * 1000 + 10_000;

    console.log('➡️ 执行命令:', cmdString, '  (timeoutMs=', timeoutMs, ')');

    let responded = false;

    // 启动任务：不要 await！
    runAndGetPairCode({
      cmdString,
      timeoutMs,
      onPairCode: (pairCode) => {
        console.log('🎯 捕获到 pairCode:', pairCode);
        if (!responded) {
          responded = true;
          res.json({ pairCode, mode: 'early', "code":"200" });
        }
      },
      onLoginStatus: (pairCode) => {
        console.log(" loginStatus:", pairCode);
        if(!responded && pairCode === "true"){
          responded = true;
          res.json({ "pairCode":"", mode: 'early', "code":"300" });

        }


      },
      onOutput: (chunk, stream) => {
        // 如需实时日志，这里可以转发到你的日志系统/SSE
        console.log(`[${stream}] ${chunk.trim()}`);

      },
    })
      .then((result) => {
        // 任务结束后的收尾日志；不要再写 res（可能已返回）
        console.log('✅ 子进程结束:', {
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          pairCode: result.pairCode,
        });
        if (!responded) {
          responded = true;
          // 万一没匹配到 pairCode，也保证有响应
          res.json({ mode: 'final', ...result });
        }
      })
      .catch((err) => {
        console.error('🔥 子进程异常:', err);
        if (!responded) {
          responded = true;
          res.status(500).json({ error: err?.message || 'Internal Server Error' });
        }
      });
  } catch (e) {
    console.error('🔥 /account/login 异常:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: e?.message || 'Internal Server Error' });
    }
  }
});

const PORT = process.env.PORT || 8000;  // 使用8000端口避免权限问题
app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ HTTP server listening on http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('❌ 服务器启动失败:', err);
  if (err.code === 'EACCES') {
    console.error('💡 解决方案:');
    console.error('   1. 以管理员身份运行: 右键 -> "以管理员身份运行"');
    console.error('   2. 或者修改 PORT 环境变量为更高的端口 (如 8000)');
    console.error('   3. 当前使用端口:', PORT);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`💡 端口 ${PORT} 已被占用，请关闭占用该端口的程序`);
  }
  process.exit(1);
});
