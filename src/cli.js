#!/usr/bin/env node
import {resolveAgentIdentity} from './index.js';

function parseArgs(argv) {
  const args = {
    servers: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

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

    if (!args.name) {
      args.name = arg;
      continue;
    }

    throw new Error(`unexpected argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run resolve -- <handshake-name> [--server <dns-server>]

Examples:
  npm run resolve -- alice
  npm run resolve -- alice --server 127.0.0.1:5350`);
}

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.name) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const result = await resolveAgentIdentity(args.name, {
    dns: args.servers.length > 0
      ? {servers: args.servers}
      : undefined
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'found' ? 0 : 2);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
