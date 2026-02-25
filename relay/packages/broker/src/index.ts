import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { validateEnvelope, verifyEnvelopeAuth, signEnvelope, SessionManager, type RelayEnvelope } from '@a2a-live/core';
import { InMemoryPubSub, type PubSubAdapter } from './pubsub.js';

type BrokerOpts = {
  pubsub?: PubSubAdapter;
  keySecrets?: Record<string, string>;
  channel?: string;
};

export function createBrokerServer(opts: BrokerOpts = {}) {
  const app = express();
  const channel = opts.channel || 'a2a.live.events';
  const pubsub = opts.pubsub || new InMemoryPubSub();
  const keySecrets = opts.keySecrets || { default: process.env.BROKER_SHARED_SECRET || 'change_me' };
  const sessions = new SessionManager();
  const presence = new Map<string, { last_seen: number; status: 'online' | 'offline'; source?: string }>();

  app.get('/', (_req, res) => res.json({ ok: true, service: 'broker', ws: ['/ws', '/a2a-live'] }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'broker' }));
  app.get('/ready', (_req, res) => res.json({ ok: true, redis: !!process.env.REDIS_URL }));
  app.get('/.well-known/granter-agent.json', (req, res) => {
    const host = req.headers.host;
    const baseWs = host ? `wss://${host}` : 'wss://<broker-domain>';
    const testVectorUnsigned = {
      id: 'tv-1',
      type: 'task.request',
      from: 'agent.test',
      to: 'agent.echo',
      task_id: '',
      payload: { ping: 'pong' },
      ts: 1730000000000,
      key_id: 'default'
    };
    const testVectorExpectedSig = signEnvelope(testVectorUnsigned as any, keySecrets.default || 'change_me');

    res.json({
      ok: true,
      protocol: 'a2a-live.v1',
      websocket_endpoints: [`${baseWs}/a2a-live`, `${baseWs}/ws`],
      required_fields: ['id', 'type', 'from', 'payload', 'ts', 'key_id', 'sig'],
      signing: {
        algorithm: 'HMAC-SHA256',
        output: 'hex',
        canonical_order: ['id', 'type', 'from', 'to', 'task_id', 'payload', 'ts', 'key_id'],
        fallback_key_id: 'default',
        test_vector: {
          secret_hint: 'default env fallback is change_me',
          unsigned_envelope: testVectorUnsigned,
          canonical: JSON.stringify(testVectorUnsigned),
          expected_sig: testVectorExpectedSig
        }
      },
      self_test: {
        endpoint: '/api/self-test',
        expected: 'ok=true for valid signed envelope'
      },
      connector_onboarding: {
        endpoint: '/api/onboarding/check-online?agent_id=<agent_id>',
        package: '@a2a-live/connector',
        note: 'realtime delivery requires connector presence'
      }
    });
  });
  app.get('/api/agent/discovery', (req, res) => {
    const host = req.headers.host;
    const baseWs = host ? `wss://${host}` : 'wss://<broker-domain>';
    res.json({ ok: true, websocket_endpoints: [`${baseWs}/a2a-live`, `${baseWs}/ws`], key_hint: 'default' });
  });
  app.get('/api/onboarding/check-online', (req, res) => {
    const agent_id = String(req.query.agent_id || '').trim();
    if (!agent_id) return res.status(400).json({ ok: false, error: 'missing_agent_id' });
    const row = presence.get(agent_id);
    if (!row) return res.json({ ok: true, agent_id, status: 'offline', hint: 'connector_not_seen' });
    const staleMs = Date.now() - row.last_seen;
    const status = staleMs <= 45_000 ? 'online' : 'offline';
    return res.json({ ok: true, agent_id, status, last_seen: row.last_seen, stale_ms: staleMs, source: row.source || 'unknown' });
  });
  app.use(express.json());
  app.post('/api/self-test', (req, res) => {
    const envelope = req.body as RelayEnvelope;
    const schema = validateEnvelope(envelope);
    if (!schema.ok) return res.status(400).json({ ok: false, stage: 'schema', error: schema.error, hint: 'check required fields id/type/from/payload/ts/key_id/sig' });

    const auth = verifyEnvelopeAuth(envelope, keySecrets, { allowUnknownKeyFallback: true, fallbackKeyId: 'default' });
    if (!auth.ok) {
      return res.status(400).json({ ok: false, stage: 'auth', error: auth.error, hint: 'verify canonical JSON order and HMAC-SHA256 hex signature' });
    }

    return res.json({ ok: true, stage: 'pass', normalized_key_id: auth.key_id, message: 'self-test passed' });
  });
  app.get('/sessions/:id', (req, res) => {
    const row = sessions.get(String(req.params.id));
    if (!row) return res.status(404).json({ error: 'session_not_found' });
    return res.json({ ok: true, session: row });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const unsubscribe = pubsub.subscribe(channel, (payload) => {
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'relay', envelope: JSON.parse(payload) }));
      }
    }
  });

  const onConnection = (ws: any) => {
    ws.send(JSON.stringify({
      type: 'hello',
      ts: Date.now(),
      onboarding: {
        well_known: '/.well-known/granter-agent.json',
        self_test: '/api/self-test',
        check_online: '/api/onboarding/check-online?agent_id=<agent_id>',
        connector: {
          package: '@a2a-live/connector',
          run_hint: 'npm run dev:connector',
          requirement: 'agent must keep connector online for realtime delivery'
        },
        required_fields: ['id', 'type', 'from', 'payload', 'ts', 'key_id', 'sig'],
        signing: {
          algorithm: 'HMAC-SHA256',
          output: 'hex',
          canonical_order: ['id', 'type', 'from', 'to', 'task_id', 'payload', 'ts', 'key_id'],
          fallback_key_id: 'default'
        }
      }
    }));

    const sendError = (code: string) => {
      const hintMap: Record<string, string> = {
        invalid_json: 'Send valid JSON envelope. Start from /.well-known/granter-agent.json test_vector.',
        missing_target: 'session.request payload must include target.',
        missing_purpose: 'session.request payload must include purpose text for approval UX.',
        unknown_key_id: 'Use key_id=default or run /api/self-test to verify signing.',
        invalid_signature: 'Run /api/self-test first and match canonical JSON signing exactly.',
        stale_timestamp: 'Use current epoch milliseconds in ts field.'
      };
      ws.send(JSON.stringify({ type: 'error', code, hint: hintMap[code] || 'Check protocol/spec and /.well-known/granter-agent.json' }));
    };

    ws.on('message', (raw: any) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        sendError('invalid_json');
        return;
      }

      const validation = validateEnvelope(parsed);
      if (!validation.ok) {
        sendError(validation.error);
        return;
      }

      const envelope = parsed as RelayEnvelope;
      const auth = verifyEnvelopeAuth(envelope, keySecrets, { allowUnknownKeyFallback: true, fallbackKeyId: 'default' });
      if (!auth.ok) {
        sendError(auth.error);
        return;
      }

      if (envelope.from) {
        presence.set(String(envelope.from), { last_seen: Date.now(), status: 'online', source: envelope.type });
      }

      if (envelope.type === 'protocol.negotiate') {
        const p = (envelope.payload || {}) as any;
        const out = {
          ...envelope,
          type: 'protocol.negotiated',
          payload: {
            accepted_protocol: 'a2a-live.v1',
            accepted_signing: 'HMAC-SHA256',
            accepted_output: 'hex',
            fallback_key_id: 'default',
            client_capabilities: p || {}
          }
        };
        pubsub.publish(channel, JSON.stringify(out));
        ws.send(JSON.stringify({ type: 'accepted', id: envelope.id }));
        return;
      }

      if (envelope.type === 'session.request') {
        const p = (envelope.payload || {}) as any;
        const session_id = String(p.session_id || `sess_${envelope.id}`);
        const target = String(p.target || envelope.to || '').trim();
        const intro = String(p.intro || '').trim();
        const purpose = String(p.purpose || '').trim();
        const scope = String(p.scope || 'chat').trim();
        const expected_frequency = String(p.expected_frequency || 'on-demand').trim();
        const ttl_minutes = Math.max(5, Math.min(1440, Number(p.ttl_minutes || 60)));

        if (!target) {
          sendError('missing_target');
          return;
        }
        if (!purpose) {
          sendError('missing_purpose');
          return;
        }

        const row = sessions.request({
          session_id,
          requester: String(envelope.from),
          target,
          intro,
          purpose,
          scope,
          expected_frequency,
          ttl_minutes,
          reason: String(p.reason || '')
        });

        const out = {
          ...envelope,
          payload: {
            ...(p || {}),
            session_id,
            target,
            intro,
            purpose,
            scope,
            expected_frequency,
            ttl_minutes,
            status: row.status,
            approval_summary: `${intro || 'No intro'} | purpose=${purpose} | scope=${scope} | freq=${expected_frequency}`
          }
        };
        pubsub.publish(channel, JSON.stringify(out));
        ws.send(JSON.stringify({ type: 'accepted', id: envelope.id, session_id }));
        return;
      }

      if (envelope.type === 'session.approve') {
        const p = (envelope.payload || {}) as any;
        const session_id = String(p.session_id || '');
        const row = sessions.approve(session_id, String(envelope.from));
        if (!row) {
          sendError('session_approve_denied');
          return;
        }
        const out = { ...envelope, payload: { session_id, status: row.status } };
        pubsub.publish(channel, JSON.stringify(out));
        ws.send(JSON.stringify({ type: 'accepted', id: envelope.id, session_id }));
        return;
      }

      if (envelope.type === 'session.reject') {
        const p = (envelope.payload || {}) as any;
        const session_id = String(p.session_id || '');
        const row = sessions.reject(session_id, String(envelope.from));
        if (!row) {
          sendError('session_reject_denied');
          return;
        }
        const out = { ...envelope, payload: { session_id, status: row.status } };
        pubsub.publish(channel, JSON.stringify(out));
        ws.send(JSON.stringify({ type: 'accepted', id: envelope.id, session_id }));
        return;
      }

      pubsub.publish(channel, JSON.stringify(envelope));
      ws.send(JSON.stringify({ type: 'accepted', id: envelope.id }));
    });
  };

  wss.on('connection', onConnection);

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname !== '/ws' && url.pathname !== '/a2a-live') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    }
  });

  server.on('close', () => unsubscribe());

  return { app, server, wss };
}

export async function startBroker(port = Number(process.env.PORT || 8080)) {
  const { server } = createBrokerServer();
  await new Promise<void>((resolve) => server.listen(port, () => resolve()));
  return server as HttpServer;
}

const isDirectRun = process.argv[1] && process.argv[1].includes('packages/broker/src/index.ts');
if (isDirectRun) {
  startBroker().then(() => {
    console.log(`[broker] listening on :${Number(process.env.PORT || 8080)}`);
  });
}
