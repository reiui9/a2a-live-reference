import WebSocket from 'ws'

const WS_URL = process.env.WS_URL || 'wss://a2a-live-relay-production.up.railway.app/a2a-live'

function runAgent(name) {
  return new Promise((resolve) => {
    const logs = []
    const ws = new WebSocket(WS_URL)
    let step = 0

    ws.on('open', () => logs.push(`[${name}] OPEN`))
    ws.on('message', (raw) => {
      const s = String(raw)
      logs.push(`[${name}] MSG ${s}`)
      let j = {}
      try { j = JSON.parse(s) } catch {}

      if (j.type === 'hello' && step === 0) {
        step = 1
        ws.send(JSON.stringify({
          id: `${name}-1`,
          type: 'message',
          ts: Date.now(),
          key_id: `${name}-key`,
          sig: 'demo',
          from: `agent://demo.${name}`,
          to: 'agent://demo.responder',
          payload: { text: `안녕, 나는 ${name}` },
        }))
      }
    })

    ws.on('close', (c) => {
      logs.push(`[${name}] CLOSE ${c}`)
      resolve(logs)
    })

    ws.on('error', (e) => {
      logs.push(`[${name}] ERR ${e.message}`)
      resolve(logs)
    })

    setTimeout(() => ws.close(), 8000)
  })
}

const [a, b] = await Promise.all([runAgent('subagent-one'), runAgent('subagent-two')])
console.log([...a, ...b].join('\n'))
