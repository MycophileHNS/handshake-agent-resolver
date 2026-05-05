import {buildLookupNames, normalizeHandshakeName} from './name.js';
import {parseTxtRecords} from './metadata/parse.js';
import {discoverSkillMd} from './skill-fetch.js';
import {DnsHandshakeSource} from './upstream/dns-source.js';

function finalReasonFromAttempts(attempts) {
  const priority = [
    'malformed_records',
    'unsupported_records',
    'lookup_error',
    'no_compatible_records',
    'no_records'
  ];

  for (const reason of priority) {
    if (attempts.some((attempt) => attempt.status === reason))
      return reason;
  }

  return 'no_records';
}

function emptyRecords() {
  return {
    A: [],
    AAAA: [],
    TXT: []
  };
}

function normalizeDnsResult(result, source) {
  const records = {
    ...emptyRecords(),
    ...(result?.records ?? {})
  };
  const addresses = result?.addresses ?? [...records.A, ...records.AAAA];

  return {
    status: result?.status ?? 'no_records',
    resolved: addresses.length > 0,
    addresses,
    address: addresses[0] ?? null,
    recordType: result?.recordType ?? (
      records.A.length > 0 ? 'A' : (records.AAAA.length > 0 ? 'AAAA' : null)
    ),
    records,
    source: result?.source ?? source.sourceInfo?.() ?? {type: 'unknown'},
    errors: result?.errors ?? []
  };
}

async function resolveName(source, name) {
  if (typeof source.resolveName === 'function')
    return normalizeDnsResult(await source.resolveName(name), source);

  const txt = typeof source.resolveTxt === 'function'
    ? await source.resolveTxt(name)
    : {status: 'no_records', records: []};

  const records = {
    ...emptyRecords(),
    TXT: txt.records ?? []
  };

  return normalizeDnsResult({
    status: records.TXT.length > 0 ? 'ok' : 'no_records',
    records,
    errors: txt.status === 'error'
      ? [{code: txt.code, message: txt.message}]
      : []
  }, source);
}

function metadataAttemptFromParsed(lookup, parsed, records) {
  return {
    ...lookup,
    status: records.length > 0 ? parsed.status : 'no_records',
    records,
    ignored: parsed.ignored,
    malformed: parsed.malformed,
    unsupported: parsed.unsupported
  };
}

async function findMetadata(source, normalizedName, dnsResult, lookupLocations) {
  const lookups = buildLookupNames(normalizedName, lookupLocations);
  const attempts = [];

  for (const lookup of lookups) {
    let records;

    if (lookup.queryName === normalizedName) {
      records = dnsResult.records.TXT;
    } else {
      const response = await source.resolveTxt(lookup.queryName);

      if (response.status === 'error') {
        attempts.push({
          ...lookup,
          status: 'lookup_error',
          code: response.code,
          message: response.message
        });
        continue;
      }

      records = response.records ?? [];
    }

    const parsed = parseTxtRecords(records);
    const attempt = metadataAttemptFromParsed(lookup, parsed, records);
    attempts.push(attempt);

    if (parsed.status === 'found') {
      return {
        parsed,
        lookup,
        attempts
      };
    }
  }

  return {
    parsed: null,
    lookup: null,
    attempts
  };
}

function collectWarnings({
  dnsResult,
  metadataResult,
  skill
}) {
  const warnings = [];

  for (const error of dnsResult.errors ?? [])
    warnings.push(`DNS lookup warning: ${error.code ?? 'error'} ${error.message ?? ''}`.trim());

  if (!metadataResult.parsed) {
    warnings.push('No compatible agent metadata found.');
  }

  for (const attempt of metadataResult.attempts) {
    if (attempt.status === 'malformed_records')
      warnings.push(`Malformed agent metadata at ${attempt.queryName}.`);

    if (attempt.status === 'unsupported_records')
      warnings.push(`Unsupported agent metadata at ${attempt.queryName}.`);
  }

  for (const warning of skill.warnings ?? [])
    warnings.push(`SKILL.md warning: ${warning}`);

  if (skill.checked && !skill.found)
    warnings.push('SKILL.md was not found.');

  return warnings;
}

function metadataAddress(metadata) {
  if (!metadata?.address)
    return [];

  return [metadata.address];
}

function skippedSkill(reason) {
  return {
    checked: false,
    found: false,
    status: reason,
    reason,
    canonicalPath: null,
    url: null,
    attempts: [],
    warnings: []
  };
}

export class AgentIdentityResolver {
  constructor(options = {}) {
    this.source = options.source ?? new DnsHandshakeSource(options.dns ?? {});
    this.lookupLocations = options.lookupLocations;
    this.skill = options.skill ?? {};
    this.forceSkillDiscovery = Boolean(
      options.forceSkillDiscovery
      ?? options.checkSkillWithoutMetadata
      ?? this.skill.forceSkillDiscovery
      ?? this.skill.checkSkillWithoutMetadata
    );
  }

  async resolve(name) {
    const normalizedName = normalizeHandshakeName(name);
    const dnsResult = await resolveName(this.source, normalizedName);
    const metadataResult = await findMetadata(
      this.source,
      normalizedName,
      dnsResult,
      this.lookupLocations
    );
    const metadata = metadataResult.parsed?.identity ?? null;
    const metadataFound = Boolean(metadata);
    const addresses = dnsResult.addresses.length > 0
      ? dnsResult.addresses
      : metadataAddress(metadata);
    const shouldDiscoverSkill = metadataFound || this.forceSkillDiscovery;
    const skill = shouldDiscoverSkill
      ? await discoverSkillMd({
        name: normalizedName,
        metadata: metadata ?? {},
        addresses,
        timeoutMs: this.skill.timeoutMs,
        fetcher: this.skill.fetcher,
        defaultScheme: this.skill.defaultScheme
      })
      : skippedSkill('skipped_no_metadata');
    const warnings = collectWarnings({
      dnsResult,
      metadataResult,
      skill
    });
    const agentReady = metadataFound
      ? (metadata.ready ?? true)
      : false;
    const baseResult = {
      name: normalizedName,
      resolved: dnsResult.resolved,
      addresses,
      address: addresses[0] ?? null,
      recordType: dnsResult.recordType,
      source: dnsResult.source,
      records: dnsResult.records,
      agentReady,
      metadataFound,
      metadataSource: metadataFound ? 'TXT' : null,
      rawMetadata: metadataResult.parsed?.record ?? null,
      metadata,
      skill,
      capabilities: metadata?.capabilities ?? [],
      protocols: metadata?.protocols ?? [],
      warnings,
      attempts: metadataResult.attempts,
      status: metadataFound ? 'found' : 'not_found',
      reason: metadataFound ? undefined : finalReasonFromAttempts(metadataResult.attempts)
    };

    if (metadataFound) {
      baseResult.queryName = metadataResult.lookup.queryName;
      baseResult.location = metadataResult.lookup.location;
      baseResult.identity = {
        ...metadata,
        subject: normalizedName
      };
      baseResult.record = metadataResult.parsed.record;
    }

    return baseResult;
  }
}

export async function resolveAgentIdentity(name, options = {}) {
  const resolver = new AgentIdentityResolver(options);
  return resolver.resolve(name);
}
