# Beginner Guide: Publishing Agent Identity TXT Records

This guide explains how to publish agent identity metadata for a Handshake name using DNS TXT records.

The **Handshake Agent-Aware Resolver** looks for compatible TXT records and turns them into a normalized agent identity result. Any Handshake name can participate. There is no special namespace, suffix, registry, or centralized root server required.

## What You Are Publishing

You are publishing a TXT record that starts with one of these prefixes:

```text
agent-identity:v1=
```

or the alternate compact prefix:

```text
hns-agent=v1;
```

Everything after the prefix describes the agent, service, tool, or endpoint connected to the Handshake name.

### JSON Format (Recommended for Beginners)

```text
agent-identity:v1={"version":1,"name":"Example Agent","endpoint":"https://example.test/agent.json","capabilities":["lookup","describe"]}
```

### Compact Format (Shorter)

```text
agent-identity:v1=ready=1;skill=/SKILL.md;capabilities=lookup,describe;endpoint=https://myagent.example
```

or using the alternate prefix:

```text
hns-agent=v1;ready=1;skill=/SKILL.md;capabilities=lookup,describe;endpoint=https://myagent.example
```

The resolver reads the TXT record, parses the metadata, and returns it as part of the resolver output.

## What Is a TXT Record?

A TXT record is a DNS record that stores text. In this project, TXT records publish agent identity metadata directly in the Handshake name owner’s DNS records.

On-chain / in the resource JSON it looks like this:

```json
{
  "type": "TXT",
  "text": [
    "agent-identity:v1={\"version\":1,\"name\":\"My Agent\",\"endpoint\":\"https://myagent.example\"}"
  ]
}
```

The important part is the **text value** that starts with the prefix.

## Recommended Fields

- `version`: must be `1`
- `name`: human-readable name for the agent/service
- `endpoint`: URL for the agent, manifest, or service
- `capabilities`: array of supported capabilities (strings or rich objects)
- `ready`: optional boolean (defaults to `true` if metadata exists)
- `skill`: path to a richer capability description (e.g. `/SKILL.md`)

**Starter record (copy-paste):**

```text
agent-identity:v1={"version":1,"name":"My Cool Agent","endpoint":"https://myagent.example","capabilities":["chat","search","tools"]}
```

## Where To Publish the TXT Record

The resolver checks these locations **in order**:

1. The name itself (apex/root)
2. `_agent.<name>`
3. `_agent-identity.<name>`

For a name like `alice`:

- `alice`
- `_agent.alice`
- `_agent-identity.alice`

You only need to publish in **one** of these locations.

**Recommendation**:
- Use the apex if the name is dedicated to the agent.
- Use `_agent` if you want to keep the root clean for website/DNS records.

## Publishing With Bob Wallet (Recommended for Most Users)

1. Open Bob Wallet and wait for sync.
2. Go to your domain/name manager.
3. Select your Handshake name.
4. Open the DNS record editor.
5. Add a new **TXT** record:
   - **Type**: TXT
   - **Host**: (leave blank for apex) or `_agent`
   - **Value**: `agent-identity:v1={"version":1,"name":"My Cool Agent","endpoint":"https://myagent.example","capabilities":["chat","search","tools"]}`
6. Review → Confirm transaction (small HNS fee required).
7. Wait for propagation.

## Publishing With hsd / handshake-cli or Other Tools

Any tool that lets you add custom TXT records works. Use the same prefix and value as above.

## Testing the Record

After publishing:

```sh
npm run resolve -- yourname
```

With a specific server:

```sh
npm run resolve -- yourname --server 127.0.0.1:5350
```

**Expected output when successful** includes:
- `metadataFound: true`
- `agentReady: true` (true by default unless you explicitly set `ready=0` or `ready=false`)
- Parsed metadata
- Normalized capabilities
- SKILL.md discovery results (when applicable)

## SKILL.md Support (Recommended for Rich Descriptions)

Add a `skill` field to point to a detailed capability file:

```text
agent-identity:v1=ready=1;skill=/SKILL.md;capabilities=lookup,describe;endpoint=https://myagent.example
```

The resolver checks these paths (in order) when metadata is found:
- The path declared in `skill`
- `/SKILL.md`
- `/skill.md`
- `/.well-known/agent/SKILL.md`

Use SKILL.md when the TXT record is too small for full tool descriptions, protocols, examples, etc.

## Practical Tips

**Do**:
- Keep TXT values reasonably short (~400 characters or less is best).
- Always include `endpoint` and `capabilities`.
- Use `_agent` subname when the root has other records.
- Version with `version: 1`.

**Avoid**:
- Secrets, API keys, or private credentials (TXT records are public).
- Trailing commas in JSON.
- Overly large records (move details to SKILL.md instead).

## Troubleshooting

**Record not found**  
→ Verify the prefix exactly matches `agent-identity:v1=` (or `hns-agent=v1;`).  
→ Confirm it’s published at one of the three supported locations.

**Parsed but invalid**  
→ JSON must be valid (no trailing commas, proper quotes, etc.).

**Record too long**  
→ Switch to compact format or move content to SKILL.md.

**Want to keep root clean**  
→ Publish under `_agent.<name>`.

## Summary

To make your Handshake name discoverable as an agent identity:

1. Own a Handshake name.
2. Add a TXT record starting with `agent-identity:v1=` (or `hns-agent=v1;`).
3. Include at least `version`, and useful fields like `name`, `endpoint`, and `capabilities`.
4. Publish at apex, `_agent`, or `_agent-identity`.
5. Test with `npm run resolve`.

Your Handshake name now becomes a persistent, decentralized anchor for your agent on the agentic web.
