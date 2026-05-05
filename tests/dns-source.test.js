import test from 'node:test';
import assert from 'node:assert/strict';
import {DnsHandshakeSource} from '../src/upstream/dns-source.js';

function dnsError(code, message = `${code} lookup failed`) {
  const error = new Error(message);
  error.code = code;
  return error;
}

class FakeResolver {
  constructor(results) {
    this.results = results;
    this.servers = [];
  }

  setServers(servers) {
    this.servers = servers;
  }

  async resolve4() {
    return this.result('A');
  }

  async resolve6() {
    return this.result('AAAA');
  }

  async resolveTxt() {
    return this.result('TXT');
  }

  result(recordType) {
    const value = this.results[recordType];

    if (value instanceof Error)
      throw value;

    return value ?? [];
  }
}

function sourceFor(results) {
  return new DnsHandshakeSource({
    resolver: new FakeResolver(results)
  });
}

test('DNS source returns no_records when A, AAAA, and TXT are empty without errors', async () => {
  const source = sourceFor({
    A: [],
    AAAA: [],
    TXT: []
  });

  const result = await source.resolveName('empty');

  assert.equal(result.status, 'no_records');
  assert.equal(result.resolved, false);
  assert.deepEqual(result.records, {
    A: [],
    AAAA: [],
    TXT: []
  });
  assert.deepEqual(result.errors, []);
});

test('DNS source returns lookup_error when all record lookups fail', async () => {
  const source = sourceFor({
    A: dnsError('SERVFAIL'),
    AAAA: dnsError('TIMEOUT'),
    TXT: dnsError('ENOTFOUND')
  });

  const result = await source.resolveName('broken');

  assert.equal(result.status, 'lookup_error');
  assert.equal(result.resolved, false);
  assert.deepEqual(result.records, {
    A: [],
    AAAA: [],
    TXT: []
  });
  assert.deepEqual(result.errors.map((error) => [error.recordType, error.code]), [
    ['A', 'SERVFAIL'],
    ['AAAA', 'TIMEOUT'],
    ['TXT', 'ENOTFOUND']
  ]);
});

test('DNS source returns ok with A records when TXT lookup fails', async () => {
  const source = sourceFor({
    A: ['192.0.2.10'],
    AAAA: [],
    TXT: dnsError('SERVFAIL')
  });

  const result = await source.resolveName('partial');

  assert.equal(result.status, 'ok');
  assert.equal(result.resolved, true);
  assert.deepEqual(result.addresses, ['192.0.2.10']);
  assert.deepEqual(result.records.TXT, []);
  assert.deepEqual(result.errors.map((error) => [error.recordType, error.code]), [
    ['TXT', 'SERVFAIL']
  ]);
});

test('DNS source returns ok with TXT records when address lookups fail', async () => {
  const source = sourceFor({
    A: dnsError('ECONNREFUSED'),
    AAAA: dnsError('TIMEOUT'),
    TXT: [['agent-identity:v1={"version":1,"endpoint":"https://example.test"}']]
  });

  const result = await source.resolveName('metadata-only');

  assert.equal(result.status, 'ok');
  assert.equal(result.resolved, false);
  assert.deepEqual(result.records.TXT, [[
    'agent-identity:v1={"version":1,"endpoint":"https://example.test"}'
  ]]);
  assert.deepEqual(result.errors.map((error) => [error.recordType, error.code]), [
    ['A', 'ECONNREFUSED'],
    ['AAAA', 'TIMEOUT']
  ]);
});
