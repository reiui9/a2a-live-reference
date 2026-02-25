import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import WebSocket from 'ws'
import { makeFrame } from '../src/protocol.mjs'

function onceMessage(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout_waiting_message')), timeoutMs)
    ws.once('message', (raw) => {
      clearTimeout(t)
      resolve(JSON.parse(String(raw)))
    })
  })
}

test('negotiate -> needs_input -> resume -> close', async () => {
  const PORT = 8799
  const server = spawn('node', ['src/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), A2A_SHARED_SECRET: '' },
    stdio: 'ignore',
  })

  try {
    await wait(600)

    const ws = new WebSocket(`ws://localhost:${PORT}/a2a-live`)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })

    const negotiate = makeFrame({
      sessionId: 'ses_req_1',
      threadId: 'thr_1',
      type: 'negotiate',
      from: 'agent://init',
      to: 'agent://resp',
      payload: { capabilities: { streaming: true } },
    })
    ws.send(JSON.stringify(negotiate))

    const nres = await onceMessage(ws)
    assert.equal(nres.envelope.type, 'negotiate_response')
    assert.equal(nres.payload.accepted, true)
    const sessionId = nres.payload.session.sessionId

    const msg = makeFrame({
      sessionId,
      threadId: 'thr_1',
      type: 'message',
      from: 'agent://init',
      to: 'agent://resp',
      payload: { text: '세금계산서 발행 승인 필요해' },
    })
    msg.envelope.id = 'msg_fixed_1'
    ws.send(JSON.stringify(msg))

    const ack = await onceMessage(ws)
    const needsInput = await onceMessage(ws)
    assert.equal(ack.envelope.type, 'ack')
    assert.equal(needsInput.envelope.type, 'control')
    assert.equal(needsInput.payload.event, 'needs_input')

    // replay same message id -> should replay cached frames
    ws.send(JSON.stringify(msg))
    const ackReplay = await onceMessage(ws)
    const needsInputReplay = await onceMessage(ws)
    assert.equal(ackReplay.envelope.type, 'ack')
    assert.equal(needsInputReplay.payload.event, 'needs_input')

    const actionId = needsInput.payload.actions[0].id
    const resume = makeFrame({
      sessionId,
      threadId: 'thr_1',
      type: 'control',
      from: 'agent://init',
      to: 'agent://resp',
      payload: { command: 'resume_action', actionId, decision: 'approve' },
    })
    ws.send(JSON.stringify(resume))

    const resumeAck = await onceMessage(ws)
    const resumedMsg = await onceMessage(ws)
    assert.equal(resumeAck.envelope.type, 'ack')
    assert.equal(resumedMsg.envelope.type, 'message')
    assert.match(resumedMsg.payload.text, /task resumed/)

    const close = makeFrame({
      sessionId,
      threadId: 'thr_1',
      type: 'control',
      from: 'agent://init',
      to: 'agent://resp',
      payload: { command: 'close_session' },
    })
    ws.send(JSON.stringify(close))

    const closeAck = await onceMessage(ws)
    assert.equal(closeAck.payload.closed, true)

    ws.close()
  } finally {
    server.kill('SIGTERM')
  }
})
