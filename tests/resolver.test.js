import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentIdentityResolver} from '../src/resolver.js';
import {MockHandshakeSource} from '../src/upstream/mock-source.js';

function metadata(overrides = {}) {
  return [[
    `agent-identity:v1=${JSON.stringify({
      version: 1,
      endpoint: 'https://agent.example/identity.json',
      publicKey: 'ed25519:abc123',
      capabilities: ['lookup'],
      ...overrides
    })}`
  ]];
}

class MockSkillFetcher {
  constructor(responses = {}) {
    this.responses = responses;
    this.requests = [];
    this.requestOptions = [];
  }

  async fetch(url, options = {}) {
    this.requests.push(url);
    this.requestOptions.push({
      url,
      address: options.address ?? null,
      name: options.name ?? null
    });
    const parsed = new URL(url);
    return this.responses[parsed.pathname] ?? {
      status: 404,
      body: ''
    };
  }
}

function emptyRecords() {
  return {
    A: [],
    AAAA: [],
    TXT: []
  };
}

class LookupErrorSource {
  sourceInfo() {
    return {
      type: 'lookup-error-test'
    };
  }

  async resolveName() {
    return {
      status: 'lookup_error',
      resolved: false,
      addresses: [],
      address: null,
      recordType: null,
      records: emptyRecords(),
      recordStatus: {
        A: 'error',
        AAAA: 'error',
        TXT: 'error'
      },
      source: this.sourceInfo(),
      errors: [{
        recordType: 'A',
        code: 'SERVFAIL',
        message: 'A lookup failed'
      }, {
        recordType: 'AAAA',
        code: 'TIMEOUT',
        message: 'AAAA lookup failed'
      }, {
        recordType: 'TXT',
        code: 'SERVFAIL',
        message: 'TXT lookup failed'
      }]
    };
  }

  async resolveTxt() {
    return {
      status: 'lookup_error',
      records: [],
      code: 'SERVFAIL',
      message: 'TXT lookup failed'
    };
  }
}

class PartialTxtErrorSource {
  sourceInfo() {
    return {
      type: 'partial-txt-error-test'
    };
  }

  async resolveName() {
    return {
      status: 'ok',
      resolved: true,
      addresses: ['192.0.2.40'],
      address: '192.0.2.40',
      recordType: 'A',
      records: {
        ...emptyRecords(),
        A: ['192.0.2.40']
      },
      recordStatus: {
        A: 'ok',
        AAAA: 'no_records',
        TXT: 'error'
      },
      source: this.sourceInfo(),
      errors: [{
        recordType: 'TXT',
        code: 'SERVFAIL',
        message: 'TXT lookup failed'
      }]
    };
  }

  async resolveTxt() {
    return {
      status: 'no_records',
      records: []
    };
  }
}

class AddressErrorNoTxtSource {
  sourceInfo() {
    return {
      type: 'address-error-no-txt-test'
    };
  }

  async resolveName() {
    return {
      status: 'lookup_error',
      resolved: false,
      addresses: [],
      address: null,
      recordType: null,
      records: emptyRecords(),
      recordStatus: {
        A: 'error',
        AAAA: 'error',
        TXT: 'no_records'
      },
      source: this.sourceInfo(),
      errors: [{
        recordType: 'A',
        code: 'SERVFAIL',
        message: 'A lookup failed'
      }, {
        recordType: 'AAAA',
        code: 'TIMEOUT',
        message: 'AAAA lookup failed'
      }]
    };
  }

  async resolveTxt() {
    return {
      status: 'no_records',
      records: []
    };
  }
}

class AddressErrorMetadataSource {
  sourceInfo() {
    return {
      type: 'address-error-metadata-test'
    };
  }

  async resolveName() {
    return {
      status: 'ok',
      resolved: false,
      addresses: [],
      address: null,
      recordType: null,
      records: {
        ...emptyRecords(),
        TXT: metadata({endpoint: 'https://metadata.example/agent.json'})
      },
      recordStatus: {
        A: 'error',
        AAAA: 'error',
        TXT: 'ok'
      },
      source: this.sourceInfo(),
      errors: [{
        recordType: 'A',
        code: 'SERVFAIL',
        message: 'A lookup failed'
      }, {
        recordType: 'AAAA',
        code: 'TIMEOUT',
        message: 'AAAA lookup failed'
      }]
    };
  }

