import {DEFAULT_LOOKUP_LOCATIONS} from './constants.js';

const HANDSHAKE_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const LOOKUP_LABEL_RE = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?$/;

export function normalizeHandshakeName(input) {
  if (typeof input !== 'string')
    throw new TypeError('name must be a string');

  let name = input.trim();

  if (!name)
    throw new Error('name is required');

  if (name.endsWith('.'))
    name = name.slice(0, -1);

  name = name.toLowerCase();

  const labels = name.split('.');

  if (labels.some((label) => label.length === 0))
    throw new Error('name contains an empty label');

  if (name.length > 253)
    throw new Error('name is too long');

  for (const label of labels) {
    if (label.length > 63)
      throw new Error(`label is too long: ${label}`);

    if (!HANDSHAKE_LABEL_RE.test(label))
      throw new Error(`label is not a valid DNS label: ${label}`);
  }

  return name;
}

function validateLookupName(name) {
  if (name.length > 253)
    throw new Error('lookup name is too long');

  const labels = name.split('.');

  if (labels.some((label) => label.length === 0))
    throw new Error('lookup name contains an empty label');

  for (const label of labels) {
    if (label.length > 63)
      throw new Error(`lookup label is too long: ${label}`);

    if (!LOOKUP_LABEL_RE.test(label))
      throw new Error(`lookup label is not valid: ${label}`);
  }
}

export function buildLookupNames(input, locations = DEFAULT_LOOKUP_LOCATIONS) {
  const name = normalizeHandshakeName(input);
  const seen = new Set();
  const lookupNames = [];

  for (const location of locations) {
    if (typeof location !== 'string' || !location.trim())
      throw new Error('lookup locations must be non-empty strings');

    const trimmed = location.trim().toLowerCase();
    const queryName = trimmed === '@'
      ? name
      : `${trimmed}.${name}`;

    validateLookupName(queryName);

    if (!seen.has(queryName)) {
      seen.add(queryName);
      lookupNames.push({
        location: trimmed,
        queryName
      });
    }
  }

  return lookupNames;
}
