import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { EnergyError } from './energy.mjs';
import { Demo, DemoError, TEMPLATE } from './simulator.mjs';

const LEAVE = '/demo/leave-check';
const ENERGY = '/demo/energy';
const envelope = { template_id: TEMPLATE, demo_mode: true };

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 65536) chunks.push(chunk);
  }
  if (size > 65536) throw new DemoError(413, 'REQUEST_TOO_LARGE', '请求体超过 64 KiB。');
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DemoError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new DemoError(400, 'INVALID_REQUEST', '请求体必须是 JSON 对象。');
  }
  return data;
}

function route(demo, method, url, body) {
  const path = url.pathname;
  const key = method + ' ' + path;
  switch (key) {
    case 'GET ' + LEAVE + '/state':
      demo.requireTemplate(url.searchParams.get('template_id'));
      return [200, demo.snapshot(url.searchParams.get('task_id'))];
    case 'POST ' + LEAVE + '/reset':
      return [200, demo.reset(body)];
    case 'POST ' + LEAVE + '/plans':
      return [body.task_id === undefined ? 201 : 200, demo.plan(body)];
    case 'POST ' + LEAVE + '/state/refresh':
      return [200, demo.refresh(body)];
    case 'POST ' + LEAVE + '/debug/advance':
      return [200, demo.advance(body)];
    case 'POST ' + ENERGY + '/samples':
      return [200, demo.sampleEnergy(body)];
    case 'POST ' + ENERGY + '/plans':
      return [201, demo.energyPlan(body)];
    case 'POST ' + ENERGY + '/authorization/check':
      return [200, demo.energyAuthorization(body)];
  }

  const match = /^\/demo\/leave-check\/tasks\/([^/]+)\/(user-away|manual-records\/([^/]+)|executions(?:\/([^/]+))?)$/.exec(path);
  if (match) {
    const [, taskId, action, objectId, executionId] = match;
    if (method === 'PUT' && action === 'user-away') return [200, demo.away(taskId, body)];
    if (method === 'PUT' && objectId) return [200, demo.manual(taskId, objectId, body)];
    if (method === 'POST' && action === 'executions') return [202, demo.execute(taskId, body)];
    if (method === 'GET' && executionId) return [200, demo.readExecution(taskId, executionId)];
  }
  throw new DemoError(404, 'ROUTE_NOT_FOUND', '模拟路由不存在。');
}

export function createDemoServer() {
  const sessions = new Map();
  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Session');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    let demo;

    function send(status, body) {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ...envelope, ...(demo ? { generation: demo.generation } : {}), ...body }));
    }

    try {
      const session = request.headers['x-demo-session'] ?? 'default';
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(session)) {
        throw new DemoError(400, 'INVALID_SESSION', 'X-Demo-Session 必须为 1–80 位字母、数字、下划线或连字符。');
      }
      const url = new URL(request.url, 'http://localhost');
      const body = ['POST', 'PUT'].includes(request.method) ? await readBody(request) : {};
      if (!sessions.has(session)) {
        sessions.set(session, new Demo(randomUUID));
      }
      demo = sessions.get(session);
      const [status, result] = route(demo, request.method, url, body);
      send(status, result);
    } catch (error) {
      if (error instanceof DemoError || error instanceof EnergyError) {
        send(error.status, { error: { code: error.code, message: error.message }, ...error.details });
      } else {
        console.error(error);
        send(500, { error: { code: 'INTERNAL_ERROR', message: '模拟服务处理失败。' } });
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.DEMO_PORT ?? 8787);
  createDemoServer().listen(port, '127.0.0.1', function () {
    console.log('Future Home demo listening on http://127.0.0.1:' + this.address().port);
  });
}
