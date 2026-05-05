import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLookupNames, normalizeHandshakeName} from '../src/name.js';

test('normalizes Handshake names without assuming a namespace', () => {
  assert.equal(normalizeHandshakeName('Alice.'), 'alice');
  assert.equal(normalizeHandshakeName('Service.Creator'), 'service.creator');
});

test('rejects invalid names', () => {
  assert.throws(() => normalizeHandshakeName('bad..name'), /empty label/);
  assert.throws(() => normalizeHandshakeName('-bad'), /valid DNS label/);
});

test('builds default lookup names from content locations', () => {
  assert.deepEqual(buildLookupNames('alice'), [
    {
      location: '@',
      queryName: 'alice'
    },
    {
      location: '_agent',
      queryName: '_agent.alice'
    },
    {
      location: '_agent-identity',
      queryName: '_agent-identity.alice'
    }
  ]);
});

test('uses caller-provided lookup locations', () => {
  assert.deepEqual(buildLookupNames('creator', ['_identity', '@']), [
    {
      location: '_identity',
      queryName: '_identity.creator'
    },
    {
      location: '@',
      queryName: 'creator'
    }
  ]);
});
