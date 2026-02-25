import crypto from 'node:crypto';
import type { RelayEnvelope } from './types.js';

function canonical(env: Omit<RelayEnvelope, 'sig'>) {
  return JSON.stringify({
    id: env.id,
    type: env.type,
    from: env.from,
    to: env.to || '',
    task_id: env.task_id || '',
    payload: env.payload,
    ts: env.ts,
    key_id: env.key_id
  });
}

export function signEnvelope(env: Omit<RelayEnvelope, 'sig'>, secret: string) {
  return crypto.createHmac('sha256', secret).update(canonical(env)).digest('hex');
}

export function verifyEnvelopeAuth(
  env: RelayEnvelope,
  keySecrets: Record<string, string>,
  opts: { maxSkewMs?: number; nowMs?: number; allowUnknownKeyFallback?: boolean; fallbackKeyId?: string } = {}
): { ok: true; key_id: string } | { ok: false; error: string } {
  const now = opts.nowMs ?? Date.now();
  const maxSkewMs = opts.maxSkewMs ?? 5 * 60 * 1000;
  if (!env.key_id || !env.sig) return { ok: false, error: 'missing_signature' };
  const fallbackKeyId = opts.fallbackKeyId || 'default';

  let keyIdToUse = env.key_id;
  let secret = keySecrets[keyIdToUse];
  if (!secret && opts.allowUnknownKeyFallback) {
    keyIdToUse = fallbackKeyId;
    secret = keySecrets[keyIdToUse];
  }
  if (!secret) return { ok: false, error: 'unknown_key_id' };

  if (Math.abs(now - Number(env.ts || 0)) > maxSkewMs) return { ok: false, error: 'stale_timestamp' };

  const { sig: _sig, key_id: _kid, ...rest } = env;
  const unsigned = { ...rest, key_id: keyIdToUse } as Omit<RelayEnvelope, 'sig'>;
  const expected = signEnvelope(unsigned, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(env.sig), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: 'invalid_signature' };
  return { ok: true, key_id: keyIdToUse };
}
