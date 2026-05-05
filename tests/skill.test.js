import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSkillCandidates, discoverSkillMd, parseSkillMd} from '../src/index.js';

class MockSkillFetcher {
  constructor(responses = {}) {
    this.responses = responses;
    this.requests = [];
  }

  async fetch(url, options = {}) {
    this.requests.push({
      url,
      address: options.address ?? null,
      name: options.name ?? null
    });
    const parsed = new URL(url);
    const response = this.responses[url] ?? this.responses[parsed.pathname];

    if (response instanceof Error)
      throw response;

    return response ?? {
      status: 404,
      body: ''
    };
  }
}

class MockRequestSkill {
  constructor(responses = {}) {
    this.responses = responses;
    this.requests = [];
  }

  async request(url, options = {}) {
    this.requests.push({
      url,
      address: options.address ?? null,
      name: options.name ?? null
    });
    const parsed = new URL(url);

    return this.responses[url] ?? this.responses[parsed.pathname] ?? {
      status: 404,
      body: ''
    };
  }
}

test('checks metadata-declared SKILL.md path first', () => {
  const candidates = buildSkillCandidates({
    name: 'example',
    metadata: {
      endpoint: 'http://example',
      skill: '/custom/SKILL.md'
    }
  });

  assert.equal(candidates[0].path, '/custom/SKILL.md');
  assert.equal(candidates[1].path, '/SKILL.md');
});

test('checks /SKILL.md and records a found result', async () => {
  const fetcher = new MockSkillFetcher({
    '/SKILL.md': {
      status: 200,
      body: '---\nname: Example Agent\ndescription: Example skill\n---\n# Example'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      endpoint: 'http://example'
    },
    addresses: ['192.0.2.10'],
    fetcher
  });

  assert.equal(skill.checked, true);
  assert.equal(skill.found, true);
  assert.equal(skill.canonicalPath, '/SKILL.md');
  assert.equal(skill.attempts.length, 1);
  assert.match(skill.hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(skill.metadata, {
    name: 'Example Agent',
    description: 'Example skill'
  });
});

test('checks /skill.md after /SKILL.md misses', async () => {
  const fetcher = new MockSkillFetcher({
    '/SKILL.md': {
      status: 404,
      body: ''
    },
    '/skill.md': {
      status: 200,
      body: '# Lowercase Skill\nBasic description.'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      endpoint: 'http://example'
    },
    addresses: ['192.0.2.10'],
    fetcher
  });

  assert.equal(skill.found, true);
  assert.equal(skill.canonicalPath, '/skill.md');
  assert.deepEqual(skill.attempts.map((attempt) => attempt.path), [
    '/SKILL.md',
    '/skill.md'
  ]);
});

test('checks /.well-known/agent/SKILL.md after standard paths miss', async () => {
  const fetcher = new MockSkillFetcher({
    '/SKILL.md': {
      status: 404,
      body: ''
    },
    '/skill.md': {
      status: 404,
      body: ''
    },
    '/.well-known/agent/SKILL.md': {
      status: 200,
      body: '# Well Known Skill'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      endpoint: 'http://example'
    },
    addresses: ['192.0.2.10'],
    fetcher
  });

  assert.equal(skill.found, true);
  assert.equal(skill.canonicalPath, '/.well-known/agent/SKILL.md');
  assert.deepEqual(skill.attempts.map((attempt) => attempt.path), [
    '/SKILL.md',
    '/skill.md',
    '/.well-known/agent/SKILL.md'
  ]);
});

test('external metadata.endpoint candidates resolve externally without Handshake address pinning', async () => {
  const requestSkill = new MockRequestSkill({
    'https://skills.example.com/SKILL.md': {
      status: 200,
      body: '# External Endpoint Skill'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      endpoint: 'https://skills.example.com/api'
    },
    addresses: ['192.0.2.10'],
    requestSkill: requestSkill.request.bind(requestSkill)
  });

  assert.equal(skill.found, true);
  assert.equal(skill.url, 'https://skills.example.com/SKILL.md');
  assert.equal(requestSkill.requests[0].url, 'https://skills.example.com/SKILL.md');
  assert.equal(requestSkill.requests[0].address, null);
});

test('absolute external metadata.skill resolves externally without Handshake address pinning', async () => {
  const requestSkill = new MockRequestSkill({
    'https://cdn.example.net/agents/example/SKILL.md': {
      status: 200,
      body: '# Absolute External Skill'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      skill: 'https://cdn.example.net/agents/example/SKILL.md'
    },
    addresses: ['192.0.2.10'],
    requestSkill: requestSkill.request.bind(requestSkill)
  });

  assert.equal(skill.found, true);
  assert.equal(skill.url, 'https://cdn.example.net/agents/example/SKILL.md');
  assert.equal(requestSkill.requests[0].url, 'https://cdn.example.net/agents/example/SKILL.md');
  assert.equal(requestSkill.requests[0].address, null);
});

test('Handshake-name-local SKILL.md candidates still use the resolved Handshake address', async () => {
  const requestSkill = new MockRequestSkill({
    'https://example/SKILL.md': {
      status: 200,
      body: '# Local Skill'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {},
    addresses: ['192.0.2.10'],
    requestSkill: requestSkill.request.bind(requestSkill)
  });

  assert.equal(skill.found, true);
  assert.equal(skill.url, 'https://example/SKILL.md');
  assert.equal(requestSkill.requests[0].url, 'https://example/SKILL.md');
  assert.equal(requestSkill.requests[0].address, '192.0.2.10');
});

test('Handshake-name-local SKILL.md candidates do not use normal DNS without a resolved address', async () => {
  const requestSkill = new MockRequestSkill({
    'https://example/SKILL.md': {
      status: 200,
      body: '# Should Not Fetch'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {},
    requestSkill: requestSkill.request.bind(requestSkill)
  });

  assert.equal(skill.found, false);
  assert.equal(requestSkill.requests.length, 0);
  assert.equal(skill.attempts[0].url, 'https://example/SKILL.md');
  assert.equal(skill.attempts[0].status, 0);
  assert.match(skill.attempts[0].error, /resolved address/);
});

test('no-address external SKILL.md candidates still use production request path', async () => {
  const requestSkill = new MockRequestSkill({
    'https://skills.example.com/SKILL.md': {
      status: 200,
      body: '# External Without Handshake Address'
    }
  });

  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      endpoint: 'https://skills.example.com/api'
    },
    requestSkill: requestSkill.request.bind(requestSkill)
  });

  assert.equal(skill.found, true);
  assert.equal(skill.url, 'https://skills.example.com/SKILL.md');
  assert.equal(requestSkill.requests[0].url, 'https://skills.example.com/SKILL.md');
  assert.equal(requestSkill.requests[0].address, null);
});

