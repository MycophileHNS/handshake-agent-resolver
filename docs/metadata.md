# Agent Identity Metadata

Compatible metadata is published in TXT records. The resolver recognizes version
1 records with this prefix:

```text
agent-identity:v1=
```

The value after the prefix must be JSON.
It may also use the compact key-value form described below.

## Example

```text
agent-identity:v1={"version":1,"name":"Example Agent","endpoint":"https://example.test/agent.json","capabilities":["lookup","describe"]}
```

Compact form:

```text
agent-identity:v1=ready=1;skill=/SKILL.md;protocols=mcp,a2a,http;capabilities=lookup,describe;endpoint=https://example.test
```

Alternate compact form:

```text
hns-agent=v1; ready=1; skill=/SKILL.md; protocols=mcp,a2a,http; capabilities=lookup,describe
```

The same value may be split across TXT segments. The resolver joins all segments
from one TXT record before parsing.

## Fields

Required:

- `version`: must be `1`.

At least one identity field must also be present:

- `id`
- `did`
- `name`
- `publicKey`
- `service`
- `endpoint`
- `description`
- `capabilities`
- `protocols`
- `skill`
- `endpoint`
- `manifestHash`
- `address`

Optional:

- `extra`: object for extension data.

## Lookup Locations

The default lookup order is:

1. `<name>`
2. `_agent.<name>`
3. `_agent-identity.<name>`

This order provides simple fallback behavior. For example, if the apex record is
missing or malformed, the resolver can still find compatible metadata under
`_agent.<name>`.

## Result Shape

Found:

```json
{
  "status": "found",
  "name": "alice",
  "queryName": "_agent.alice",
  "location": "_agent",
  "identity": {
    "version": 1,
    "subject": "alice",
    "endpoint": "https://example.test/agent.json"
  }
}
```

Not found:

```json
{
  "status": "not_found",
  "reason": "no_records",
  "name": "alice",
  "attempts": []
}
```

Possible `reason` values:

- `no_records`
- `no_compatible_records`
- `malformed_records`
- `unsupported_records`
- `lookup_error`

## Notes For Publishers

Use this metadata to describe a persistent identity or service endpoint. Keep
records small, versioned, and specific. Avoid putting secrets in TXT records.
