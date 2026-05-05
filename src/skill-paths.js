import {DEFAULT_SKILL_PATHS} from './constants.js';

function normalizePath(path) {
  if (typeof path !== 'string')
    return null;

  const trimmed = path.trim();

  if (!trimmed)
    return null;

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
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

function endpointOrigin(endpoint) {
  if (!endpoint)
    return null;

  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
}

export function buildSkillCandidates({
  name,
  metadata = {},
  defaultScheme = 'https'
}) {
  const baseOrigin = endpointOrigin(metadata.endpoint) ?? `${defaultScheme}://${name}`;
  const candidates = [];
  const seen = new Set();
  const rawPaths = [
    metadata.skill,
    ...DEFAULT_SKILL_PATHS
  ];

  for (const rawPath of rawPaths) {
    const normalized = normalizePath(rawPath);

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

  return candidates;
}
