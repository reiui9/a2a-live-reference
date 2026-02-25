import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import WebSocket from 'ws'
import { makeFrame, makeSessionId } from '../src/protocol.mjs'

const execFileAsync = promisify(execFile)
const WS_URL = process.env.WS_URL || 'ws://localhost:8788/a2a-live'
const FROM = 'agent://demo.subagent.initiator'
const TO = 'agent://demo.responder/a2a-live'
const SECRET = process.env.A2A_SHARED_SECRET || ''
const TURNS = Number(process.env.TURNS || 4)

const ws = new WebSocket(WS_URL)
const requestedSession = makeSessionId()
const threadId = `thr_${Math.random().toString(16).slice(2, 8)}`
let activeSessionId = null

const transcript = []

async function generateInitiatorLine() {
  const history = transcript.map((t) => `${t.role}: ${t.text}`).join('\n')
  const prompt = [
    '너는 철학 대화를 이어가는 initiator 에이전트다.',
    '자연스럽고 짧게 1~2문장으로만 다음 발화를 만들어라.',
    '과장된 설명 말고 실제 사람처럼 반응하고, 상대 말의 특정 포인트를 짚어라.',
    '질문만 연속으로 던지지 말고, 동의/반박/의문을 섞어라.',
    '',
    '대화 기록:',
    history || '(없음)',
    '',
    '다음 발화만 출력:'
  ].join('\n')

  try {
    const { stdout } = await execFileAsync('openclaw', [
      'agent', '--local', '--agent', 'bridge', '--session-id', 'a2a-initiator-natural', '--message', prompt, '--json'
    ], { timeout: 25000 })
    const parsed = JSON.parse(stdout)
    const line = parsed?.payloads?.[0]?.text?.trim()
    return line || '그 말은 이해돼. 그런데 실제 선택 순간에선 감정이 이성을 이기지 않나?'
  } catch {
    return '그 말은 이해돼. 그런데 실제 선택 순간에선 감정이 이성을 이기지 않나?'
  }
}

function sendMessage(text) {
  const msg = makeFrame({
    sessionId: activeSessionId,
    threadId,
    type: 'message',
    from: FROM,
    to: TO,
    payload: { text },
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

ws.on('message', async (raw) => {
  const frame = JSON.parse(String(raw))
  const t = frame.envelope.type

  if (t === 'negotiate_response' && frame.payload?.accepted) {
    activeSessionId = frame.payload.session.sessionId
    const first = '난 자유의지가 완전한 환상이라는 쪽인데, 너는 어떻게 봐?'
    transcript.push({ role: 'initiator', text: first })
    console.log(`[initiator] ${first}`)
    sendMessage(first)
    return
  }

  if (t === 'message' && frame.payload?.text) {
    const reply = frame.payload.text
    transcript.push({ role: 'responder', text: reply })
    console.log(`[responder] ${reply}`)

    const rounds = transcript.filter((x) => x.role === 'responder').length
    if (rounds >= TURNS) {
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
      return
    }

    const next = await generateInitiatorLine()
    transcript.push({ role: 'initiator', text: next })
    console.log(`[initiator] ${next}`)
    sendMessage(next)
    return
  }

  if (t === 'ack' && frame.payload?.closed) {
    console.log('--- conversation complete ---')
    ws.close()
  }
})

ws.on('close', () => process.exit(0))
ws.on('error', (e) => {
  console.error(e)
  process.exit(1)
})
