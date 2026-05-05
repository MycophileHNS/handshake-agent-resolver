import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTxtRecords} from '../src/metadata/parse.js';

const validRecord = (overrides = {}) => [
  `agent-identity:v1=${JSON.stringify({
    version: 1,
    name: 'Example Agent',
    endpoint: 'https://example.test/agent.json',
    capabilities: ['resolve', 'describe'],
    ...overrides
  })}`
];

test('parses compatible agent identity metadata', () => {
  const result = parseTxtRecords([validRecord()]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.version, 1);
  assert.equal(result.identity.name, 'Example Agent');
  assert.deepEqual(result.identity.capabilities, [
    {
      id: 'resolve',
      name: 'resolve'
    },
    {
      id: 'describe',
      name: 'describe'
    }
  ]);
});

test('joins segmented TXT records before parsing', () => {
  const json = JSON.stringify({
    version: 1,
    endpoint: 'https://example.test/agent.json'
  });

  const result = parseTxtRecords([
    ['agent-identity:v1=', json.slice(0, 10), json.slice(10)]
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.endpoint, 'https://example.test/agent.json');
});

test('reports names without compatible agent metadata', () => {
  const result = parseTxtRecords([
    ['unrelated=hello'],
    ['v=spf1 -all']
  ]);

  assert.equal(result.status, 'no_compatible_records');
  assert.deepEqual(result.ignored, ['unrelated=hello', 'v=spf1 -all']);
});

test('reports malformed compatible records', () => {
  const result = parseTxtRecords([
    ['agent-identity:v1={not-json']
  ]);

  assert.equal(result.status, 'malformed_records');
  assert.equal(result.malformed.length, 1);
  assert.match(result.malformed[0].message, /could not be parsed/);
});

test('reports unsupported agent identity record versions', () => {
  const result = parseTxtRecords([
    ['agent-identity:v2={"version":2}']
  ]);

  assert.equal(result.status, 'unsupported_records');
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].message, /unsupported/);
});

test('requires identity content in compatible metadata', () => {
  const result = parseTxtRecords([
    [`agent-identity:v1=${JSON.stringify({version: 1})}`]
  ]);

  assert.equal(result.status, 'malformed_records');
  assert.match(result.malformed[0].message, /at least one identity field/);
});

test('parses compact agent-identity:v1 metadata', () => {
  const result = parseTxtRecords([
    [
      'agent-identity:v1=ready=1;skill=/SKILL.md;protocols=mcp,a2a,http;',
      'capabilities=search,resolve,verify;endpoint=https://example.invalid;',
      'manifestHash=abc123;address=192.0.2.10;description=Resolver agent'
    ]
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.ready, true);
  assert.equal(result.identity.skill, '/SKILL.md');
  assert.equal(result.identity.endpoint, 'https://example.invalid');
  assert.equal(result.identity.manifestHash, 'abc123');
  assert.equal(result.identity.address, '192.0.2.10');
  assert.equal(result.identity.description, 'Resolver agent');
  assert.deepEqual(result.identity.protocols, [
    {
      id: 'mcp',
      name: 'mcp'
    },
    {
      id: 'a2a',
      name: 'a2a'
    },
    {
      id: 'http',
      name: 'http'
    }
  ]);
  assert.deepEqual(result.identity.capabilities, [
    {
      id: 'search',
      name: 'search'
    },
    {
      id: 'resolve',
      name: 'resolve'
    },
    {
      id: 'verify',
      name: 'verify'
    }
  ]);
});

test('parses hns-agent compact metadata', () => {
  const result = parseTxtRecords([
    [
      'hns-agent=v1; ready=1; skill=/SKILL.md; protocols=mcp,a2a,http;',
      ' capabilities=search,resolve,verify'
    ]
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.ready, true);
  assert.equal(result.identity.skill, '/SKILL.md');
  assert.equal(result.identity.protocols[0].id, 'mcp');
  assert.equal(result.identity.capabilities[0].id, 'search');
});

test('preserves richer capability objects', () => {
  const result = parseTxtRecords([
    [
      `agent-identity:v1=${JSON.stringify({
        version: 1,
        capabilities: [{
          id: 'search',
          name: 'Search',
          description: 'Find indexed content',
          input: 'query',
          output: 'results',
          pricing: 'free',
          auth: 'none',
          endpoint: 'https://example.invalid/search'
        }]
      })}`
    ]
  ]);

  assert.equal(result.status, 'found');
  assert.deepEqual(result.identity.capabilities, [{
    id: 'search',
    name: 'Search',
    description: 'Find indexed content',
    input: 'query',
    output: 'results',
    pricing: 'free',
    auth: 'none',
    endpoint: 'https://example.invalid/search'
  }]);
});

test('normalizes protocol objects', () => {
  const result = parseTxtRecords([
    [
      `agent-identity:v1=${JSON.stringify({
        version: 1,
        protocols: [{
          id: 'mcp',
          name: 'MCP',
          version: '2025-01',
          transport: 'http',
          endpoint: 'https://example.invalid/mcp'
        }]
      })}`
    ]
  ]);

  assert.equal(result.status, 'found');
  assert.deepEqual(result.identity.protocols, [{
    id: 'mcp',
    name: 'MCP',
    version: '2025-01',
    transport: 'http',
    endpoint: 'https://example.invalid/mcp'
  }]);
});
