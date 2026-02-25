import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvelope } from '../packages/broker/src/envelope.ts';

test('envelope: required fields enforced by schema', () => {
  const bad = validateEnvelope({ id: '1', type: 'task.request' });
  assert.equal(bad.ok, false);
});

test('envelope: valid shape passes', () => {
  const good = validateEnvelope({
    id: '1',
    type: 'task.request',
    from: 'agentA',
    payload: { ok: true },
    ts: Date.now(),
    key_id: 'k1',
    sig: 'deadbeef'
  });
  assert.equal(good.ok, true);
});