  async resolveTxt() {
    return {
      status: 'no_records',
      records: []
    };
  }
}

function resolverFor(recordsByName, options = {}) {
  const source = new MockHandshakeSource(recordsByName);
  const resolver = new AgentIdentityResolver({
    source,
    ...options
  });

  return {
    source,
    resolver
  };
}

test('resolves normal compatible metadata at the Handshake name apex', async () => {
  const {resolver} = resolverFor({
    alice: {
      A: ['192.0.2.10'],
      TXT: metadata({name: 'Alice Agent'})
    }
  });

  const result = await resolver.resolve('alice');

  assert.equal(result.status, 'found');
  assert.equal(result.name, 'alice');
  assert.equal(result.resolved, true);
  assert.equal(result.address, '192.0.2.10');
  assert.deepEqual(result.addresses, ['192.0.2.10']);
  assert.equal(result.recordType, 'A');
  assert.equal(result.queryName, 'alice');
  assert.equal(result.identity.subject, 'alice');
  assert.equal(result.identity.name, 'Alice Agent');
});

test('resolves compatible metadata for arbitrary Handshake names', async () => {
  const {resolver} = resolverFor({
    creator: {
      A: ['192.0.2.11'],
      TXT: metadata({endpoint: 'https://creator.example/agent.json'})
    }
  });

  const result = await resolver.resolve('creator');

  assert.equal(result.status, 'found');
  assert.equal(result.name, 'creator');
  assert.equal(result.identity.endpoint, 'https://creator.example/agent.json');
});

test('returns not_found when TXT records contain no compatible metadata', async () => {
  const skillFetcher = new MockSkillFetcher({
    '/SKILL.md': {
      status: 200,
      body: '# Should Not Be Requested'
    }
  });
  const {resolver} = resolverFor({
    plainname: {
      A: ['192.0.2.12'],
      TXT: [['v=spf1 -all'], ['hello=world']]
    }
  }, {
    skill: {
      fetcher: skillFetcher
    }
  });

  const result = await resolver.resolve('plainname');

  assert.equal(result.status, 'not_found');
  assert.equal(result.resolved, true);
  assert.equal(result.address, '192.0.2.12');
  assert.equal(result.agentReady, false);
  assert.equal(result.metadataFound, false);
  assert.equal(result.skill.checked, false);
  assert.equal(result.skill.status, 'skipped_no_metadata');
  assert.equal(result.reason, 'no_compatible_records');
  assert.deepEqual(skillFetcher.requests, []);
});

test('returns not_found with malformed_records for malformed metadata', async () => {
  const {resolver} = resolverFor({
    broken: [['agent-identity:v1={bad-json']]
  });

  const result = await resolver.resolve('broken');

  assert.equal(result.status, 'not_found');
  assert.equal(result.reason, 'malformed_records');
  assert.equal(result.attempts[0].malformed.length, 1);
});

test('returns not_found with unsupported_records for unsupported metadata versions', async () => {
  const {resolver} = resolverFor({
    future: [['agent-identity:v9={"version":9,"endpoint":"https://example.test"}']]
  });

  const result = await resolver.resolve('future');

  assert.equal(result.status, 'not_found');
  assert.equal(result.reason, 'unsupported_records');
  assert.equal(result.attempts[0].unsupported.length, 1);
});

test('falls back to discovery records after an unusable apex record', async () => {
  const {source, resolver} = resolverFor({
    fallback: {
      A: ['192.0.2.13'],
      TXT: [['agent-identity:v1={bad-json']]
    },
    '_agent.fallback': metadata({endpoint: 'https://fallback.example/agent.json'})
  });

  const result = await resolver.resolve('fallback');

  assert.equal(result.status, 'found');
  assert.equal(result.queryName, '_agent.fallback');
  assert.deepEqual(source.requests, ['_agent.fallback']);
  assert.equal(result.attempts[0].status, 'malformed_records');
});

