import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { WebSocketServer } from 'ws'
import { SessionStore } from './session-store.mjs'
import { makeFrame, validateFrame, verifyEnvelope } from './protocol.mjs'

const PORT = Number(process.env.PORT || 8788)
const AGENT_URI = process.env.AGENT_URI || 'agent://demo.responder/a2a-live'
const SHARED_SECRET = process.env.A2A_SHARED_SECRET || ''
const RESPONDER_MODE = process.env.RESPONDER_MODE || 'openclaw' // openclaw | echo
const OPENCLAW_AGENT = process.env.OPENCLAW_AGENT || 'bridge'
const OPENCLAW_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS || 25000)

const execFileAsync = promisify(execFile)

const store = new SessionStore()
const sockets = new Map() // sessionId -> ws

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, agent: AGENT_URI }))
    return
  }
  if (req.url === '/.well-known/granter-agent.json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      schemaVersion: '2026-02-01',
      name: 'A2A-Live Reference Agent',
      url: `http://localhost:${PORT}`,
      a2aLive: {
        supported: true,
        endpoint: `ws://localhost:${PORT}/a2a-live`,
        maxSessionDuration: 3600,
        maxConcurrentSessions: 100,
        supportedCapabilities: ['text', 'structured_data'],
        authSchemes: ['bearer', 'hmac'],
      },
    }))
    return
  }
  res.writeHead(404)
  res.end('not found')
})

const wss = new WebSocketServer({ server, path: '/a2a-live' })

function send(ws, frame) {
  ws.send(JSON.stringify(frame))
}

function sendError(ws, requestFrame, code, message) {
  const frame = makeFrame({
    sessionId: requestFrame?.envelope?.sessionId || 'unknown',
    threadId: requestFrame?.envelope?.threadId || 'thr_error',
    type: 'error',
    from: AGENT_URI,
    to: requestFrame?.envelope?.from || 'agent://unknown',
    replyTo: requestFrame?.envelope?.id || null,
    payload: { code, message },
    secret: SHARED_SECRET,
  })
  send(ws, frame)
}

