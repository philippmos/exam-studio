/**
 * Tiny zero-dependency web server for the E2E tests.
 *
 * Serves the Angular *production* build (client/dist) with SPA fallback and
 * reverse-proxies /graphql and /health to the API — exactly what nginx does
 * in the production image. This way the E2E suite runs against the same
 * bundle that ships, without needing the Angular toolchain in the test job.
 *
 *   node server.mjs --port 4173 --dist ../dist/exam-studio/browser --api http://localhost:8000
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? 4173);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, args.dist ?? '../dist/exam-studio/browser');
const apiUrl = new URL(args.api ?? 'http://localhost:8000');

if (!existsSync(path.join(distDir, 'index.html'))) {
  console.error(
    `No Angular build found at ${distDir}.\n` +
      'Build the client first: npm run build (in the client/ directory).',
  );
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://localhost:${port}`).pathname;
  if (pathname === '/graphql' || pathname === '/health') {
    proxyToApi(req, res, pathname);
  } else if (pathname === '/config.json') {
    serveConfig(res);
  } else {
    serveStatic(pathname, res);
  }
});

// Mirror the nginx image's runtime config: serve /config.json from environment
// variables so the production bundle boots under the E2E server too.
function serveConfig(res) {
  const config = {
    graphqlUrl: process.env.GRAPHQL_URL ?? '/graphql',
    auth0: {
      domain: process.env.AUTH0_DOMAIN ?? '',
      clientId: process.env.AUTH0_CLIENT_ID ?? '',
      audience: process.env.AUTH0_AUDIENCE ?? '',
    },
  };
  res.writeHead(200, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(config));
}

function proxyToApi(req, res, pathname) {
  const upstream = http.request(
    {
      hostname: apiUrl.hostname,
      port: apiUrl.port || 80,
      path: pathname,
      method: req.method,
      headers: { ...req.headers, host: apiUrl.host },
    },
    (apiResponse) => {
      res.writeHead(apiResponse.statusCode ?? 502, apiResponse.headers);
      apiResponse.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Bad gateway: ${apiUrl.origin} is not reachable (${error.message})`);
  });
  req.pipe(upstream);
}

function serveStatic(pathname, res) {
  const relativePath = path
    .normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distDir, relativePath);

  const isFile =
    filePath.startsWith(distDir) && existsSync(filePath) && statSync(filePath).isFile();
  if (!isFile) {
    // SPA fallback: unknown routes are handled by the Angular router.
    filePath = path.join(distDir, 'index.html');
  }

  res.writeHead(200, {
    'content-type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    parsed[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return parsed;
}

server.listen(port, () => {
  console.log(
    `exam-studio e2e server on http://localhost:${port} ` +
      `(static: ${distDir}, /graphql -> ${apiUrl.origin})`,
  );
});
