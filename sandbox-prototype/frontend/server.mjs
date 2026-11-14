import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8780);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.glb':'model/gltf-binary', '.png':'image/png', '.svg':'image/svg+xml' };
const allowed = ['frontend/', 'house-modeling/viewer/', 'house-modeling/releases/v0.1/'];
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.writeHead(302, { Location:'/frontend/' }); res.end(); return; }
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (relative.endsWith('/')) relative += 'index.html';
    const absolute = path.resolve(root, relative);
    relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (relative.startsWith('..') || (!allowed.some(prefix => relative.startsWith(prefix)) && relative !== 'backend/离家检查联调样例.json') || !mime[path.extname(absolute)]) {
      res.writeHead(404); res.end('Not found'); return;
    }
    if (!(await stat(absolute)).isFile()) throw new Error('Not a file');
    const body = await readFile(absolute);
    res.writeHead(200, { 'Content-Type':mime[path.extname(absolute)], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`未来家庭 · 本地演示  http://127.0.0.1:${port}/frontend/\n静态资源服务；未连接任何业务或设备服务。`));

