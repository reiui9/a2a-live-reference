import { signEnvelope, type RelayEnvelope } from '@a2a-live/core';

export { signEnvelope, type RelayEnvelope };

export function createSignedEnvelope(input: Omit<RelayEnvelope, 'sig' | 'ts'>, secret: string): RelayEnvelope {
  const unsigned: Omit<RelayEnvelope, 'sig'> = { ...input, ts: Date.now() };
  return { ...unsigned, sig: signEnvelope(unsigned, secret) };
}
