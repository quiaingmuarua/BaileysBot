// server.js  (ESM)
import express from 'express';
import cors from 'cors';
import { handleAccountLogin } from './accountHandler.js';

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

  let responded = false;

  await handleAccountLogin(req.body, {
    onResponse: (result) => {
      if (!responded) {
        responded = true;
        res.json(result);
      }
    },
    onError: (error) => {
      if (!responded) {
        responded = true;
        res.status(error.code || 500).json({ error: error.error || 'Internal Server Error' });
      }
    },
    onOutput: (chunk, stream) => {
      // 如需实时日志，这里可以转发到你的日志系统/SSE
      // HTTP 不需要实时转发，由 accountHandler 处理日志
    }
  });
});

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '127.0.0.1';  // Docker 中使用 0.0.0.0，本地开发可用 127.0.0.1

app.listen(PORT, HOST, () => {
  console.log(`✅ HTTP server listening on http://${HOST}:${PORT}`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
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
