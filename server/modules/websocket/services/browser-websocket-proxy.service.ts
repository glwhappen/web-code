import { WebSocket } from 'ws';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function handleBrowserWsProxy(clientWs: WebSocket, requestUrl: string): void {
  const parsed = new URL(requestUrl, 'http://localhost');
  const pathname = parsed.pathname.replace(/^\/browser-ws\//, '');
  const slashIndex = pathname.indexOf('/');
  const hostport = slashIndex === -1 ? pathname : pathname.slice(0, slashIndex);
  const upstreamPath = slashIndex === -1 ? '/' : pathname.slice(slashIndex);

  const lastColon = hostport.lastIndexOf(':');
  const host = lastColon !== -1 ? hostport.slice(0, lastColon) : hostport;
  const port = lastColon !== -1 ? Number.parseInt(hostport.slice(lastColon + 1), 10) : 80;

  if (!ALLOWED_HOSTS.has(host) || Number.isNaN(port) || port < 1 || port > 65535) {
    clientWs.close(4400, 'Invalid browser websocket target');
    return;
  }

  parsed.searchParams.delete('token');
  parsed.searchParams.delete('proxyToken');
  const upstreamUrl = `ws://${host}:${port}${upstreamPath}${parsed.search}`;
  const upstream = new WebSocket(upstreamUrl);

  upstream.on('open', () => {
    console.log(`[BrowserProxy] WS connected to ${upstreamUrl}`);
  });

  upstream.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  upstream.on('close', (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code || 1000, reason.toString());
    }
  });

  clientWs.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  });

  upstream.on('error', (error) => {
    console.error('[BrowserProxy] WS upstream error:', error.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4502, 'Browser WS upstream error');
    }
  });

  clientWs.on('error', () => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  });
}
