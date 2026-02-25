import { makeSessionId, nowIso } from './protocol.mjs'

export class SessionStore {
  constructor() {
    this.sessions = new Map()
  }

  create({ initiator, responder, capabilities = {} }) {
    const sessionId = makeSessionId()
    const createdAt = nowIso()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const session = {
      sessionId,
      initiator,
      responder,
      createdAt,
      expiresAt,
      state: 'pending',
      capabilities: {
        streaming: true,
        multimodal: false,
        maxConcurrentThreads: 5,
        ...capabilities,
      },
      threads: new Map(),
      seenMessageIds: new Set(),
      responseCache: new Map(),
      pendingActions: new Map(),
      streamBuffers: new Map(),
    }
    this.sessions.set(sessionId, session)
    return session
  }

  get(sessionId) {
    return this.sessions.get(sessionId)
  }

  transition(sessionId, next) {
    const s = this.get(sessionId)
    if (!s) throw new Error('session_not_found')
    const valid = {
      idle: ['pending'],
      pending: ['active', 'rejected'],
      active: ['suspended', 'closed'],
      suspended: ['active', 'closed'],
      rejected: [],
      closed: [],
    }
    const cur = s.state
    if (!valid[cur]?.includes(next)) throw new Error(`invalid_transition_${cur}_to_${next}`)
    s.state = next
    return s
  }

  touchThread(sessionId, threadId, messageId) {
    const s = this.get(sessionId)
    if (!s) throw new Error('session_not_found')
    const thread = s.threads.get(threadId) || { threadId, messages: [] }
    thread.messages.push(messageId)
    s.threads.set(threadId, thread)
    return thread
  }

  isDuplicate(sessionId, messageId) {
    const s = this.get(sessionId)
    if (!s) throw new Error('session_not_found')
    return s.seenMessageIds.has(messageId)
  }

  markSeen(sessionId, messageId) {
    const s = this.get(sessionId)
    if (!s) throw new Error('session_not_found')
    s.seenMessageIds.add(messageId)
  }

  cacheResponse(sessionId, messageId, frames) {
    const s = this.get(sessionId)
    if (!s) throw new Error('session_not_found')
    s.responseCache.set(messageId, frames)
  }

  getCachedResponse(sessionId, messageId) {
    const s = this.get(sessionId)
    if (!s) throw new Error('session_not_found')
    return s.responseCache.get(messageId) || null
  }
}
