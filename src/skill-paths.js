import {DEFAULT_SKILL_PATHS} from './constants.js';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function isHttpUrl(url) {
  return HTTP_PROTOCOLS.has(url.protocol);
}

function normalizePath(path, warnings) {
  if (typeof path !== 'string')
    return null;

  const trimmed = path.trim();

  if (!trimmed)
    return null;

  if (URL_SCHEME_RE.test(trimmed)) {
    let url;

    try {
      url = new URL(trimmed);
    } catch {
      warnings.push('Ignoring malformed absolute SKILL.md URL.');
      return null;
    }

    if (!isHttpUrl(url)) {
      warnings.push(`Ignoring unsupported SKILL.md URL scheme: ${url.protocol}`);
      return null;
    }

    return {
      path: url.pathname || '/',
      url: url.toString()
    };
  }

  const normalized = trimmed.startsWith('/')
    ? trimmed
    : `/${trimmed}`;

  return {
    path: normalized
  };
}

function endpointOrigin(endpoint, warnings) {
  if (!endpoint)
    return null;

  let url;

  try {
    url = new URL(endpoint);
  } catch {
    warnings.push('Ignoring malformed endpoint URL for SKILL.md discovery.');
    return null;
  }

  if (!isHttpUrl(url)) {
    warnings.push(`Ignoring unsupported endpoint scheme for SKILL.md discovery: ${url.protocol}`);
    return null;
  }

  return url.origin;
}

export function buildSkillCandidatePlan({
  name,
  metadata = {},
  defaultScheme = 'https'
}) {
  const warnings = [];
  const baseOrigin = endpointOrigin(metadata.endpoint, warnings) ?? `${defaultScheme}://${name}`;
  const candidates = [];
  const seen = new Set();
  const rawPaths = [
    metadata.skill,
    ...DEFAULT_SKILL_PATHS
  ];

  for (const rawPath of rawPaths) {
    const normalized = normalizePath(rawPath, warnings);

    if (!normalized)
      continue;

    const url = normalized.url ?? new URL(normalized.path, baseOrigin).toString();
    const key = url;

    if (seen.has(key))
      continue;

    seen.add(key);
    candidates.push({
      path: normalized.path,
      url
    });
  }

  return {
    candidates,
    warnings
  };
}

export function buildSkillCandidates(options) {
  return buildSkillCandidatePlan(options).candidates;
}
