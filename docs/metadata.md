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

## HeadlessProfile Bridge

The resolver also supports the HeadlessProfile TXT prefix standard created by
[HeadlessDomains.com](https://headlessdomains.com/). These records are flat DNS
profile fields that can be published alongside, or instead of, the versioned
`agent-identity:v1=` envelope.

When no versioned `agent-identity:v1=` or `hns-agent=v1` record is found, the
resolver aggregates compatible HeadlessProfile records and maps them into the
same normalized metadata shape:

| HeadlessProfile TXT record | Normalized metadata field |
| --- | --- |
| `agent-manifest:<url>` | `metadata.endpoint` |
| `manifest:<url>` | `metadata.endpoint` |
| `skill-md:<url>` | `metadata.skill` |
| `skill:<url>` | `metadata.skill` |
| `agent-capabilities:<comma-separated-list>` | `metadata.capabilities` |
| `arp:<url>` | `metadata.protocols += ["arp"]` |

The bridge accepts either `:` or `=` as the delimiter so DNS panels may publish
records such as `agent-manifest:https://example.test/agent.json` or
`agent-manifest=https://example.test/agent.json`.

Repeated `agent-capabilities` records are accumulated and deduplicated while
preserving first-seen order. This lets publishers split capabilities across
multiple TXT records without losing earlier values.

Example HeadlessProfile bridge records:

```text
agent-manifest:https://example.test/agent.json
skill-md:https://example.test/SKILL.md
agent-capabilities:lookup,describe
agent-capabilities:search,lookup
arp:https://chat.example.test
```

These records resolve to normalized metadata equivalent to:

```json
{
  "version": 1,
  "endpoint": "https://example.test/agent.json",
  "skill": "https://example.test/SKILL.md",
  "capabilities": [
    {"id": "lookup", "name": "lookup"},
    {"id": "describe", "name": "describe"},
    {"id": "search", "name": "search"}
  ],
  "protocols": [
    {"id": "arp", "name": "arp"}
  ]
}
```

Versioned metadata takes precedence. If a compatible `agent-identity:v1=` or
`hns-agent=v1` record is present, the resolver returns that record and does not
merge it with HeadlessProfile bridge records.

Malformed or unsupported versioned records also prevent bridge fallback. This
keeps broken primary metadata visible instead of letting valid HeadlessProfile
records hide the error.

Unrelated TXT records are ignored for bridge fallback, including unrelated
records that exceed agent metadata limits. When bridge fallback succeeds,
HeadlessProfile records used by the bridge are removed from the `ignored`
diagnostics, while unrelated TXT records remain ignored.

If any HeadlessProfile bridge record is malformed, the resolver continues
scanning the full TXT set before returning `malformed_records`. This keeps
diagnostics stable when DNS TXT order varies: every HeadlessProfile bridge record
is included in the malformed diagnostic, and bridge records are removed from
`ignored` while unrelated TXT records remain there.

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
