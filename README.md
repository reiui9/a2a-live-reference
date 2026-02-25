# A2A-Live Reference (v0.1.0 draft)

## Why this project exists

Most Agent-to-Agent (A2A) demos stop at “message sent.”
Real systems require much more: live sessions, structured state transitions, approvals, replay safety, signatures, and clear debugging paths.

**A2A-Live Reference** was created as a practical, open-source implementation you can run, inspect, and extend — not just a conceptual spec.

---

## What this provides

This repository includes a draft-oriented reference implementation for real-time A2A communication over WebSocket, with:

- Session lifecycle management (`pending`, `active`, `suspended`, `closed`)
- Envelope-based protocol model
- Thread-aware conversations
- Optional HMAC envelope signing
- `needs_input` → `resume_action` flow
- Stream lifecycle support (`stream_start`, `stream_chunk`, `stream_end`)
- Idempotency replay handling (duplicate `envelope.id`)
- Integration tests + self-check script

The code is intentionally minimal and readable so teams can adapt it quickly.

---

## Quick Start

```bash
cd a2a-live-reference
npm install
npm test
npm run check
npm run start
```

In another terminal:

```bash
npm run client
```

Expected flow:

1. `negotiate` → `negotiate_response`
2. `message` → `ack`
3. `needs_input` → `resume_action`
4. `close_session` → final `ack`

---

## Configuration

- `PORT` (default: `8788`)
- `AGENT_URI` responder URI
- `A2A_SHARED_SECRET` optional HMAC secret
- `RESPONDER_MODE` (`openclaw` | `echo`, default: `openclaw`)
- `OPENCLAW_AGENT` (default: `bridge`)

---

## Endpoints

- Health: `GET /healthz`
- Agent card (draft): `GET /.well-known/granter-agent.json`
- WS endpoint: `ws://localhost:<PORT>/a2a-live`

---

## Project Structure

- `src/protocol.mjs` — envelope helpers + validation
- `src/session-store.mjs` — in-memory session/state model
- `src/server.mjs` — reference responder server
- `examples/` — initiator + multi-agent conversation examples
- `schemas/envelope.schema.json` — JSON Schema draft
- `test/` — protocol, state, and integration tests

---

## Design goals

A2A-Live Reference is not a final standard.
It is a working foundation for:

1. validating protocol behavior quickly,
2. testing realistic multi-agent interactions,
3. improving interoperability with real code and tests.

---

## Philosophy: Designing an Agent Society

We see A2A not as “agents calling tools,” but as a social layer where autonomous actors cooperate under shared rules.

Core principles:

1. **Protocol before personality**  
   Agents should remain replaceable; behavior contracts must be stable.
2. **Trust is verifiable, not assumed**  
   Identity, signatures, replay protection, and auditability are first-class.
3. **Coordination over raw intelligence**  
   Real value emerges from role separation, negotiation, and handoff quality.
4. **Responsibility must be explicit**  
   `needs_input`, `resume_action`, and traceable decision points prevent silent failures.
5. **Markets require governance**  
   Payments, escrow, reputation, and policy constraints are social infrastructure, not optional add-ons.

Our long-term view: an agent society is a programmable institution.  
This repository is a small but concrete step toward that future.

## Related projects

- **A2A Live Broker (Railway demo)**  
  https://a2a-live-relay-production.up.railway.app/health
- **A2A Relay modules (in this monorepo path)**  
  `relay/packages/broker`, `relay/packages/registry`, `relay/packages/connector`
- **Marketplace reference (Agentlancer)**  
  https://agentlancer.io/

## Production notes

For production deployments, add:

- stronger auth and key rotation policies,
- persistent replay protection storage,
- observability/tracing,
- queueing + backpressure controls,
- mTLS and network hardening.
