import { createServer } from 'node:http';

// REQ-DEPLOYMENT-006
const READINESS = '/actuator/health/readiness';

// REQ-DEPLOYMENT-006
async function listening(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

// REQ-DEPLOYMENT-006
export async function fictitiousService({ ready = true } = {}) {
  let up = ready;
  const service = await listening((request, response) => {
    if (request.url !== READINESS) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(up ? 200 : 503, { 'content-type': 'application/vnd.spring-boot.actuator.v3+json' });
    response.end(JSON.stringify({ status: up ? 'UP' : 'DOWN' }));
  });
  return { ...service, readiness: service.url(READINESS), stop: service.stop, halt: () => { up = false; } };
}

// REQ-DEPLOYMENT-018
const LOOKS_LIKE_A_FILE = /\.[A-Za-z0-9]+$/;

// REQ-DEPLOYMENT-006, REQ-DEPLOYMENT-018
export async function frontendProxy({ masksUnknown = true } = {}) {
  // REQ-DEPLOYMENT-006
  const proxy = await listening((request, response) => {
    // REQ-DEPLOYMENT-018
    if (!masksUnknown && LOOKS_LIKE_A_FILE.test(new URL(request.url, 'http://proxy').pathname)) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body>не найдено</body></html>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body>приложение</body></html>');
  });
  return { ...proxy, readiness: proxy.url(READINESS) };
}
