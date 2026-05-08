# Manual Install and Usage Guide

This guide explains how to install, test, run, and manually use the Handshake Agent-Aware Resolver.

The resolver reads Handshake DNS records, looks for compatible agent identity metadata, and returns a normalized resolver result. It can use the system DNS resolver, hnsd, hsd, or another hnsd-compatible recursive resolver.

## Prerequisites

You need:

- Node.js 18 or newer
- npm
- A terminal
- Optional: hnsd, hsd, or another Handshake-aware resolver for live Handshake lookups

The unit tests do not require a live hnsd node. They use mock resolver sources.

## Install

```sh
npm install
```

## Test

```sh
npm test
```

This runs the Node.js test runner against `tests/*.test.js`.

## Configure hnsd or an hnsd-Compatible Resolver

For live Handshake name resolution, run a local recursive resolver that can answer Handshake DNS queries. The resolver only needs a DNS server address. It does not modify hnsd or read hnsd internals.

Example hnsd startup command:

```sh
mkdir -p ~/.hnsd
hnsd -t -x ~/.hnsd -r 127.0.0.1:5350
```

This exposes a recursive resolver at `127.0.0.1:5350`.

Any hnsd-compatible resolver works if it can answer DNS queries for Handshake names, including TXT records. If your resolver listens somewhere else, use that address instead.

Verify the resolver directly:

```sh
dig @127.0.0.1 -p 5350 example TXT
```

Replace `example` with a real Handshake name.

## Run the CLI

Use the default DNS settings:

```sh
npm run resolve -- alice
```

Use a specific hnsd or hnsd-compatible resolver:

```sh
npm run resolve -- alice --server 127.0.0.1:5350
```

Force exploratory SKILL.md discovery even when compatible TXT metadata is not found:

```sh
npm run resolve -- alice --server 127.0.0.1:5350 --force-skill-discovery
```

Show CLI help:

```sh
npm run resolve -- --help
```

The CLI exits with:

- `0` when compatible agent metadata is found
- `2` when compatible agent metadata is not found
- `1` when the command fails because of invalid arguments or another error

## Run the Server

Start the local HTTP server:

```sh
npm run serve
```

By default, the server listens on `http://127.0.0.1:8787`.

Start on a custom port:

```sh
npm run serve -- --port 8787
```

Start with a specific hnsd or hnsd-compatible resolver:

```sh
npm run serve -- --port 8787 --server 127.0.0.1:5350
```

Resolve a name through HTTP:

```sh
curl 'http://127.0.0.1:8787/resolve?name=alice'
```

Force exploratory SKILL.md discovery through HTTP:

```sh
curl 'http://127.0.0.1:8787/resolve?name=alice&forceSkillDiscovery=1'
```

The server returns:

- `200` when compatible agent metadata is found
- `404` when compatible agent metadata is not found
- `400` for bad requests, such as a missing `name` query parameter
- `404` for unknown paths

## Publish Compatible TXT Metadata

To get a successful `found` response, the Handshake name needs compatible TXT metadata.

Example TXT value:

```text
agent-identity:v1={"version":1,"name":"Example Agent","endpoint":"https://example.invalid","skill":"/SKILL.md","capabilities":["search","resolve","verify"],"protocols":["mcp","a2a","http"]}
```

The resolver checks these locations:

1. The name itself, such as `alice`
2. `_agent.<name>`, such as `_agent.alice`
3. `_agent-identity.<name>`, such as `_agent-identity.alice`

You only need to publish the metadata in one of those locations.

## Example Resolver Output

Successful output looks like this:

```json
{
  "name": "example",
  "resolved": true,
  "addresses": ["192.0.2.10"],
  "address": "192.0.2.10",
  "recordType": "A",
  "source": {
    "type": "dns",
    "servers": ["127.0.0.1:5350"]
  },
  "records": {
    "A": ["192.0.2.10"],
    "AAAA": [],
    "TXT": [["agent-identity:v1=ready=1;skill=/SKILL.md;protocols=mcp,a2a,http;capabilities=search,resolve,verify;endpoint=https://example.invalid"]]
  },
  "recordStatus": {
    "A": "ok",
    "AAAA": "no_records",
    "TXT": "ok"
  },
  "errors": [],
  "agentReady": true,
  "metadataFound": true,
  "metadataSource": "TXT",
  "metadata": {
    "version": 1,
    "ready": true,
    "skill": "/SKILL.md",
    "endpoint": "https://example.invalid",
    "capabilities": [
      {"id": "search", "name": "search"},
      {"id": "resolve", "name": "resolve"},
      {"id": "verify", "name": "verify"}
    ],
    "protocols": [
      {"id": "mcp", "name": "mcp"},
      {"id": "a2a", "name": "a2a"},
      {"id": "http", "name": "http"}
    ]
  },
  "skill": {
    "checked": true,
    "found": true,
    "canonicalPath": "/SKILL.md",
    "url": "https://example.invalid/SKILL.md",
    "attempts": [],
    "warnings": []
  },
  "capabilities": [
    {"id": "search", "name": "search"},
    {"id": "resolve", "name": "resolve"},
    {"id": "verify", "name": "verify"}
  ],
  "protocols": [
    {"id": "mcp", "name": "mcp"},
    {"id": "a2a", "name": "a2a"},
    {"id": "http", "name": "http"}
  ],
  "warnings": [],
  "status": "found",
  "queryName": "example",
  "location": "@"
}
```

If the name resolves but compatible metadata is missing, the resolver returns `status: "not_found"`, `metadataFound: false`, `agentReady: false`, and a `reason` such as `no_compatible_records` or `no_records`.

## Troubleshooting

### `npm test` fails

Make sure you are using Node.js 18 or newer:

```sh
node --version
```

Then reinstall and test again:

```sh
npm install
npm test
```

### CLI returns `not_found`

Check that your TXT record:

- starts with `agent-identity:v1=`
- contains valid JSON or valid compact metadata
- is published at the name apex, `_agent.<name>`, or `_agent-identity.<name>`
- has propagated to the DNS resolver you are using

### DNS lookup fails

Confirm that hnsd or your compatible resolver is running:

```sh
dig @127.0.0.1 -p 5350 <handshake-name> A
dig @127.0.0.1 -p 5350 <handshake-name> TXT
```

Then pass the same resolver address to the CLI:

```sh
npm run resolve -- <handshake-name> --server 127.0.0.1:5350
```

### SKILL.md is not checked

By default, SKILL.md discovery only runs when compatible agent metadata is found.

To force exploratory SKILL.md discovery:

```sh
npm run resolve -- <handshake-name> --force-skill-discovery
```

or through the server:

```sh
curl 'http://127.0.0.1:8787/resolve?name=<handshake-name>&forceSkillDiscovery=1'
```

## Summary

Basic local workflow:

```sh
npm install
npm test
npm run resolve -- <handshake-name>
npm run serve -- --port 8787
curl 'http://127.0.0.1:8787/resolve?name=<handshake-name>'
```

Live Handshake resolver workflow:

```sh
hnsd -t -x ~/.hnsd -r 127.0.0.1:5350
npm run resolve -- <handshake-name> --server 127.0.0.1:5350
npm run serve -- --server 127.0.0.1:5350
curl 'http://127.0.0.1:8787/resolve?name=<handshake-name>'
```
