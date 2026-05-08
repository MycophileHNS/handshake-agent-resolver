# Handshake Agent-Aware Resolver

This project provides a separate resolver layer for Handshake names that publish
compatible agent identity metadata.

It is designed for the agentic web: a Handshake name can act as a persistent
identity anchor for an agent, service, tool, or endpoint. The resolver does not
assume a specific namespace. Any Handshake name can participate when its owner
publishes compatible records.

## What It Does

- Looks up TXT records for a requested Handshake name.
- Searches configurable metadata locations, starting with the name itself.
- Parses versioned `agent-identity:v1=` records.
- Returns a normalized identity object when compatible metadata is found.
- Runs independently from hnsd.

## What It Does Not Do

- It does not modify hnsd.
- It does not edit or depend on files inside `reference/hnsd-reference`.
- It does not hardcode a suffix or namespace.
- It does not treat any one Handshake name pattern as special.

## Metadata Format

Publish a TXT record at the Handshake name apex, `_agent.<name>`, or another
configured lookup location:

```text
agent-identity:v1={"version":1,"endpoint":"https://example.test/agent.json","capabilities":["lookup"]}
```

The resolver accepts segmented TXT records and joins the segments before parsing.

## Run

```sh
npm run resolve -- alice
```

Use a specific Handshake-aware DNS server:

```sh
npm run resolve -- alice --server 127.0.0.1:5350
```

Run the HTTP service:

```sh
npm run serve -- --port 8787
curl 'http://127.0.0.1:8787/resolve?name=alice'
```

## Test

```sh
npm test
```

## Documentation

- [Developer Guide](docs/developer.md)
- [Architecture Note](docs/architecture.md)
- [Metadata Format](docs/metadata.md)
- [Agent-Aware Resolver](docs/agent-aware-resolver.md)
- - [Beginner Guide: Publishing Agent Identity TXT Records](./docs/beginner-guide.md)
