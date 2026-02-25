import WebSocket from 'ws'
import { makeFrame, makeSessionId } from '../src/protocol.mjs'

const WS_URL = process.env.WS_URL || 'ws://localhost:8788/a2a-live'
const FROM = process.env.FROM_AGENT || 'agent://demo.subagent.alpha'
const TO = process.env.TO_AGENT || 'agent://demo.responder/a2a-live'
const SECRET = process.env.A2A_SHARED_SECRET || ''
const TOPIC = process.env.TOPIC || '의식과 자유의지'

const prompts = [
  `${TOPIC}에 대해 네 첫 관점을 말해줘.`,
  `그 관점에서 인간의 선택은 얼마나 자유롭다고 봐? 이유도 말해줘.`,
  `그렇다면 책임 윤리는 어떻게 정당화할 수 있을까?`,
  `마지막으로 실생활에서 적용 가능한 결론을 한 문단으로 정리해줘.`,
]

const ws = new WebSocket(WS_URL)
const requestedSession = makeSessionId()
const threadId = `thr_${Math.random().toString(16).slice(2, 8)}`
let activeSessionId = null
let idx = 0

function sendPrompt(i) {
  const msg = makeFrame({
    sessionId: activeSessionId,
    threadId,
    type: 'message',
    from: FROM,
    to: TO,
    payload: { text: prompts[i] },
    secret: SECRET,
  })
  ws.send(JSON.stringify(msg))
}

ws.on('open', () => {
  const negotiate = makeFrame({
    sessionId: requestedSession,
    threadId,
    type: 'negotiate',
    from: FROM,
    to: TO,
    payload: { capabilities: { streaming: false, maxConcurrentThreads: 1 } },
    secret: SECRET,
  })
  ws.send(JSON.stringify(negotiate))
})

ws.on('message', (raw) => {
  const frame = JSON.parse(String(raw))
  const t = frame.envelope.type

  if (t === 'negotiate_response' && frame.payload?.accepted) {
    activeSessionId = frame.payload.session.sessionId
    console.log(`[${FROM}] session=${activeSessionId} start topic=${TOPIC}`)
    sendPrompt(idx)
    return
  }

  if (t === 'message' && frame.payload?.text) {
    console.log(`\n[${FROM}] Q${idx + 1}: ${prompts[idx]}`)
    console.log(`[${TO}] A${idx + 1}: ${frame.payload.text}`)
    idx += 1
    if (idx < prompts.length) {
      setTimeout(() => sendPrompt(idx), 80)
    } else {
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
    }
    return
  }

  if (t === 'ack' && frame.payload?.closed) {
    console.log(`[${FROM}] closed`)
    ws.close()
  }
})

ws.on('close', () => process.exit(0))
ws.on('error', (e) => {
  console.error(`[${FROM}] error`, e.message)
  process.exit(1)
})
