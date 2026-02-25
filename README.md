# A2A-Live Reference (v0.1.0 draft)

Open-source reference implementation for your A2A-Live draft:
- Session lifecycle over WebSocket
- Envelope-based messaging
- Thread tracking
- `needs_input` + `resume_action` control flow
- Stream lifecycle (`stream_start/chunk/end`)
- Idempotency replay handling (duplicate `envelope.id`)
- Optional HMAC signature verification

## Quick start

```bash
cd a2a-live-reference
npm install
npm run start
```

In another terminal:

```bash
npm run client
```

You should see:
1. `negotiate` -> `negotiate_response`
2. `message` -> `ack` + responder `message`
3. `control(close_session)` -> `ack`

## Config

- `PORT` (default `8788`)
- `AGENT_URI` responder URI
- `A2A_SHARED_SECRET` optional HMAC key
- `RESPONDER_MODE` (`openclaw` | `echo`, default `openclaw`)
- `OPENCLAW_AGENT` (default `bridge`)

## Endpoints

- Health: `GET /healthz`
- Agent card (draft): `GET /.well-known/granter-agent.json`
- WS live: `ws://localhost:<PORT>/a2a-live`

## Structure

- `src/protocol.mjs` envelope helpers + validation
- `src/session-store.mjs` in-memory session state machine
- `src/server.mjs` reference responder server
- `examples/initiator.mjs` initiator sample client
- `schemas/envelope.schema.json` JSON Schema draft

## Notes

- This is intentionally minimal and readable for spec iteration.
- For production add: auth hardening, replay protection store, persistence, observability, backpressure controls, and mTLS.
