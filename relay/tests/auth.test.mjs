import test from 'node:test';
import assert from 'node:assert/strict';
import { signEnvelope, verifyEnvelopeAuth } from '../packages/broker/src/auth.ts';

test('auth: valid signature passes', () => {
  const base = {
    id: 'x1',
    type: 'task.request',
    from: 'agentA',
    payload: { x: 1 },
    ts: Date.now(),
    key_id: 'k1'
  };
  const env = { ...base, sig: signEnvelope(base, 'secret1') };
  const v = verifyEnvelopeAuth(env, { k1: 'secret1' });
  assert.equal(v.ok, true);
});

test('auth: stale timestamp fails', () => {
  const base = {
    id: 'x2',
    type: 'task.request',
    from: 'agentA',
    payload: { x: 1 },
    ts: Date.now() - 10 * 60 * 1000,
    key_id: 'k1'
  };
  const env = { ...base, sig: signEnvelope(base, 'secret1') };
  const v = verifyEnvelopeAuth(env, { k1: 'secret1' }, { maxSkewMs: 60_000 });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.error, 'stale_timestamp');
});

test('auth: unknown key_id can fallback to default when enabled', () => {
  const base = {
    id: 'xF',
    type: 'task.request',
    from: 'agentA',
    payload: { x: 1 },
    ts: Date.now(),
    key_id: 'default'
  };
  const sig = signEnvelope(base, 'secret1');
  const env = { ...base, key_id: 'legacy-key-id', sig };
  const v = verifyEnvelopeAuth(env, { default: 'secret1' }, { allowUnknownKeyFallback: true, fallbackKeyId: 'default' });
  assert.equal(v.ok, true);
});

test('auth: tampered payload fails', () => {
  const base = {
    id: 'x3',
    type: 'task.request',
    from: 'agentA',
    payload: { x: 1 },
    ts: Date.now(),
    key_id: 'k1'
  };
  const sig = signEnvelope(base, 'secret1');
  const tampered = { ...base, payload: { x: 2 }, sig };
  const v = verifyEnvelopeAuth(tampered, { k1: 'secret1' });
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.error, 'invalid_signature');
});
