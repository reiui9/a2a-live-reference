import WebSocket from 'ws'
import { makeFrame, makeSessionId } from '../src/protocol.mjs'

const WS_URL = process.env.WS_URL || 'ws://localhost:8788/a2a-live'
const FROM = process.env.FROM_AGENT || 'agent://demo.initiator/accounting'
const TO = process.env.TO_AGENT || 'agent://demo.responder/a2a-live'
const SECRET = process.env.A2A_SHARED_SECRET || ''

const ws = new WebSocket(WS_URL)
const requestedSession = makeSessionId()
const threadId = 'thr_demo'

ws.on('open', () => {
  const negotiate = makeFrame({
    sessionId: requestedSession,
    threadId,
    type: 'negotiate',
    from: FROM,
    to: TO,
    payload: {
      capabilities: {
        streaming: true,
        maxConcurrentThreads: 3,
      },
    },
    secret: SECRET,
  })
  ws.send(JSON.stringify(negotiate))
})

let activeSessionId = null

ws.on('message', (raw) => {
  const frame = JSON.parse(String(raw))
  const t = frame.envelope.type
  console.log('[recv]', t, frame.payload)

  if (t === 'negotiate_response' && frame.payload?.accepted) {
    activeSessionId = frame.payload.session.sessionId
    const msg = makeFrame({
      sessionId: activeSessionId,
      threadId,
      type: 'message',
      from: FROM,
      to: TO,
      payload: { text: '세금계산서 발행 진행해줘' },
      secret: SECRET,
    })
    ws.send(JSON.stringify(msg))
    return
  }

  if (t === 'control' && frame.payload?.event === 'needs_input') {
    const actionId = frame.payload?.actions?.[0]?.id
    const resume = makeFrame({
      sessionId: activeSessionId,
      threadId,
      type: 'control',
      from: FROM,
      to: TO,
      payload: { command: 'resume_action', actionId, decision: 'approve' },
      secret: SECRET,
    })
    ws.send(JSON.stringify(resume))
    return
  }

  if (t === 'message' && frame.payload?.text?.includes('task resumed')) {
    const close = makeFrame({
      sessionId: activeSessionId,
      threadId,
      type: 'control',
      from: FROM,
      to: TO,
      payload: { command: 'close_session' },
      secret: SECRET,
    })
    ws.send(JSON.stringify(close))
    setTimeout(() => ws.close(), 200)
  }
})

ws.on('close', () => process.exit(0))
ws.on('error', (e) => {
  console.error(e)
  process.exit(1)
})
