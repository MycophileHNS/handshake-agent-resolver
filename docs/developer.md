# Developer Guide

This resolver is a standalone Node module and small service. It uses only Node
built-in APIs so the first implementation stays easy to inspect and maintain.

## Requirements

- Node.js 18 or newer.
- A Handshake-aware DNS upstream for live lookups.
- No package install is required for the current dependency-free code.

## Commands

Run all tests:

```sh
npm test
```

Resolve one name with the default system DNS configuration:

```sh
npm run resolve -- alice
```

Resolve one name through a specific DNS server:

```sh
npm run resolve -- alice --server 127.0.0.1:5350
```

Start the HTTP service:

```sh
npm run serve -- --port 8787 --server 127.0.0.1:5350
```

Query the HTTP service:

```sh
curl 'http://127.0.0.1:8787/resolve?name=alice'
```

## Code Map

- `src/resolver.js`: main lookup orchestration.
- `src/name.js`: name normalization and lookup-name construction.
- `src/metadata/parse.js`: TXT record parsing.
- `src/metadata/schema.js`: identity metadata validation.
- `src/skill-paths.js`: SKILL.md discovery candidate construction.
- `src/skill-fetch.js`: timeout-aware HTTP/HTTPS SKILL.md fetching.
- `src/skill-parse.js`: frontmatter and basic SKILL.md metadata parsing.
- `src/upstream/dns-source.js`: live DNS A, AAAA, and TXT lookup source.
- `src/upstream/mock-source.js`: deterministic source for tests.
- `src/cli.js`: command-line wrapper.
- `src/server.js`: HTTP wrapper.

## Extending Lookup Sources

The resolver talks to an upstream source through one method:

```js
async resolveTxt(name) {
  return {
    status: 'ok',
    records: [['agent-identity:v1=...']]
  };
}
```

A source can return TXT records and can also implement `resolveName(name)` to
return A, AAAA, and TXT records together.

`resolveName(name)` returns:

```js
{
  resolved: true,
  addresses: ['192.0.2.10'],
  address: '192.0.2.10',
  recordType: 'A',
  records: {
    A: ['192.0.2.10'],
    AAAA: [],
    TXT: [['agent-identity:v1=...']]
  }
}
```

A TXT-only source can return:

- `ok`: TXT records were found.
- `no_records`: no TXT records were found.
- `error`: lookup failed for a reason other than an ordinary missing record.

This keeps the resolver independent from any specific resolver daemon. A future
source can use DNS, a local service, proof data, or another Handshake-aware
adapter without changing metadata parsing.

## SKILL.md Fetching

DNS resolution and HTTP fetching are separate modules. `src/resolver.js` resolves
the name first, then `src/skill-fetch.js` checks SKILL.md paths. The fetcher has a
timeout and can be injected in tests.

When an address is available, the HTTP layer connects to that address while
preserving the logical hostname in the Host header and HTTPS SNI.

## Extending Metadata

Add support for a new metadata version by changing the parser and schema
together:

1. Add a new prefix or version handler in `src/metadata/parse.js`.
2. Add validation rules in `src/metadata/schema.js`.
3. Add tests for valid, malformed, and unsupported records.
4. Update `docs/metadata.md`.

Older versions should keep returning the same normalized fields so callers can
rely on stable resolver output.

## Reference Boundary

Do not edit `reference/hnsd-reference`. The tests include a guard that checks
the reference tree has no tracked modifications. hnsd is present so we can study
Handshake DNS behavior, not so this project can patch it.
