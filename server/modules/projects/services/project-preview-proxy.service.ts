import http from 'node:http';
import path from 'node:path';

import { WebSocket } from 'ws';

import { projectsDb } from '@/modules/database/index.js';
import type { ProjectRepositoryRow } from '@/shared/types.js';

import { parseProjectHost, projectDisplayNameToHostLabel } from '../../../../shared/projectHosts.js';

type ProjectPreviewHostInfo = {
  hostname: string;
  projectLabel: string;
  isDev: boolean;
};

type ProjectPreviewTarget = {
  project: ProjectRepositoryRow;
  hostInfo: ProjectPreviewHostInfo;
  upstreamPort: number;
};

function normalizePreviewPort(port: number | null | undefined): number | null {
  if (port === null || port === undefined || !Number.isFinite(port)) {
    return null;
  }

  const normalizedPort = Math.floor(port);
  if (normalizedPort < 1 || normalizedPort > 65535) {
    return null;
  }

  return normalizedPort;
}

function resolveProjectDisplayName(project: ProjectRepositoryRow): string {
  const trimmedCustomName = typeof project.custom_project_name === 'string' ? project.custom_project_name.trim() : '';
  if (trimmedCustomName.length > 0) {
    return trimmedCustomName;
  }

  return path.basename(project.project_path) || project.project_path;
}

function rewriteSetCookieHeaders(headers: string[] | string | number | undefined): string[] | undefined {
  if (!headers) {
    return undefined;
  }

  const sourceHeaders = Array.isArray(headers) ? headers : [String(headers)];
  const rewrittenHeaders = sourceHeaders.map((headerValue) =>
    String(headerValue)
      .replace(/;\s*Domain=(localhost|127\.0\.0\.1|\[::1\])/gi, '')
      .replace(/;\s*Domain=localhost:[0-9]+/gi, ''),
  );

  return rewrittenHeaders;
}

function rewriteRedirectLocation(
  location: string,
  publicOrigin: string,
  upstreamPort: number,
): string {
  try {
    const parsed = new URL(location, publicOrigin);
    const matchesLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1';

    if (matchesLocalhost && (!parsed.port || Number.parseInt(parsed.port, 10) === upstreamPort)) {
      return new URL(parsed.pathname + parsed.search + parsed.hash, publicOrigin).toString();
    }
  } catch {
    return location;
  }

  return location;
}

function resolveProjectTarget(hostname: string): ProjectPreviewTarget | null {
  const hostInfo = parseProjectHost(hostname);
  if (!hostInfo) {
    return null;
  }

  const projectRows = projectsDb.getAllActiveProjectPaths();
  const project = projectRows.find((projectRow) => {
    const displayName = resolveProjectDisplayName(projectRow);
    return projectDisplayNameToHostLabel(displayName, projectRow.project_path) === hostInfo.projectLabel;
  });

  if (!project) {
    return null;
  }

  const upstreamPort = normalizePreviewPort(hostInfo.isDev ? project.preview_dev_port : project.preview_prod_port)
    ?? normalizePreviewPort(hostInfo.isDev ? project.preview_prod_port : project.preview_dev_port);

  if (!upstreamPort) {
    return null;
  }

  return {
    project,
    hostInfo,
    upstreamPort,
  };
}

export function getProjectPreviewTarget(hostname: string): ProjectPreviewTarget | null {
  return resolveProjectTarget(hostname);
}

export async function proxyProjectPreviewRequest(
  req: import('express').Request,
  res: import('express').Response,
): Promise<boolean> {
  const hostInfo = parseProjectHost(req.hostname);
  if (!hostInfo) {
    return false;
  }

  const target = resolveProjectTarget(req.hostname);
  if (!target) {
    res.status(503).json({
      error: `Project preview host "${hostInfo.hostname}" is not configured`,
      details: `Set previewProdPort / previewDevPort for the project named "${hostInfo.projectLabel}".`,
    });
    return true;
  }

  const publicOrigin = `${req.protocol}://${req.get('host') ?? req.hostname}`;
  const targetPath = `${req.originalUrl || req.url || '/'}`;
  const forwardHeaders: Record<string, string | string[] | undefined> = {
    ...req.headers,
    host: `127.0.0.1:${target.upstreamPort}`,
    connection: 'close',
    'x-forwarded-host': req.get('host') ?? req.hostname,
    'x-forwarded-proto': req.protocol,
    'x-forwarded-port': String(target.upstreamPort),
    'accept-encoding': 'identity',
  };
  delete forwardHeaders.upgrade;
  delete forwardHeaders['proxy-connection'];

  const requestOptions: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: target.upstreamPort,
    method: req.method,
    path: targetPath,
    headers: forwardHeaders,
  };

  const proxyReq = http.request(requestOptions, (proxyRes) => {
    const rewrittenLocation = proxyRes.headers.location
      ? rewriteRedirectLocation(String(proxyRes.headers.location), publicOrigin, target.upstreamPort)
      : null;

    if (rewrittenLocation) {
      proxyRes.headers.location = rewrittenLocation;
    }

    const rewrittenSetCookie = rewriteSetCookieHeaders(proxyRes.headers['set-cookie']);
    if (rewrittenSetCookie) {
      proxyRes.headers['set-cookie'] = rewrittenSetCookie;
    }

    res.statusCode = proxyRes.statusCode ?? 502;
    if (proxyRes.statusMessage) {
      res.statusMessage = proxyRes.statusMessage;
    }

    for (const [headerName, headerValue] of Object.entries(proxyRes.headers)) {
      if (headerName === 'location' && rewrittenLocation) {
        res.setHeader(headerName, rewrittenLocation);
        continue;
      }

      if (headerName === 'set-cookie' && rewrittenSetCookie) {
        res.setHeader(headerName, rewrittenSetCookie);
        continue;
      }

      if (headerValue !== undefined) {
        res.setHeader(headerName, headerValue);
      }
    }

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    console.error('[ProjectPreviewProxy] HTTP proxy error:', error.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: `Failed to reach preview port ${target.upstreamPort}`,
        details: error.message,
      });
      return;
    }

    res.end();
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    proxyReq.end();
    return true;
  }

  req.pipe(proxyReq);
  return true;
}

export function proxyProjectPreviewWebSocket(
  clientWs: WebSocket,
  requestUrl: string,
  hostname: string,
  requestHeaders: Record<string, string | string[] | undefined> = {},
): boolean {
  const hostInfo = parseProjectHost(hostname);
  if (!hostInfo) {
    return false;
  }

  const target = resolveProjectTarget(hostname);
  if (!target) {
    clientWs.close(4404, `Project preview host "${hostInfo.hostname}" is not configured`);
    return true;
  }

  const parsedRequestUrl = new URL(requestUrl, 'http://localhost');
  const upstreamUrl = `ws://127.0.0.1:${target.upstreamPort}${parsedRequestUrl.pathname}${parsedRequestUrl.search}`;
  const forwardedOrigin = typeof requestHeaders.origin === 'string' ? requestHeaders.origin : undefined;
  const upstream = new WebSocket(upstreamUrl, forwardedOrigin ? { headers: { origin: forwardedOrigin } } : undefined);

  upstream.on('open', () => {
    console.log(`[ProjectPreviewProxy] WS connected to ${upstreamUrl}`);
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
    console.error('[ProjectPreviewProxy] WS upstream error:', error.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4502, 'Project preview WS upstream error');
    }
  });

  clientWs.on('error', () => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  });

  return true;
}
