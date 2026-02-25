import crypto from 'node:crypto'

export const TYPES = new Set([
  'negotiate',
  'negotiate_response',
  'message',
  'stream_start',
  'stream_chunk',
  'stream_end',
  'ack',
  'error',
  'control',
])

export function nowIso() {
  return new Date().toISOString()
}

export function makeId(prefix = 'msg') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`
}

export function makeSessionId() {
  return makeId('ses')
}

export function signEnvelope(envelopeObj, secret = '') {
  if (!secret) return null
  const h = crypto.createHmac('sha256', secret)
  h.update(JSON.stringify(envelopeObj))
  return h.digest('base64')
}

export function verifyEnvelope(envelopeObj, signature, secret = '') {
  if (!secret) return true
  if (!signature) return false
  const expected = signEnvelope(envelopeObj, secret)
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export function validateFrame(frame) {
  if (!frame || typeof frame !== 'object') throw new Error('invalid_frame')
  const { envelope, payload } = frame
  if (!envelope || typeof envelope !== 'object') throw new Error('missing_envelope')
  if (!envelope.id || !envelope.sessionId || !envelope.type) throw new Error('missing_envelope_fields')
  if (!TYPES.has(envelope.type)) throw new Error('unknown_type')
  if (!envelope.from || !envelope.to) throw new Error('missing_participants')
  if (!envelope.timestamp) throw new Error('missing_timestamp')
  if (typeof envelope.ttl !== 'number') throw new Error('missing_ttl')
  if (payload === undefined) throw new Error('missing_payload')
  return true
}

export function makeFrame({ sessionId, threadId, type, from, to, replyTo = null, ttl = 30000, payload = {}, secret = '' }) {
  const envelope = {
    id: makeId('msg'),
    sessionId,
    threadId,
    type,
    from,
    to,
    timestamp: nowIso(),
    replyTo,
    ttl,
  }
  return {
    envelope,
    payload,
    signature: signEnvelope(envelope, secret),
  }
}
