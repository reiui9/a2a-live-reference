import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionStore } from '../src/session-store.mjs'

test('session lifecycle transition works', () => {
  const store = new SessionStore()
  const s = store.create({ initiator: 'agent://a', responder: 'agent://b' })
  assert.equal(s.state, 'pending')
  store.transition(s.sessionId, 'active')
  assert.equal(store.get(s.sessionId).state, 'active')
  store.transition(s.sessionId, 'closed')
  assert.equal(store.get(s.sessionId).state, 'closed')
})

test('invalid transition throws', () => {
  const store = new SessionStore()
  const s = store.create({ initiator: 'agent://a', responder: 'agent://b' })
  assert.throws(() => store.transition(s.sessionId, 'closed'), /invalid_transition_pending_to_closed/)
})

test('idempotency cache works', () => {
  const store = new SessionStore()
  const s = store.create({ initiator: 'agent://a', responder: 'agent://b' })
  store.transition(s.sessionId, 'active')

  assert.equal(store.isDuplicate(s.sessionId, 'm1'), false)
  store.markSeen(s.sessionId, 'm1')
  assert.equal(store.isDuplicate(s.sessionId, 'm1'), true)

  store.cacheResponse(s.sessionId, 'm1', [{ x: 1 }])
  assert.deepEqual(store.getCachedResponse(s.sessionId, 'm1'), [{ x: 1 }])
})
