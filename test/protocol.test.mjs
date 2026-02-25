import test from 'node:test'
import assert from 'node:assert/strict'
import { makeFrame, validateFrame } from '../src/protocol.mjs'

test('validateFrame accepts valid frame', () => {
  const frame = makeFrame({
    sessionId: 'ses_1',
    threadId: 'thr_1',
    type: 'message',
    from: 'agent://a',
    to: 'agent://b',
    payload: { text: 'hello' },
  })
  assert.equal(validateFrame(frame), true)
})

test('validateFrame rejects unknown type', () => {
  const frame = makeFrame({
    sessionId: 'ses_1',
    threadId: 'thr_1',
    type: 'message',
    from: 'agent://a',
    to: 'agent://b',
    payload: { text: 'hello' },
  })
  frame.envelope.type = 'not_a_type'
  assert.throws(() => validateFrame(frame), /unknown_type/)
})
