# Security Hardening Plan

This document outlines a proposed security hardening plan for SKILL.md and external metadata fetching in `handshake-agent-resolver`.

## Goal

Make SKILL.md and external metadata fetching safe by default while keeping the project lightweight and easy to use.

Treat every published agent metadata record as potentially hostile. Possible threats include malicious name owners, compromised owner keys, typosquatting, redirect abuse, oversized responses, and server-side request forgery.

## Threat Model

The resolver may read public TXT metadata and fetch remote files controlled by third parties. Those third parties may be untrusted.

The resolver should assume that remote metadata can be:

- Malicious by design
- Controlled by a compromised key or owner account
- Published by a typo-squatted or confusingly similar name
- Designed to trigger SSRF or internal network access
- Designed to trigger large file denial of service
- Served over HTTP instead of HTTPS
- Changed after initial lookup through DNS rebinding or redirects
- Crafted to exploit parsing behavior

## Current Risks

| Risk | Description | Impact |
| --- | --- | --- |
| Malicious SKILL.md URLs | Name owners can publish URLs that point to hostile content. | Unsafe fetches or misleading metadata. |
| Compromised owner keys | If a name owner key is compromised, metadata can be replaced. | Attackers can redirect resolver behavior. |
| Typosquatting | Similar-looking names can publish convincing metadata. | Users or agents may trust the wrong identity. |
| SSRF | Remote URLs may target local, private, or cloud metadata networks. | Internal services may be exposed. |
| Large file DoS | Remote files may be very large or stream indefinitely. | Memory, bandwidth, or CPU exhaustion. |
| Redirect attacks | A safe-looking URL may redirect to unsafe destinations. | Security checks can be bypassed. |
| HTTP fetches | Plain HTTP may be intercepted or modified. | Integrity and privacy risks. |
| DNS rebinding | Hostnames may resolve to different IPs after validation. | IP allow rules can be bypassed. |
| Parser exposure | Fetched content may be malformed or hostile. | Parser bugs may become security issues. |

## Prioritized Security Features

### Phase 1: Quick Wins

High-impact, low-effort improvements.

- [ ] Add a `secure: true` option.
  - Default may remain `false` for backward compatibility.
  - Documentation should recommend `secure: true` for production use.
- [ ] Create `createSecureFetcher()` in `src/skill-fetch.js`.
- [ ] Force HTTPS-only fetches unless HTTP is explicitly allowed.
- [ ] Add IP pinning so fetches only use IPs resolved from the Handshake name or an explicit allow list.
- [ ] Add a strict Content-Type allow list:
  - `text/markdown`
  - `text/plain`
  - `application/json`
- [ ] Enforce response size limits with early abort.
- [ ] Enforce modern TLS and timeout behavior.
- [ ] Send a clear User-Agent and strict request headers.
- [ ] Add a security configuration object to the `AgentIdentityResolver` constructor.
- [ ] Show a clear warning when `--force-skill-discovery` is used without secure mode.
- [ ] Document best practices, Docker examples, and the threat model in this file.

### Phase 2: Stronger Defenses

Deeper defenses for production deployments.

- [ ] Add optional cryptographic signature verification for SKILL.md.
- [ ] Add rate limiting for the HTTP server endpoint.
- [ ] Consider sandboxed parsing of SKILL.md.
- [ ] Add detailed audit logging mode.
- [ ] Log what was fetched, final URL, content hash, resolved IP, response size, and warnings.
- [ ] Document Node `--experimental-permission` friendly runtime flags.

### Phase 3: Documentation and Examples

Make secure use easy to discover.

- [ ] Update `README.md` with a Security section.
- [ ] Add a production-oriented secure run example.
- [ ] Add Docker examples using non-root users, read-only filesystems, and reduced capabilities.
- [ ] Update `docs/manual-install-usage.md` and `docs/developer.md` with secure-mode guidance.
- [ ] Add a repository-level `SECURITY.md` policy file.

## Proposed Secure Configuration

```js
new AgentIdentityResolver({
  skill: {
    secure: true,
    timeoutMs: 8000,
    maxBytes: 1024 * 1024,
    allowHttp: false,
    ipAllowList: 'auto',
    requireSignature: false
  }
});
```

## Proposed Secure Fetcher Behavior

`createSecureFetcher()` should enforce a conservative fetch policy when secure mode is enabled.

| Control | Recommended Behavior |
| --- | --- |
| Scheme | Reject HTTP by default. Allow HTTPS only unless `allowHttp: true` is explicitly set. |
| Redirects | Re-check every redirected URL before following it. |
| IP pinning | Resolve once, pin the allowed IPs, and reject connections outside the pinned set. |
| Private networks | Reject loopback, link-local, multicast, private, and cloud metadata IP ranges unless explicitly allowed. |
| Content-Type | Accept only markdown, plain text, or JSON content types. |
| Size limit | Abort reads once `maxBytes` is exceeded. |
| Timeout | Enforce connect and read timeouts. |
| Headers | Use a project User-Agent and avoid sending credentials or cookies. |
| Logging | Record fetch URL, final URL, status, size, hash, IP, and warnings when audit logging is enabled. |

## CLI and Server Guidance

Secure mode should be easy to enable from the CLI and HTTP server.

Possible future CLI examples:

```sh
npm run resolve -- alice --server 127.0.0.1:5350 --secure
```

```sh
npm run serve -- --port 8787 --server 127.0.0.1:5350 --secure
```

When `--force-skill-discovery` is used without secure mode, the CLI and server should warn clearly that exploratory fetching can contact untrusted URLs.

## Hardened Docker Run Example

```sh
docker run --rm --read-only --network=bridge \
  --cap-drop=ALL --user node \
  your-image npm run serve
```

For production, also consider:

- Running behind a reverse proxy with rate limiting
- Restricting egress where possible
- Setting CPU and memory limits
- Running as a non-root user
- Mounting only required filesystems
- Avoiding host network mode

## Acceptance Criteria

A security hardening implementation should meet these criteria:

- [ ] Secure mode rejects HTTP by default.
- [ ] Secure mode rejects non-pinned IPs.
- [ ] Secure mode rejects private, local, link-local, multicast, and metadata service IP ranges by default.
- [ ] Existing behavior remains unchanged when `secure: false`.
- [ ] Response size limits are enforced with early abort.
- [ ] Fetch timeouts are tested.
- [ ] Redirect safety is tested.
- [ ] Content-Type filtering is tested.
- [ ] CLI warning behavior is tested.
- [ ] Documentation explains risks, secure mode, and production recommendations.

## Notes

This plan is intentionally incremental. Phase 1 should make the resolver safer for real agentic use without adding heavy dependencies or changing existing default behavior. Later phases can add stronger verification, audit logging, and production deployment guidance.
