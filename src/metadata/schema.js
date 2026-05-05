import {
  IDENTITY_VERSION,
  MAX_CAPABILITY_COUNT,
  MAX_PROTOCOL_COUNT,
  MAX_STRING_FIELD_LENGTH
} from '../constants.js';

const OPTIONAL_STRING_FIELDS = [
  'id',
  'did',
  'name',
  'publicKey',
  'service',
  'endpoint',
  'description',
  'manifestHash',
  'address',
  'skill'
];

const CAPABILITY_STRING_FIELDS = [
  'id',
  'name',
  'description',
  'input',
  'output',
  'pricing',
  'auth',
  'endpoint'
];

const PROTOCOL_STRING_FIELDS = [
  'id',
  'name',
  'version',
  'transport',
  'endpoint'
];

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function validateStringField(value, field, errors) {
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return false;
  }

  if (!value.trim()) {
    errors.push(`${field} must not be empty`);
    return false;
  }

  if (value.length > MAX_STRING_FIELD_LENGTH) {
    errors.push(`${field} is too long`);
    return false;
  }

  return true;
}

function splitCommaList(value) {
  if (typeof value !== 'string')
    return value;

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSimpleObject(item, fields, kind, errors) {
  const normalized = {};

  for (const field of fields) {
    if (item[field] == null)
      continue;

    if (validateStringField(item[field], `${kind}.${field}`, errors))
      normalized[field] = item[field].trim();
  }

  const idSource = normalized.id ?? normalized.name;

  if (!idSource) {
    errors.push(`${kind} must include id or name`);
    return null;
  }

  normalized.id = normalized.id ?? normalized.name;
  normalized.name = normalized.name ?? normalized.id;

  return normalized;
}

export function normalizeCapabilities(value, errors = []) {
  if (value == null)
    return [];

  const list = splitCommaList(value);

  if (!Array.isArray(list)) {
    errors.push('capabilities must be an array or comma-separated string');
    return [];
  }

  if (list.length > MAX_CAPABILITY_COUNT)
    errors.push('capabilities has too many entries');

  const capabilities = [];

  for (const capability of list) {
    if (typeof capability === 'string') {
      if (!validateStringField(capability, 'capability', errors))
        continue;

      const id = capability.trim();
      capabilities.push({
        id,
        name: id
      });
      continue;
    }

    if (!isObject(capability)) {
      errors.push('capabilities must contain strings or objects');
      continue;
    }

    const normalized = normalizeSimpleObject(
      capability,
      CAPABILITY_STRING_FIELDS,
      'capability',
      errors
    );

    if (normalized)
      capabilities.push(normalized);
  }

  return capabilities;
}

export function normalizeProtocols(value, errors = []) {
  if (value == null)
    return [];

  const list = splitCommaList(value);

  if (!Array.isArray(list)) {
    errors.push('protocols must be an array or comma-separated string');
    return [];
  }

  if (list.length > MAX_PROTOCOL_COUNT)
    errors.push('protocols has too many entries');

  const protocols = [];

  for (const protocol of list) {
    if (typeof protocol === 'string') {
      if (!validateStringField(protocol, 'protocol', errors))
        continue;

      const id = protocol.trim();
      protocols.push({
        id,
        name: id
      });
      continue;
    }

    if (!isObject(protocol)) {
      errors.push('protocols must contain strings or objects');
      continue;
    }

    const normalized = normalizeSimpleObject(
      protocol,
      PROTOCOL_STRING_FIELDS,
      'protocol',
      errors
    );

    if (normalized)
      protocols.push(normalized);
  }

  return protocols;
}

function normalizeBoolean(value, field, errors) {
  if (value == null)
    return undefined;

  if (typeof value === 'boolean')
    return value;

  if (typeof value === 'number')
    return value !== 0;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'ready'].includes(normalized))
      return true;

    if (['0', 'false', 'no', 'not-ready'].includes(normalized))
      return false;
  }

  errors.push(`${field} must be a boolean-like value`);
  return undefined;
}

export function validateAgentIdentityMetadata(value) {
  const errors = [];

  if (!isObject(value)) {
    return {
      ok: false,
      errors: ['metadata must be a JSON object']
    };
  }

  const version = value.version ?? value.v;

  if (version !== IDENTITY_VERSION && version !== String(IDENTITY_VERSION))
    errors.push('version must be 1');

  const identity = {
    version: IDENTITY_VERSION
  };

  const ready = normalizeBoolean(value.ready, 'ready', errors);

  if (ready != null)
    identity.ready = ready;

  for (const field of OPTIONAL_STRING_FIELDS) {
    const sourceField = field === 'skill'
      ? (value.skill ?? value.skillPath)
      : value[field];

    if (sourceField == null)
      continue;

    if (validateStringField(sourceField, field, errors))
      identity[field] = sourceField.trim();
  }

  const capabilities = normalizeCapabilities(value.capabilities, errors);

  if (capabilities.length > 0)
    identity.capabilities = capabilities;

  const protocols = normalizeProtocols(value.protocols ?? value.protocol, errors);

  if (protocols.length > 0)
    identity.protocols = protocols;

  const hasIdentitySignal = OPTIONAL_STRING_FIELDS.some((field) => identity[field])
    || identity.ready != null
    || capabilities.length > 0
    || protocols.length > 0;

  if (!hasIdentitySignal)
    errors.push('metadata must include at least one identity field');

  if (value.extra != null) {
    if (!isObject(value.extra)) {
      errors.push('extra must be an object when provided');
    } else {
      identity.extra = value.extra;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    identity
  };
}