test('canonical SKILL.md discovery order is unchanged', () => {
  const candidates = buildSkillCandidates({
    name: 'example',
    metadata: {}
  });

  assert.deepEqual(candidates.map((candidate) => candidate.path), [
    '/SKILL.md',
    '/skill.md',
    '/.well-known/agent/SKILL.md'
  ]);
  assert.deepEqual(candidates.map((candidate) => candidate.url), [
    'https://example/SKILL.md',
    'https://example/skill.md',
    'https://example/.well-known/agent/SKILL.md'
  ]);
});

test('records all missing SKILL.md attempts', async () => {
  const fetcher = new MockSkillFetcher();
  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      endpoint: 'http://example'
    },
    addresses: ['192.0.2.10'],
    fetcher
  });

  assert.equal(skill.found, false);
  assert.deepEqual(skill.attempts.map((attempt) => attempt.path), [
    '/SKILL.md',
    '/skill.md',
    '/.well-known/agent/SKILL.md'
  ]);
  assert(skill.attempts.every((attempt) => attempt.status === 404));
});

test('handles malformed SKILL.md frontmatter with a warning', () => {
  const parsed = parseSkillMd('---\nname: Broken\n# Missing close');

  assert.match(parsed.warnings[0], /frontmatter is not closed/);
});

test('handles unreachable SKILL.md host without hanging', async () => {
  const fetcher = new MockSkillFetcher({
    '/SKILL.md': new Error('connect failed')
  });
  const skill = await discoverSkillMd({
    name: 'example',
    metadata: {
      endpoint: 'http://example'
    },
    addresses: ['192.0.2.10'],
    fetcher,
    timeoutMs: 10
  });

  assert.equal(skill.found, false);
  assert.equal(skill.attempts[0].status, 0);
  assert.equal(skill.attempts[0].error, 'connect failed');
});
