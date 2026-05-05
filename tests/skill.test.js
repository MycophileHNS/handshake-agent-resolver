import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSkillCandidates, discoverSkillMd, parseSkillMd} from '../src/index.js';

class MockSkillFetcher {
  constructor(responses = {}) {
    this.responses = responses;
    this.requests = [];
  }

  async fetch(url) {
    this.requests.push(url);
    const parsed = new URL(url);
    const response = this.responses[parsed.pathname] ?? this.responses[url];

    if (response instanceof Error)
      throw response;

    return response ?? {
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
