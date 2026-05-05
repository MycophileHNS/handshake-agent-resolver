# Agent-Aware Resolver

This resolver builds alongside hnsd. It does not modify hnsd core and does not
add a centralized registry, centralized directory, or centralized AgentDNS-style
root server.

## What This Resolver Does

The resolver accepts any Handshake name and returns an enriched agent-aware
result:

1. DNS resolution output from a caller-provided source, hnsd, or an
   hnsd-compatible resolver.
2. Agent metadata parsed from compatible TXT records.
3. SKILL.md discovery and fetch status.
4. Address, capability, and supported protocol information.

Compatibility is based on records published by the name owner. The resolver does
not privilege a suffix or namespace.

## What hnsd Does

hnsd resolves Handshake names and exposes DNS behavior. It handles Handshake
sync, name proofs, name-state data, and DNS responses.

This project treats hnsd as a resolver source or reference point. It does not
patch hnsd and does not fork hnsd.

## Why This Project Does Not Modify hnsd Core

Agent identity lookup is an interpretation layer. hnsd should remain focused on
Handshake DNS behavior. Keeping the resolver separate means:

- hnsd remains upstream-compatible.
- agent-aware metadata can evolve independently.
- callers can use hnsd, an hnsd-compatible resolver, or an injected test source.
- no centralized registry or root server is needed.

## Required Behaviors

### 1. Resolve Handshake Names

The resolver uses the source abstraction in `src/upstream`. The default source
uses Node DNS APIs and can be pointed at hnsd or a compatible resolver:

```sh
npm run resolve -- example --server 127.0.0.1:5350
```

The normal DNS portion of the response includes:

- `resolved`
- `address`
- `addresses`
- `recordType`
- `source`
- `records.A`
- `records.AAAA`
- `records.TXT`

### 2. Check SKILL.md

DNS and HTTP are separate steps. After DNS resolution and metadata parsing, the
resolver checks SKILL.md paths in this order:

1. Metadata-declared `skill` path, if present.
2. `/SKILL.md`
3. `/skill.md`
4. `/.well-known/agent/SKILL.md`

Each attempt records:

- `url`
- `path`
- `status`
- `found`
- `error`, when a fetch fails

When SKILL.md is found, the response includes a SHA-256 content hash and parsed
frontmatter or basic heading metadata.

### 3. Return Address, Capabilities, And Protocols

Capabilities may be simple strings:

```json
["search", "resolve"]
```

They are normalized into objects:

```json
[
  {
    "id": "search",
    "name": "search"
  }
]
```

Capabilities may also be richer objects:

```json
{
  "id": "search",
  "name": "Search",
  "description": "Find indexed content",
  "input": "query",
  "output": "results",
  "pricing": "free",
  "auth": "none",
  "endpoint": "https://example.invalid/search"
}
```

Protocols may be simple comma-separated strings:

```text
protocols=mcp,a2a,http
```

They are normalized into protocol objects:

```json
[
  {
    "id": "mcp",
    "name": "mcp"
  }
]
```

Protocols may also include:

- `id`
- `name`
- `version`
- `transport`
- `endpoint`

### 4. Avoid Centralized Registry Or Root Server

The resolver does not use a hardcoded service list. It does not require a
centralized directory or centralized root server. It reads owner-published DNS
records through the configured source.

## Metadata Examples

JSON form:

```text
agent-identity:v1={"version":1,"ready":true,"skill":"/SKILL.md","endpoint":"https://example.invalid","protocols":["mcp","a2a","http"],"capabilities":["search","resolve","verify"]}
```

Compact form:

```text
agent-identity:v1=ready=1;skill=/SKILL.md;protocols=mcp,a2a,http;capabilities=search,resolve,verify;endpoint=https://example.invalid
```

Alternate compact form:

```text
hns-agent=v1; ready=1; skill=/SKILL.md; protocols=mcp,a2a,http; capabilities=search,resolve,verify
```

Supported metadata fields:

- `ready`
- `skill`
- `protocols`
- `capabilities`
- `endpoint`
- `manifestHash`
- `address`
- `description`

## Example Resolver Output

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
    "TXT": []
  },
  "agentReady": true,
  "metadataSource": "TXT",
  "rawMetadata": "agent-identity:v1=ready=1;skill=/SKILL.md;protocols=mcp,a2a,http;capabilities=search,resolve,verify;endpoint=https://example.invalid",
  "metadata": {
    "version": 1,
    "ready": true,
    "skill": "/SKILL.md",
    "endpoint": "https://example.invalid"
  },
  "skill": {
    "checked": true,
    "found": true,
    "canonicalPath": "/SKILL.md",
    "url": "https://example.invalid/SKILL.md",
    "attempts": [],
    "hash": "sha256-hex",
    "metadata": {
      "name": "Example Agent",
      "description": "Example skill"
    }
  },
  "capabilities": [
    {
      "id": "search",
      "name": "search"
    }
  ],
  "protocols": [
    {
      "id": "mcp",
      "name": "mcp"
    }
  ],
  "warnings": []
}
```

## Manual Live Test With hnsd

Normal CI tests use a mock hnsd-compatible source. A live hnsd node is not
required.

To test manually:

1. Run hnsd or an hnsd-compatible resolver locally.
2. Make sure it can answer A, AAAA, and TXT queries for the target name.
3. Publish compatible TXT metadata for the name.
4. Run:

```sh
npm run resolve -- <handshake-name> --server 127.0.0.1:<port>
```

For local HTTP SKILL.md testing, publish metadata with an HTTP endpoint and run a
local HTTP server that serves `/SKILL.md`. Production deployments should prefer
HTTPS. When an address is already resolved, the fetch layer can connect to that
address while preserving the logical hostname for HTTP Host and HTTPS SNI.

## Limitations

- CI tests do not require a live hnsd node.
- HTTPS behavior depends on the remote certificate matching the logical host.
- SKILL.md parsing is intentionally basic: frontmatter key-value lines and a
  first heading fallback.
- Native agent manifest records are not implemented yet.

## Future Standards Proposal

A future Handshake-native agent manifest record could avoid TXT packing limits
and make metadata easier to verify. Until that exists, this resolver uses
versioned TXT metadata and owner-controlled SKILL.md discovery.
