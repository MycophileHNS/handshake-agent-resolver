import http from 'node:http';
import https from 'node:https';
import {createHash} from 'node:crypto';
import {
  DEFAULT_SKILL_FETCH_TIMEOUT_MS,
  MAX_SKILL_BYTES
} from './constants.js';
import {buildSkillCandidates} from './skill-paths.js';
import {parseSkillMd} from './skill-parse.js';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function selectAddress(addresses = []) {
  return addresses.find(Boolean) ?? null;
}

function normalizeHostname(hostname) {
  return hostname?.replace(/\.$/, '').toLowerCase() ?? '';
}

function candidateUsesResolvedName(candidateUrl, name) {
  const url = new URL(candidateUrl);

  return normalizeHostname(url.hostname) === normalizeHostname(name);
}

function requestSkill(urlString, {
  address,
  timeoutMs = DEFAULT_SKILL_FETCH_TIMEOUT_MS,
  maxBytes = MAX_SKILL_BYTES
} = {}) {
  const url = new URL(urlString);
  const client = url.protocol === 'http:' ? http : https;
  const connectHost = address ?? url.hostname;
  const headers = {
    host: url.host,
    accept: 'text/markdown,text/plain,*/*'
  };

  const options = {
    protocol: url.protocol,
    hostname: connectHost,
    port: url.port || (url.protocol === 'http:' ? 80 : 443),
    path: `${url.pathname}${url.search}`,
    method: 'GET',
    headers,
    timeout: timeoutMs,
    servername: url.hostname
  };

  return new Promise((resolve) => {
    const req = client.request(options, (res) => {
      const chunks = [];
      let size = 0;
      let aborted = false;

      res.on('data', (chunk) => {
        size += chunk.length;

        if (size > maxBytes) {
          aborted = true;
          req.destroy(new Error('SKILL.md response is too large'));
          return;
        }

        chunks.push(chunk);
      });

      res.on('end', () => {
        if (aborted)
          return;

        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('SKILL.md fetch timed out'));
    });

    req.on('error', (error) => {
      resolve({
        status: 0,
        error: error.message
      });
    });

    req.end();
  });
}

async function fetchCandidate(candidate, options) {
  if (options.requiresResolvedAddress && !options.address && !options.fetcher) {
    return {
      url: candidate.url,
      path: candidate.path,
      status: 0,
      found: false,
      error: 'resolved address or injected fetcher is required before fetching SKILL.md'
    };
  }

  let response;

  try {
    response = options.fetcher
      ? await options.fetcher.fetch(candidate.url, options)
      : await options.requestSkill(candidate.url, options);
  } catch (error) {
    response = {
      status: 0,
      error: error.message
    };
  }

  const status = response.status ?? 0;
  const found = status >= 200 && status < 300 && typeof response.body === 'string';
  const attempt = {
    url: candidate.url,
    path: candidate.path,
    status,
    found
  };

  if (response.error)
    attempt.error = response.error;

  if (!found)
    return attempt;

  attempt.hash = sha256(response.body);
  attempt.body = response.body;

  return attempt;
}

export async function discoverSkillMd({
  name,
  metadata = {},
  addresses = [],
  timeoutMs = DEFAULT_SKILL_FETCH_TIMEOUT_MS,
  fetcher,
  requestSkill: requestSkillImpl = requestSkill,
  defaultScheme = 'https'
} = {}) {
  const candidates = buildSkillCandidates({
    name,
    metadata,
    defaultScheme
  });
  const address = selectAddress(addresses);
  const attempts = [];

  for (const candidate of candidates) {
    const requiresResolvedAddress = candidateUsesResolvedName(candidate.url, name);
    const candidateAddress = requiresResolvedAddress
      ? address
      : null;
    const attempt = await fetchCandidate(candidate, {
      address: candidateAddress,
      requiresResolvedAddress,
      name,
      timeoutMs,
      fetcher,
      requestSkill: requestSkillImpl
    });

    const {body, ...publicAttempt} = attempt;
    attempts.push(publicAttempt);

    if (attempt.found) {
      const parsed = parseSkillMd(body);

      return {
        checked: true,
        found: true,
        canonicalPath: candidate.path,
        url: candidate.url,
        attempts,
        hash: attempt.hash,
        metadata: parsed.metadata,
        warnings: parsed.warnings
      };
    }
  }

  return {
    checked: candidates.length > 0,
    found: false,
    canonicalPath: candidates[0]?.path ?? null,
    url: null,
    attempts,
    warnings: []
  };
}
