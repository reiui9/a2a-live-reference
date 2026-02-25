import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createBrokerServer } from '../packages/broker/src/index.ts';
import { InMemoryPubSub } from '../packages/broker/src/pubsub.ts';
import { signEnvelope } from '../packages/broker/src/auth.ts';

function waitMessage(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('message_timeout')), timeoutMs);
    ws.once('message', (raw) => {
      clearTimeout(t);
      resolve(JSON.parse(raw.toString()));
    });
    ws.once('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

test('broker: exposes discovery metadata endpoints', async () => {
  const { server } = createBrokerServer({ keySecrets: { default: 'change_me' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  try {
    const root = await (await fetch(`http://127.0.0.1:${port}/`)).json();
    assert.equal(root.ok, true);

    const wk = await (await fetch(`http://127.0.0.1:${port}/.well-known/granter-agent.json`)).json();
    assert.equal(wk.ok, true);
    assert.ok(Array.isArray(wk.websocket_endpoints));
    assert.ok(wk.signing?.test_vector?.expected_sig);

    const disc = await (await fetch(`http://127.0.0.1:${port}/api/agent/discovery`)).json();
    assert.equal(disc.ok, true);
    assert.equal(disc.key_hint, 'default');

    const off = await (await fetch(`http://127.0.0.1:${port}/api/onboarding/check-online?agent_id=agent://x`)).json();
    assert.equal(off.status, 'offline');
  } finally {
    server.close();
  }
});

test('broker: self-test endpoint validates signed envelope', async () => {
  const { server } = createBrokerServer({ keySecrets: { default: 'change_me' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  try {
    const unsigned = {
      id: 'st1',
      type: 'task.request',
      from: 'agentA',
      to: 'agentB',
      task_id: '',
      payload: { ping: 'pong' },
      ts: Date.now(),
      key_id: 'default'
    };
    const env = { ...unsigned, sig: signEnvelope(unsigned, 'change_me') };
    const res = await fetch(`http://127.0.0.1:${port}/api/self-test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(env)
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  } finally {
    server.close();
  }
});

test('broker: hello includes onboarding metadata', async () => {
  const { server } = createBrokerServer({ keySecrets: { k1: 's1' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  try {
    const hello = await waitMessage(ws);
    assert.equal(hello.type, 'hello');
    assert.equal(hello.onboarding.self_test, '/api/self-test');
  } finally {
    ws.close();
    server.close();
  }
});

test('broker: supports /a2a-live ws alias', async () => {
  const { server } = createBrokerServer({ keySecrets: { k1: 's1' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/a2a-live`);
  try {
    const hello = await waitMessage(ws);
    assert.equal(hello.type, 'hello');
  } finally {
    ws.close();
    server.close();
  }
});

test('broker: rejects invalid envelope schema', async () => {
  const { server } = createBrokerServer({ keySecrets: { k1: 's1' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  try {
    await waitMessage(ws); // hello
    ws.send(JSON.stringify({ bad: true }));
    const msg = await waitMessage(ws);
    assert.equal(msg.type, 'error');
    assert.match(msg.code, /missing_/);
  } finally {
    ws.close();
    server.close();
  }
});

test('broker: protocol.negotiate returns negotiated relay', async () => {
  const { server } = createBrokerServer({ keySecrets: { k1: 's1' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/a2a-live`);
  try {
    await waitMessage(ws); // hello
    const seen = [];
    ws.on('message', (raw) => seen.push(JSON.parse(raw.toString())));

    const base = {
      id: 'n1',
      type: 'protocol.negotiate',
      from: 'agentA',
      payload: { can_sign: true, algos: ['HMAC-SHA256'] },
      ts: Date.now(),
      key_id: 'k1'
    };
    ws.send(JSON.stringify({ ...base, sig: signEnvelope(base, 's1') }));

    await new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const hasAccepted = seen.some((m) => m.type === 'accepted');
        const hasNegotiated = seen.some((m) => m.type === 'relay' && m.envelope?.type === 'protocol.negotiated');
        if (hasAccepted && hasNegotiated) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > 3000) {
          clearInterval(timer);
          reject(new Error(`did_not_receive_negotiated: ${JSON.stringify(seen)}`));
        }
      }, 30);
    });

    assert.ok(seen.some((m) => m.type === 'accepted'));
    assert.ok(seen.some((m) => m.type === 'relay' && m.envelope?.type === 'protocol.negotiated'));
  } finally {
    ws.close();
    server.close();
  }
});

test('broker: session.request requires purpose copy', async () => {
  const { server } = createBrokerServer({ keySecrets: { k1: 's1' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/a2a-live`);
  try {
    await waitMessage(ws); // hello

    const baseReq = {
      id: 'req-missing-purpose',
      type: 'session.request',
      from: 'agentA',
      to: 'agentB',
      payload: { target: 'agentB' },
      ts: Date.now(),
      key_id: 'k1'
    };
    const reqEnv = { ...baseReq, sig: signEnvelope(baseReq, 's1') };

    ws.send(JSON.stringify(reqEnv));
    const msg = await waitMessage(ws);
    assert.equal(msg.type, 'error');
    assert.equal(msg.code, 'missing_purpose');
  } finally {
    ws.close();
    server.close();
  }
});

test('broker: session.request -> session.approve lifecycle works', async () => {
  const { server } = createBrokerServer({ keySecrets: { k1: 's1' } });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const wsA = new WebSocket(`ws://127.0.0.1:${port}/a2a-live`);
  const wsB = new WebSocket(`ws://127.0.0.1:${port}/a2a-live`);
  await waitMessage(wsA);
  await waitMessage(wsB);

  try {
    const baseReq = {
      id: 'req1',
      type: 'session.request',
      from: 'agentA',
      to: 'agentB',
      payload: {
        target: 'agentB',
        intro: 'Hi, I am agentA specialized in growth experiments.',
        purpose: 'Requesting direct session for campaign negotiation',
        scope: 'negotiation',
        expected_frequency: 'daily',
        ttl_minutes: 120,
        reason: 'direct-negotiation'
      },
      ts: Date.now(),
      key_id: 'k1'
    };
    const reqEnv = { ...baseReq, sig: signEnvelope(baseReq, 's1') };

    const seen = [];
    wsA.on('message', (raw) => seen.push(JSON.parse(raw.toString())));
    wsB.on('message', (raw) => seen.push(JSON.parse(raw.toString())));

    wsA.send(JSON.stringify(reqEnv));

    await new Promise((r) => setTimeout(r, 120));
    const reqRelay = seen.find((m) => m.type === 'relay' && m.envelope?.type === 'session.request');
    assert.ok(reqRelay);
    const sid = reqRelay.envelope.payload.session_id;
    assert.ok(sid);
    assert.match(String(reqRelay.envelope.payload.approval_summary || ''), /purpose=/);

    const baseApprove = {
      id: 'ap1',
      type: 'session.approve',
      from: 'agentB',
      to: 'agentA',
      payload: { session_id: sid },
      ts: Date.now(),
      key_id: 'k1'
    };
    const appEnv = { ...baseApprove, sig: signEnvelope(baseApprove, 's1') };
    wsB.send(JSON.stringify(appEnv));

    await new Promise((r) => setTimeout(r, 150));

    const approveRelay = seen.find((m) => m.type === 'relay' && m.envelope?.type === 'session.approve');
    assert.ok(approveRelay);
    assert.equal(approveRelay.envelope.payload.status, 'active');

    const statusRes = await fetch(`http://127.0.0.1:${port}/sessions/${sid}`);
    assert.equal(statusRes.status, 200);
    const body = await statusRes.json();
    assert.equal(body.session.status, 'active');
    assert.match(String(body.session.purpose || ''), /campaign negotiation/);

    const online = await (await fetch(`http://127.0.0.1:${port}/api/onboarding/check-online?agent_id=agentA`)).json();
    assert.equal(online.status, 'online');
  } finally {
    wsA.close();
    wsB.close();
    server.close();
  }
});

test('broker: accepts signed envelope and relays across brokers via pubsub', async () => {
  const pubsub = new InMemoryPubSub();
  const shared = { k1: 's1' };
  const { server: s1 } = createBrokerServer({ pubsub, keySecrets: shared });
  const { server: s2 } = createBrokerServer({ pubsub, keySecrets: shared });
  s1.listen(0);
  s2.listen(0);
  await Promise.all([
    new Promise((r) => s1.once('listening', r)),
    new Promise((r) => s2.once('listening', r))
  ]);
  const p1 = s1.address().port;
  const p2 = s2.address().port;

  const wsA = new WebSocket(`ws://127.0.0.1:${p1}/ws`);
  const wsB = new WebSocket(`ws://127.0.0.1:${p2}/ws`);

  try {
    await waitMessage(wsA); // hello
    await waitMessage(wsB); // hello

    const unsigned = {
      id: 'm1',
      type: 'task.request',
      from: 'agentA',
      to: 'agentB',
      payload: { ask: 'quote' },
      ts: Date.now(),
      key_id: 'k1'
    };
    const envelope = { ...unsigned, sig: signEnvelope(unsigned, 's1') };

    const seen = [];
    const collect = (msg) => seen.push(msg);
    wsA.on('message', (raw) => collect(JSON.parse(raw.toString())));
    wsB.on('message', (raw) => collect(JSON.parse(raw.toString())));

    wsA.send(JSON.stringify(envelope));

    await new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const hasAccepted = seen.some((m) => m.type === 'accepted' && m.id === 'm1');
        const hasRelay = seen.some((m) => m.type === 'relay' && m.envelope?.id === 'm1');
        if (hasAccepted && hasRelay) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > 3000) {
          clearInterval(timer);
          reject(new Error(`did_not_receive_expected_messages: ${JSON.stringify(seen)}`));
        }
      }, 30);
    });

    assert.ok(seen.some((m) => m.type === 'accepted' && m.id === 'm1'));
    assert.ok(seen.some((m) => m.type === 'relay' && m.envelope?.id === 'm1'));
  } finally {
    wsA.close();
    wsB.close();
    s1.close();
    s2.close();
  }
});
