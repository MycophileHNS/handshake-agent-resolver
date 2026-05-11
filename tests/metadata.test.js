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
    {id: 'resolve', name: 'resolve'},
    {id: 'describe', name: 'describe'}
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
    {id: 'mcp', name: 'mcp'},
    {id: 'a2a', name: 'a2a'},
    {id: 'http', name: 'http'}
  ]);
  assert.deepEqual(result.identity.capabilities, [
    {id: 'search', name: 'search'},
    {id: 'resolve', name: 'resolve'},
    {id: 'verify', name: 'verify'}
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

test('parses HeadlessProfile agent TXT bridge records', () => {
  const result = parseTxtRecords([
    ['agent-manifest:https://example.test/agent.json'],
    ['skill-md:https://example.test/SKILL.md'],
    ['agent-capabilities:lookup,describe'],
    ['arp:https://chat.example.test']
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.version, 1);
  assert.equal(result.identity.endpoint, 'https://example.test/agent.json');
  assert.equal(result.identity.skill, 'https://example.test/SKILL.md');
  assert.deepEqual(result.identity.capabilities, [
    {id: 'lookup', name: 'lookup'},
    {id: 'describe', name: 'describe'}
  ]);
  assert.deepEqual(result.identity.protocols, [
    {id: 'arp', name: 'arp'}
  ]);
});

test('parses HeadlessProfile aliases and equals delimiters', () => {
  const result = parseTxtRecords([
    ['manifest=https://example.test/agent.json'],
    ['skill=https://example.test/SKILL.md'],
    ['agent-capabilities=search'],
    ['arp=https://chat.example.test']
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.endpoint, 'https://example.test/agent.json');
  assert.equal(result.identity.skill, 'https://example.test/SKILL.md');
  assert.equal(result.identity.capabilities[0].id, 'search');
  assert.equal(result.identity.protocols[0].id, 'arp');
});

test('rejects empty HeadlessProfile bridge values', () => {
  const result = parseTxtRecords([
    ['v=spf1 -all'],
    ['agent-manifest:'],
    ['agent-capabilities:search']
  ]);

  assert.equal(result.status, 'malformed_records');
  assert.equal(result.identity, null);
  assert.equal(result.record, null);
  assert.equal(result.malformed.length, 1);
  assert.equal(result.malformed[0].record, 'agent-manifest:\nagent-capabilities:search');
  assert.match(result.malformed[0].message, /HeadlessProfile TXT value is empty/);
  assert.deepEqual(result.ignored, ['v=spf1 -all']);
});

test('does not report bridged records as ignored when bridge succeeds', () => {
  const result = parseTxtRecords([
    ['v=spf1 -all'],
    ['agent-manifest:https://example.test/agent.json'],
    ['agent-capabilities=search']
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.record, 'agent-manifest:https://example.test/agent.json\nagent-capabilities=search');
  assert.deepEqual(result.ignored, ['v=spf1 -all']);
});

test('accumulates repeated HeadlessProfile capability records', () => {
  const result = parseTxtRecords([
    ['agent-manifest:https://example.test/agent.json'],
    ['agent-capabilities=search,resolve'],
    ['agent-capabilities:verify,search']
  ]);

  assert.equal(result.status, 'found');
  assert.deepEqual(result.identity.capabilities, [
    {id: 'search', name: 'search'},
    {id: 'resolve', name: 'resolve'},
    {id: 'verify', name: 'verify'}
  ]);
});

test('continues scanning after oversized HeadlessProfile records', () => {
  const oversizedRecord = `agent-manifest:${'x'.repeat(5000)}`;
  const result = parseTxtRecords([
    ['v=spf1 -all'],
    [oversizedRecord],
    ['agent-capabilities=search'],
    ['skill-md:https://example.test/SKILL.md']
  ]);

  assert.equal(result.status, 'malformed_records');
  assert.equal(result.malformed.length, 1);
  assert.equal(
    result.malformed[0].record,
    `${oversizedRecord}\nagent-capabilities=search\nskill-md:https://example.test/SKILL.md`
  );
  assert.match(result.malformed[0].message, /HeadlessProfile TXT value is too long/);
  assert.deepEqual(result.ignored, ['v=spf1 -all']);
});

test('ignores oversized unrelated TXT records before bridge fallback', () => {
  const result = parseTxtRecords([
    [`verification=${'x'.repeat(5000)}`],
    ['agent-manifest:https://headless.example/agent.json'],
    ['skill-md:https://headless.example/SKILL.md']
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.endpoint, 'https://headless.example/agent.json');
  assert.equal(result.identity.skill, 'https://headless.example/SKILL.md');
  assert.equal(result.malformed.length, 0);
});

test('prefers versioned metadata over HeadlessProfile bridge records', () => {
  const result = parseTxtRecords([
    ['agent-manifest:https://headless.example/agent.json'],
    validRecord({endpoint: 'https://versioned.example/agent.json'})
  ]);

  assert.equal(result.status, 'found');
  assert.equal(result.identity.endpoint, 'https://versioned.example/agent.json');
});

test('does not let bridge records mask malformed versioned metadata', () => {
  const result = parseTxtRecords([
    ['agent-identity:v1={not-json'],
    ['agent-manifest:https://headless.example/agent.json'],
    ['skill-md:https://headless.example/SKILL.md']
  ]);

  assert.equal(result.status, 'malformed_records');
  assert.equal(result.identity, null);
  assert.equal(result.record, null);
  assert.equal(result.malformed.length, 1);
  assert.match(result.malformed[0].message, /could not be parsed/);
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
