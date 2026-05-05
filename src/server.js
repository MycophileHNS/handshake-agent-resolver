#!/usr/bin/env node
import http from 'node:http';
import {resolveAgentIdentity} from './index.js';

function parseArgs(argv) {
  const args = {
    port: 8787,
    servers: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--port') {
      const port = Number(argv[++i]);

      if (!Number.isInteger(port) || port <= 0)
        throw new Error('--port requires a positive integer');

      args.port = port;
      continue;
    }

    if (arg === '--server') {
      const server = argv[++i];

      if (!server)
        throw new Error('--server requires a value');

      args.servers.push(server);
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`unexpected argument: ${arg}`);
  }

  return args;
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body, null, 2);

  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(`${json}\n`);
}

function printHelp() {
  console.log(`Usage: npm run serve -- [--port 8787] [--server <dns-server>]

Resolve with:
  curl 'http://127.0.0.1:8787/resolve?name=alice'`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`);

  if (url.pathname !== '/resolve') {
    sendJson(res, 404, {
      error: 'not_found',
      message: 'use /resolve?name=<handshake-name>'
    });
    return;
  }

  const name = url.searchParams.get('name');

  if (!name) {
    sendJson(res, 400, {
      error: 'bad_request',
      message: 'name query parameter is required'
    });
    return;
  }

  try {
    const result = await resolveAgentIdentity(name, {
      dns: args.servers.length > 0
        ? {servers: args.servers}
        : undefined
    });

    sendJson(res, result.status === 'found' ? 200 : 404, result);
  } catch (error) {
    sendJson(res, 400, {
      error: 'bad_request',
      message: error.message
    });
  }
});

server.listen(args.port, '127.0.0.1', () => {
  console.log(`Agent-aware resolver listening on http://127.0.0.1:${args.port}`);
});
