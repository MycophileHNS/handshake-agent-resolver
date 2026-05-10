import {
  HNS_AGENT_PREFIX_RE,
  MAX_TXT_VALUE_LENGTH,
  METADATA_PREFIX,
  METADATA_PREFIX_RE
} from '../constants.js';
import {validateAgentIdentityMetadata} from './schema.js';

const HEADLESS_PROFILE_FIELDS = new Set([
  'agent-manifest',
  'manifest',
  'skill-md',
  'skill',
  'agent-capabilities',
  'arp'
]);

function joinTxtRecord(record) {
  if (Array.isArray(record)) return record.join('');
  if (typeof record === 'string') return record;
  return '';
}

function parseKeyValuePayload(payload, base = {}) {
  const metadata = {...base};

  for (const segment of payload.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!key || key === 'hns-agent') continue;

    if (key === 'protocol' || key === 'protocols') {
      metadata.protocols = value;
      continue;
    }

    if (key === 'capability' || key === 'capabilities') {
      metadata.capabilities = value;
      continue;
    }

    if (key === 'skill' || key === 'skillPath') {
      metadata.skill = value;
      continue;
    }

    metadata[key] = value;
  }

  return metadata;
}

function parseAgentIdentityPayload(payload) {
  const trimmed = payload.trim();
  if (!trimmed) throw new Error('metadata payload is empty');

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('metadata JSON must be an object');
    return parsed;
  }

  return parseKeyValuePayload(trimmed, {version: 1});
}

function firstDelimiterIndex(value) {
  const colonIndex = value.indexOf(':');
  const equalsIndex = value.indexOf('=');
  if (colonIndex === -1) return equalsIndex;
  if (equalsIndex === -1) return colonIndex;
  return Math.min(colonIndex, equalsIndex);
}

function getHeadlessProfileKey(value) {
  const index = firstDelimiterIndex(value);
  if (index === -1) return null;

  const key = value.slice(0, index).trim().toLowerCase();
  return HEADLESS_PROFILE_FIELDS.has(key) ? key : null;
}

function splitCommaListValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function appendUniqueListValue(existing, value) {
  const current = splitCommaListValue(existing);
  if (!current.includes(value)) current.push(value);
  return current;
}

function appendUniqueListValues(existing, value) {
  const current = splitCommaListValue(existing);
  for (const item of splitCommaListValue(value)) {
    if (!current.includes(item)) current.push(item);
  }
  return current;
}

function applyHeadlessProfileRecord(value, metadata) {
  const index = firstDelimiterIndex(value);
  if (index === -1) return false;

  const key = value.slice(0, index).trim().toLowerCase();
  const recordValue = value.slice(index + 1).trim();
  if (!HEADLESS_PROFILE_FIELDS.has(key) || !recordValue) return false;

  if (key === 'agent-manifest' || key === 'manifest') {
    metadata.endpoint = recordValue;
    return true;
  }

  if (key === 'skill-md' || key === 'skill') {
    metadata.skill = recordValue;
    return true;
  }

  if (key === 'agent-capabilities') {
    metadata.capabilities = appendUniqueListValues(metadata.capabilities, recordValue);
    return true;
  }

  if (key === 'arp') {
    metadata.protocols = appendUniqueListValue(metadata.protocols, 'arp');
    return true;
  }

  return false;
}

function parseHeadlessProfileRecords(values) {
  const metadata = {version: 1};
  const records = [];

  for (const value of values) {
    const headlessProfileKey = getHeadlessProfileKey(value);
    if (!headlessProfileKey) continue;

    if (value.length > MAX_TXT_VALUE_LENGTH) {
      return {
        status: 'malformed',
        message: 'HeadlessProfile TXT value is too long',
        records
      };
    }

    if (applyHeadlessProfileRecord(value, metadata)) records.push(value);
  }

  if (records.length === 0) return null;

  const validation = validateAgentIdentityMetadata(metadata);
  if (!validation.ok) {
    return {
      status: 'malformed',
      message: validation.errors.join('; '),
      records
    };
  }

  return {
    status: 'found',
    identity: validation.identity,
    record: records.join('\n')
  };
}

function parseMetadataValue(value) {
  const hnsAgentMatch = value.match(HNS_AGENT_PREFIX_RE);

  if (hnsAgentMatch) {
    if (hnsAgentMatch[1] !== '1') {
      return {
        status: 'unsupported',
        message: `unsupported hns-agent metadata version: ${hnsAgentMatch[1]}`,
        record: value
      };
    }

    if (value.length > MAX_TXT_VALUE_LENGTH) {
      return {
        status: 'malformed',
        message: 'metadata TXT value is too long',
        record: value
      };
    }

    const metadata = parseKeyValuePayload(value, {version: 1});
    const validation = validateAgentIdentityMetadata(metadata);
    if (!validation.ok) {
      return {
        status: 'malformed',
        message: validation.errors.join('; '),
        record: value
      };
    }

    return {
      status: 'found',
      identity: validation.identity,
      record: value
    };
  }

  if (!value.startsWith(METADATA_PREFIX)) {
    const versionMatch = value.match(METADATA_PREFIX_RE);
    if (versionMatch) {
      return {
        status: 'unsupported',
        message: `unsupported agent identity metadata version: ${versionMatch[1]}`,
        record: value
      };
    }

    return {
      status: 'ignored',
      record: value
    };
  }

  if (value.length > MAX_TXT_VALUE_LENGTH) {
    return {
      status: 'malformed',
      message: 'metadata TXT value is too long',
      record: value
    };
  }

  const payload = value.slice(METADATA_PREFIX.length);
  let parsed;

  try {
    parsed = parseAgentIdentityPayload(payload);
  } catch (error) {
    return {
      status: 'malformed',
      message: `metadata could not be parsed: ${error.message}`,
      record: value
    };
  }

  const validation = validateAgentIdentityMetadata(parsed);
  if (!validation.ok) {
    return {
      status: 'malformed',
      message: validation.errors.join('; '),
      record: value
    };
  }

  return {
    status: 'found',
    identity: validation.identity,
    record: value
  };
}

export function parseTxtRecords(records) {
  const result = {
    status: 'no_compatible_records',
    identity: null,
    record: null,
    ignored: [],
    malformed: [],
    unsupported: []
  };
  const values = [];

  for (const record of records ?? []) {
    const value = joinTxtRecord(record);
    values.push(value);
    const parsed = parseMetadataValue(value);

    if (parsed.status === 'found') {
      return {
        ...result,
        status: 'found',
        identity: parsed.identity,
        record: parsed.record
      };
    }

    if (parsed.status === 'malformed') result.malformed.push(parsed);
    else if (parsed.status === 'unsupported') result.unsupported.push(parsed);
    else result.ignored.push(parsed.record);
  }

  if (result.malformed.length === 0 && result.unsupported.length === 0) {
    const headlessProfile = parseHeadlessProfileRecords(values);

    if (headlessProfile?.status === 'found') {
      return {
        ...result,
        status: 'found',
        identity: headlessProfile.identity,
        record: headlessProfile.record
      };
    }

    if (headlessProfile?.status === 'malformed') {
      result.malformed.push({
        status: 'malformed',
        message: headlessProfile.message,
        record: headlessProfile.records.join('\n')
      });
    }
  }

  if (result.malformed.length > 0) result.status = 'malformed_records';
  else if (result.unsupported.length > 0) result.status = 'unsupported_records';

  return result;
}