test('returns not_found when no TXT records exist at any lookup location', async () => {
  const {source, resolver} = resolverFor({});

  const result = await resolver.resolve('empty');

  assert.equal(result.status, 'not_found');
  assert.equal(result.reason, 'no_records');
  assert.equal(result.resolved, false);
  assert.deepEqual(source.requests, [
    '_agent.empty',
    '_agent-identity.empty'
  ]);
});

test('returns lookup_error when DNS metadata lookup fails before records are read', async () => {
  const resolver = new AgentIdentityResolver({
    source: new LookupErrorSource()
  });

  const result = await resolver.resolve('broken');

  assert.equal(result.status, 'not_found');
  assert.equal(result.reason, 'lookup_error');
  assert.equal(result.metadataFound, false);
  assert.equal(result.skill.status, 'skipped_no_metadata');
  assert.equal(result.attempts[0].status, 'lookup_error');
  assert.deepEqual(result.errors, [{
    recordType: 'A',
    code: 'SERVFAIL',
    message: 'A lookup failed'
  }, {
    recordType: 'AAAA',
    code: 'TIMEOUT',
    message: 'AAAA lookup failed'
  }, {
    recordType: 'TXT',
    code: 'SERVFAIL',
    message: 'TXT lookup failed'
  }]);
  assert.equal(
    result.warnings.some((warning) => /DNS lookup warning: SERVFAIL TXT lookup failed/.test(warning)),
    true
  );
});

test('does not synthesize TXT lookup_error from address lookup failures', async () => {
  const resolver = new AgentIdentityResolver({
    source: new AddressErrorNoTxtSource()
  });

  const result = await resolver.resolve('address-broken');

  assert.equal(result.status, 'not_found');
  assert.equal(result.reason, 'no_records');
  assert.equal(result.metadataFound, false);
  assert.equal(result.attempts[0].status, 'no_records');
  assert.deepEqual(result.errors.map((error) => [error.recordType, error.code]), [
    ['A', 'SERVFAIL'],
    ['AAAA', 'TIMEOUT']
  ]);
  assert.equal(
    result.warnings.some((warning) => /TXT metadata lookup failed/.test(warning)),
    false
  );
});

test('parses metadata when address lookups fail but TXT lookup succeeds', async () => {
  const skillFetcher = new MockSkillFetcher({
    '/SKILL.md': {
      status: 200,
      body: '# Metadata Skill'
    }
  });
  const resolver = new AgentIdentityResolver({
    source: new AddressErrorMetadataSource(),
    skill: {
      fetcher: skillFetcher
    }
  });

  const result = await resolver.resolve('metadata-only');

  assert.equal(result.status, 'found');
  assert.equal(result.metadataFound, true);
  assert.equal(result.identity.endpoint, 'https://metadata.example/agent.json');
  assert.equal(result.reason, undefined);
  assert.deepEqual(result.errors.map((error) => [error.recordType, error.code]), [
    ['A', 'SERVFAIL'],
    ['AAAA', 'TIMEOUT']
  ]);
  assert.equal(result.attempts[0].status, 'found');
});

test('preserves TXT lookup errors when address records resolve', async () => {
  const resolver = new AgentIdentityResolver({
    source: new PartialTxtErrorSource()
  });

  const result = await resolver.resolve('partial');

  assert.equal(result.status, 'not_found');
  assert.equal(result.resolved, true);
  assert.equal(result.address, '192.0.2.40');
  assert.equal(result.reason, 'lookup_error');
  assert.equal(result.recordStatus.TXT, 'error');
  assert.deepEqual(result.errors, [{
    recordType: 'TXT',
    code: 'SERVFAIL',
    message: 'TXT lookup failed'
  }]);
  assert.equal(result.attempts[0].status, 'lookup_error');
});

