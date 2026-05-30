import express from 'express';
import http from 'http';
import https from 'https';
import { URL } from 'url';

const router = express.Router();
const PROXY_PREFIX = '/api/browser-proxy';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function rewriteHtml(html, proxyBase) {
  // Inject <base> tag so all relative paths resolve through the proxy
  let result = html.replace(/(<head[^>]*>)/i, `$1<base href="${proxyBase}">`);
  if (result === html) {
    // No <head> tag found — prepend base tag
    result = `<base href="${proxyBase}">` + html;
  }

  // Rewrite absolute paths (e.g. href="/path", src="/img.png")
  // <base href> only handles relative paths; absolute paths must be rewritten manually
  const proxyRoot = proxyBase.slice(0, -1); // strip trailing slash
  result = result.replace(
    /\b(href|src|action)="(\/(?!\/)[^"]*)"/gi,
    (_, attr, path) => `${attr}="${proxyRoot}${path}"`
  );

  return result;
}

router.use(async (req, res) => {
  // req.path = "/localhost:3000/some/path"
  const pathMatch = req.path.match(/^\/([^/]+)(\/.*)?$/);
  if (!pathMatch) {
    return res.status(400).send('Invalid proxy URL. Use /api/browser-proxy/host:port/path');
  }

  const hostport = pathMatch[1];
  const targetPath = pathMatch[2] || '/';

  // Preserve the original query string without re-encoding
  const questionIdx = req.url.indexOf('?');
  const rawQuery = questionIdx !== -1 ? req.url.slice(questionIdx) : '';
  const fullTargetPath = targetPath + rawQuery;

  // Parse host and port
  const lastColon = hostport.lastIndexOf(':');
  const host = lastColon !== -1 ? hostport.slice(0, lastColon) : hostport;
  const port = lastColon !== -1 ? parseInt(hostport.slice(lastColon + 1), 10) : 80;

  if (!ALLOWED_HOSTS.has(host)) {
    return res.status(403).json({ error: 'Only localhost / 127.0.0.1 targets are allowed.' });
  }
  if (isNaN(port) || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Invalid port number.' });
  }

  const proxyBase = `${PROXY_PREFIX}/${hostport}/`;

  // Build forwarded headers
  const forwardHeaders = { ...req.headers };
  delete forwardHeaders.host;
  delete forwardHeaders.connection;
  delete forwardHeaders.upgrade;
  // Disable compression so HTML can be rewritten without decompressing first
  forwardHeaders['accept-encoding'] = 'identity';
  forwardHeaders.host = `${host}:${port}`;

  const options = {
    hostname: host,
    port,
    path: fullTargetPath,
    method: req.method,
    headers: forwardHeaders,
  };

  const protocol = port === 443 ? https : http;

  const proxyReq = protocol.request(options, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] || '';
    const isHtml = contentType.includes('text/html');
    const { statusCode } = proxyRes;

    // Rewrite redirect Location headers to stay inside the proxy
    if ([301, 302, 303, 307, 308].includes(statusCode) && proxyRes.headers.location) {
      const location = proxyRes.headers.location;
      let rewritten = location;

      if (location.startsWith('/')) {
        rewritten = `${PROXY_PREFIX}/${hostport}${location}`;
      } else {
        try {
          const locUrl = new URL(location);
          if (ALLOWED_HOSTS.has(locUrl.hostname)) {
            const locPort = locUrl.port || '80';
            rewritten = `${PROXY_PREFIX}/${locUrl.hostname}:${locPort}${locUrl.pathname}${locUrl.search}`;
          }
        } catch {
          // Not a valid absolute URL — leave as-is
        }
      }

      res.setHeader('location', rewritten);
    }

    // Forward response headers, skipping ones that break proxying
    const skipHeaders = new Set(['content-encoding', 'transfer-encoding', 'content-length', 'location']);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (!skipHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    res.status(statusCode);

    if (isHtml) {
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8');
        res.send(rewriteHtml(html, proxyBase));
      });
      proxyRes.on('error', () => !res.headersSent && res.end());
    } else {
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
    if (res.headersSent) return;
    if (err.code === 'ECONNREFUSED') {
      res.status(502).send(`<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:2rem;color:#555">
  <h2>⚠️ Cannot connect to <code>${hostport}</code></h2>
  <p>Make sure your server is running on port <strong>${port}</strong>.</p>
  <p style="color:#aaa;font-size:0.8rem">${err.message}</p>
</body></html>`);
    } else {
      res.status(502).send(`Proxy error: ${err.message}`);
    }
  });

  // Forward request body (body may already be parsed by Express middleware)
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (req.body !== undefined) {
      const ct = (req.headers['content-type'] || '').split(';')[0].trim();
      let bodyBuf;
      if (ct === 'application/json') {
        bodyBuf = Buffer.from(JSON.stringify(req.body), 'utf8');
        proxyReq.setHeader('content-type', 'application/json');
      } else {
        bodyBuf = Buffer.from(
          typeof req.body === 'string' ? req.body : new URLSearchParams(req.body).toString(),
          'utf8'
        );
      }
      proxyReq.setHeader('content-length', bodyBuf.length);
      proxyReq.write(bodyBuf);
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  } else {
    proxyReq.end();
  }
});

export default router;
