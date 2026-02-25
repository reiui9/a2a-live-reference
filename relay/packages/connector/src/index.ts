import WebSocket from 'ws';
import { createSignedEnvelope } from '@a2a-live/sdk';

const AGENT_ID = process.env.A2A_AGENT_ID || 'agent://granterbot.main';
const BROKER_WS_URL = process.env.A2A_BROKER_WS_URL || 'wss://a2a-live-relay-production.up.railway.app/a2a-live';
const BROKER_SECRET = process.env.A2A_BROKER_SECRET || 'change_me';
const KEY_ID = process.env.A2A_KEY_ID || 'default';
const HEARTBEAT_MS = Math.max(5000, Number(process.env.A2A_HEARTBEAT_MS || 15000));

let ws: WebSocket | null = null;
let hb: NodeJS.Timeout | null = null;
let reconnectAttempt = 0;

function log(...args: unknown[]) {
  console.log('[connector]', ...args);
}

function send(type: string, payload: Record<string, unknown>, to?: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const env = createSignedEnvelope(
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      from: AGENT_ID,
      to,
      payload,
      key_id: KEY_ID
    },
    BROKER_SECRET
  );
  ws.send(JSON.stringify(env));
}

function scheduleReconnect() {
  reconnectAttempt += 1;
  const wait = Math.min(30000, 1000 * Math.pow(2, Math.min(6, reconnectAttempt)));
  log(`reconnect in ${wait}ms (attempt ${reconnectAttempt})`);
  setTimeout(connect, wait);
}

function connect() {
  ws = new WebSocket(BROKER_WS_URL);

  ws.on('open', () => {
    reconnectAttempt = 0;
    log('connected', BROKER_WS_URL, 'as', AGENT_ID);

    send('protocol.negotiate', {
      can_sign: true,
      supported_algorithms: ['HMAC-SHA256'],
      capabilities: ['session.request', 'session.approve', 'session.reject', 'task.request']
    });

    send('agent.register', {
      agent_id: AGENT_ID,
      status: 'online',
      ts: Date.now()
    });

    if (hb) clearInterval(hb);
    hb = setInterval(() => {
      send('agent.heartbeat', { ts: Date.now() });
    }, HEARTBEAT_MS);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'hello') {
        log('hello received; onboarding=', msg.onboarding || {});
        return;
      }
      if (msg.type === 'error') {
        log('broker error', msg.code, msg.hint || '');
        return;
      }
      if (msg.type === 'relay' && msg.envelope) {
        const env = msg.envelope;
        if (env.type === 'session.request' && env.payload?.target === AGENT_ID) {
          // auto-approve policy (MVP)
          send('session.approve', { session_id: env.payload.session_id }, env.from);
          return;
        }
        log('relay', env.type, 'from', env.from, 'to', env.to || '-');
      }
    } catch (e) {
      log('parse error', String(e));
    }
  });

  ws.on('close', () => {
    log('closed');
    if (hb) {
      clearInterval(hb);
      hb = null;
    }
    scheduleReconnect();
  });

  ws.on('error', (e) => {
    log('socket error', String(e));
  });
}

connect();