async function generateReply({ sessionId, threadId, text }) {
  if (RESPONDER_MODE === 'echo') {
    return `Responder(${AGENT_URI}) received: ${text}`
  }

  const scopedSessionId = `a2alive-${sessionId}-${threadId}`
  const prompt = `너는 A2A-Live responder 에이전트다. 아래 질문에 한국어로 4~6문장으로 의미 있게 답해라.\n질문: ${text}`

  try {
    const { stdout } = await execFileAsync('openclaw', [
      'agent',
      '--local',
      '--agent',
      OPENCLAW_AGENT,
      '--session-id',
      scopedSessionId,
      '--message',
      prompt,
      '--json',
    ], { timeout: OPENCLAW_TIMEOUT_MS })

    const parsed = JSON.parse(stdout)
    return parsed?.payloads?.[0]?.text?.trim() || `질문(${text})에 대해 답변을 생성하지 못했어.`
  } catch {
    return `좋은 질문이야. '${text}'를 한 줄로 요약하면, 인간은 완전한 자유보다는 조건 속의 선택을 통해 책임을 만들어간다고 볼 수 있어.`
  }
}

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let frame
    try {
      frame = JSON.parse(String(raw))
      validateFrame(frame)
      if (!verifyEnvelope(frame.envelope, frame.signature, SHARED_SECRET)) {
        throw new Error('invalid_signature')
      }
    } catch (e) {
      sendError(ws, frame, 'INVALID_FRAME', String(e.message || e))
      return
    }

    const { envelope, payload } = frame

    try {
      if (envelope.type === 'negotiate') {
        const session = store.create({
          initiator: envelope.from,
          responder: envelope.to,
          capabilities: payload?.capabilities || {},
        })
        store.transition(session.sessionId, 'active')
        sockets.set(session.sessionId, ws)

        const sessionView = {
          sessionId: session.sessionId,
          initiator: session.initiator,
          responder: session.responder,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          state: session.state,
          capabilities: session.capabilities,
        }

        const response = makeFrame({
          sessionId: session.sessionId,
          threadId: envelope.threadId || 'thr_0',
          type: 'negotiate_response',
          from: AGENT_URI,
          to: envelope.from,
          replyTo: envelope.id,
          payload: {
            accepted: true,
            session: sessionView,
          },
          secret: SHARED_SECRET,
        })
        send(ws, response)
        return
      }

      const session = store.get(envelope.sessionId)
      if (!session) {
        sendError(ws, frame, 'SESSION_NOT_FOUND', 'Unknown sessionId')
        return
      }

      if (store.isDuplicate(envelope.sessionId, envelope.id)) {
        const cached = store.getCachedResponse(envelope.sessionId, envelope.id)
        if (cached) cached.forEach((f) => send(ws, f))
        return
      }

      if (envelope.type === 'message') {
        store.touchThread(envelope.sessionId, envelope.threadId, envelope.id)

        const frames = []
        const ack = makeFrame({
          sessionId: envelope.sessionId,
          threadId: envelope.threadId,
          type: 'ack',
          from: AGENT_URI,
          to: envelope.from,
          replyTo: envelope.id,
          payload: { received: true },
          secret: SHARED_SECRET,
        })
        frames.push(ack)

        const text = String(payload?.text || '')
        if (/세금계산서|승인/i.test(text)) {
          const actionId = `act_${Date.now()}`
          session.pendingActions.set(actionId, { state: 'pending', sourceMessageId: envelope.id })
          const needsInput = makeFrame({
            sessionId: envelope.sessionId,
            threadId: envelope.threadId,
            type: 'control',
            from: AGENT_URI,
            to: envelope.from,
            replyTo: envelope.id,
            payload: {
              event: 'needs_input',
              actions: [{ id: actionId, type: 'approval', label: '세금계산서 발행 승인' }],
            },
            secret: SHARED_SECRET,
          })
          frames.push(needsInput)
        } else {
          const replyText = await generateReply({
            sessionId: envelope.sessionId,
            threadId: envelope.threadId,
            text,
          })

          const answer = makeFrame({
            sessionId: envelope.sessionId,
            threadId: envelope.threadId,
            type: 'message',
            from: AGENT_URI,
            to: envelope.from,
            replyTo: envelope.id,
            payload: {
              text: replyText,
            },
            secret: SHARED_SECRET,
          })
          frames.push(answer)
        }

        store.markSeen(envelope.sessionId, envelope.id)
        store.cacheResponse(envelope.sessionId, envelope.id, frames)
        frames.forEach((f) => send(ws, f))
        return
      }

      if (envelope.type === 'stream_start') {
        session.streamBuffers.set(envelope.threadId, '')
        const ack = makeFrame({
          sessionId: envelope.sessionId,
          threadId: envelope.threadId,
          type: 'ack',
          from: AGENT_URI,
          to: envelope.from,
          replyTo: envelope.id,
          payload: { stream: 'started' },
          secret: SHARED_SECRET,
        })
        store.markSeen(envelope.sessionId, envelope.id)
        store.cacheResponse(envelope.sessionId, envelope.id, [ack])
        send(ws, ack)
        return
      }

      if (envelope.type === 'stream_chunk') {
        const prev = session.streamBuffers.get(envelope.threadId) || ''
        const next = prev + String(payload?.chunk || '')
        session.streamBuffers.set(envelope.threadId, next)
        const ack = makeFrame({
          sessionId: envelope.sessionId,
          threadId: envelope.threadId,
          type: 'ack',
          from: AGENT_URI,
          to: envelope.from,
          replyTo: envelope.id,
          payload: { stream: 'chunk_received', size: next.length },
          secret: SHARED_SECRET,
        })
        store.markSeen(envelope.sessionId, envelope.id)
        store.cacheResponse(envelope.sessionId, envelope.id, [ack])
        send(ws, ack)
        return
      }

      if (envelope.type === 'stream_end') {
        const data = session.streamBuffers.get(envelope.threadId) || ''
        session.streamBuffers.delete(envelope.threadId)
        const ack = makeFrame({
          sessionId: envelope.sessionId,
          threadId: envelope.threadId,
          type: 'ack',
          from: AGENT_URI,
          to: envelope.from,
          replyTo: envelope.id,
          payload: { stream: 'ended' },
          secret: SHARED_SECRET,
        })
        const msg = makeFrame({
          sessionId: envelope.sessionId,
          threadId: envelope.threadId,
          type: 'message',
          from: AGENT_URI,
          to: envelope.from,
          replyTo: envelope.id,
          payload: { text: `stream completed (${data.length} chars)` },
          secret: SHARED_SECRET,
        })
        store.markSeen(envelope.sessionId, envelope.id)
        store.cacheResponse(envelope.sessionId, envelope.id, [ack, msg])
        send(ws, ack)
        send(ws, msg)
        return
      }

      if (envelope.type === 'control') {
        const command = payload?.command
        if (command === 'close_session') {
          store.transition(envelope.sessionId, 'closed')
          const closed = makeFrame({
            sessionId: envelope.sessionId,
            threadId: envelope.threadId,
            type: 'ack',
            from: AGENT_URI,
            to: envelope.from,
            replyTo: envelope.id,
            payload: { closed: true },
            secret: SHARED_SECRET,
          })
          store.markSeen(envelope.sessionId, envelope.id)
          store.cacheResponse(envelope.sessionId, envelope.id, [closed])
          send(ws, closed)
          sockets.delete(envelope.sessionId)
          return
        }

        if (command === 'resume_action') {
          const actionId = payload?.actionId
          const decision = payload?.decision || 'approve'
          const action = session.pendingActions.get(actionId)
          if (!action) {
            sendError(ws, frame, 'ACTION_NOT_FOUND', `Unknown actionId=${actionId}`)
            return
          }
          action.state = decision
          const resumed = makeFrame({
            sessionId: envelope.sessionId,
            threadId: envelope.threadId,
            type: 'message',
            from: AGENT_URI,
            to: envelope.from,
            replyTo: envelope.id,
            payload: { text: `action ${actionId} ${decision}. task resumed.` },
            secret: SHARED_SECRET,
          })
          const ack = makeFrame({
            sessionId: envelope.sessionId,
            threadId: envelope.threadId,
            type: 'ack',
            from: AGENT_URI,
            to: envelope.from,
            replyTo: envelope.id,
            payload: { resumed: true, actionId, decision },
            secret: SHARED_SECRET,
          })
          store.markSeen(envelope.sessionId, envelope.id)
          store.cacheResponse(envelope.sessionId, envelope.id, [ack, resumed])
          send(ws, ack)
          send(ws, resumed)
          return
        }
      }

      sendError(ws, frame, 'UNSUPPORTED_TYPE', `Not implemented type=${envelope.type}`)
    } catch (e) {
      sendError(ws, frame, 'SERVER_ERROR', String(e.message || e))
    }
  })
})

server.listen(PORT, () => {
  console.log(`A2A-Live reference listening: http://localhost:${PORT}`)
  console.log(`WS endpoint: ws://localhost:${PORT}/a2a-live`)
})