test('returns address, capabilities, protocols, and SKILL.md status', async () => {
  const skillFetcher = new MockSkillFetcher({
    '/SKILL.md': {
      status: 200,
      body: '---\nname: Resolver Skill\ndescription: Lookup support\n---\n# Resolver Skill'
    }
  });
  const {resolver} = resolverFor({
    example: {
      A: ['192.0.2.10'],
      AAAA: ['2001:db8::10'],
      TXT: [[
        'agent-identity:v1=ready=1;skill=/SKILL.md;protocols=mcp,a2a,http;',
        'capabilities=search,resolve,verify;endpoint=http://example.invalid'
      ]]
    }
  }, {
    skill: {
      fetcher: skillFetcher
    }
  });

  const result = await resolver.resolve('example');

  assert.equal(result.resolved, true);
  assert.equal(result.address, '192.0.2.10');
  assert.deepEqual(result.records.A, ['192.0.2.10']);
  assert.deepEqual(result.records.AAAA, ['2001:db8::10']);
  assert.equal(result.agentReady, true);
  assert.equal(result.metadataSource, 'TXT');
  assert.equal(result.metadata.skill, '/SKILL.md');
  assert.deepEqual(result.capabilities, [
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
  assert.deepEqual(result.protocols, [
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
  assert.equal(result.skill.checked, true);
  assert.equal(result.skill.found, true);
  assert.equal(result.skill.canonicalPath, '/SKILL.md');
  assert.equal(result.skill.metadata.name, 'Resolver Skill');
  assert.deepEqual(skillFetcher.requests, ['http://example.invalid/SKILL.md']);
});

test('forces SKILL.md discovery without compatible metadata when requested', async () => {
  const skillFetcher = new MockSkillFetcher();
  const {resolver} = resolverFor({
    plainname: {
      A: ['192.0.2.12'],
      TXT: [['v=spf1 -all']]
    }
  }, {
    forceSkillDiscovery: true,
    skill: {
      fetcher: skillFetcher
    }
  });

  const result = await resolver.resolve('plainname');

  assert.equal(result.status, 'not_found');
  assert.equal(result.metadataFound, false);
  assert.equal(result.skill.checked, true);
  assert.equal(result.skill.found, false);
  assert.deepEqual(result.skill.attempts.map((attempt) => attempt.path), [
    '/SKILL.md',
    '/skill.md',
    '/.well-known/agent/SKILL.md'
  ]);
  assert.deepEqual(skillFetcher.requests, [
    'https://plainname/SKILL.md',
    'https://plainname/skill.md',
    'https://plainname/.well-known/agent/SKILL.md'
  ]);
  assert.equal(skillFetcher.requestOptions[0].address, '192.0.2.12');
});

test('does not hardcode any special namespace', async () => {
  const {resolver} = resolverFor({
    'service.creator': {
      A: ['192.0.2.20'],
      TXT: metadata({endpoint: 'https://creator.example/agent.json'})
    }
  });

  const result = await resolver.resolve('service.creator');

  assert.equal(result.status, 'found');
  assert.equal(result.name, 'service.creator');
  assert.equal(result.address, '192.0.2.20');
});

test('does not depend on a centralized registry source', async () => {
  const {resolver} = resolverFor({
    localname: {
      A: ['192.0.2.30'],
      TXT: metadata({endpoint: 'https://local.example/agent.json'})
    }
  });

  const result = await resolver.resolve('localname');

  assert.equal(result.source.type, 'mock');
  assert.equal(result.status, 'found');
  assert.equal(result.warnings.some((warning) => /registry|root server/i.test(warning)), false);
});

test('SKILL.md discovery uses only record-provided locations and canonical fallbacks', async () => {
  const skillFetcher = new MockSkillFetcher({
    '/SKILL.md': {
      status: 200,
      body: '# Local Skill'
    }
  });
  const {source, resolver} = resolverFor({
    localname: {
      A: ['192.0.2.30'],
      TXT: metadata({endpoint: 'https://skills.example.test/agent.json'})
    }
  }, {
    skill: {
      fetcher: skillFetcher
    }
  });

  const result = await resolver.resolve('localname');

  assert.equal(result.status, 'found');
  assert.deepEqual(source.nameRequests, ['localname']);
  assert.deepEqual(source.requests, []);
  assert.deepEqual(skillFetcher.requests, ['https://skills.example.test/SKILL.md']);
  assert.equal(skillFetcher.requestOptions[0].address, null);
  assert.equal(
    result.warnings.some((warning) => /registry|directory|root server|service list/i.test(warning)),
    false
  );
});
