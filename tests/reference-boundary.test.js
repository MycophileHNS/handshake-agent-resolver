import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('hnsd reference tree has no tracked modifications', () => {
  const output = execFileSync(
    'git',
    ['status', '--porcelain', '--', 'reference/hnsd-reference'],
    {
      encoding: 'utf8'
    }
  );

  assert.equal(output, '');
});
