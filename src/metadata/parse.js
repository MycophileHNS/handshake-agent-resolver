import {
  HNS_AGENT_PREFIX_RE,
  MAX_TXT_VALUE_LENGTH,
  METADATA_PREFIX,
  METADATA_PREFIX_RE
} from '../constants.js';
import {validateAgentIdentityMetadata} from './schema.js';

function joinTxtRecord(record) {
  if (Array.isArray(record))
    return record.join('');

  if (typeof record === 'string')
    return record;

  return '';
}

function parseKeyValuePayload(payload, base = {}) {
  const metadata = {
    ...base
  };

  for (const segment of payload.split(';')) {
    const trimmed = segment.trim();

    if (!trimmed)
      continue;

    const index = trimmed.indexOf('=');

    if (index === -1)
      continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();

    if (!key || key === 'hns-agent')
      continue;

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

  if (!trimmed)
    throw new Error('metadata payload is empty');

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('metadata JSON must be an object');

    return parsed;
  }

  return parseKeyValuePayload(trimmed, {
    version: 1
  });
}

function parseMetadataValue(value) {
  if (value.length > MAX_TXT_VALUE_LENGTH) {
    return {
      status: 'malformed',
      message: 'metadata TXT value is too long',
      record: value
    };
  }

  const hnsAgentMatch = value.match(HNS_AGENT_PREFIX_RE);

  if (hnsAgentMatch) {
    if (hnsAgentMatch[1] !== '1') {
      return {
        status: 'unsupported',
        message: `unsupported hns-agent metadata version: ${hnsAgentMatch[1]}`,
        record: value
      };
    }

    const metadata = parseKeyValuePayload(value, {
      version: 1
    });
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

  for (const record of records ?? []) {
    const value = joinTxtRecord(record);
    const parsed = parseMetadataValue(value);

    if (parsed.status === 'found') {
      return {
        ...result,
        status: 'found',
        identity: parsed.identity,
        record: parsed.record
      };
    }

    if (parsed.status === 'malformed')
      result.malformed.push(parsed);
    else if (parsed.status === 'unsupported')
      result.unsupported.push(parsed);
    else
      result.ignored.push(parsed.record);
  }

  if (result.malformed.length > 0)
    result.status = 'malformed_records';
  else if (result.unsupported.length > 0)
    result.status = 'unsupported_records';

  return result;
}
