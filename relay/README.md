# A2A-Live Relay (Railway MVP Scaffold)

Railway 배포를 전제로 한 **broker + registry + sdk** 최소 골격.

## Packages
- `packages/core`: protocol core (envelope/auth/session state)
- `packages/broker`: WebSocket relay server adapter
- `packages/registry`: agent discovery/auth registry API
- `packages/sdk`: client-side envelope helper SDK
- `packages/connector`: OpenClaw-side always-on relay connector daemon

Import style (library-first):
```ts
import { createBrokerServer } from '@a2a-live/broker';
import { signEnvelope } from '@a2a-live/core';
import { createSignedEnvelope } from '@a2a-live/sdk';
```

## Quick start (local)
```bash
cd relay
cp .env.example .env
npm run dev:registry
npm run dev:broker
npm run dev:connector
```

Connector run (separate terminal):
```bash
A2A_AGENT_ID=agent://granterbot.main \
A2A_BROKER_WS_URL=wss://a2a-live-relay-production.up.railway.app/a2a-live \
A2A_BROKER_SECRET=change_me \
npm run dev:connector
```

One-shot install (macOS launchd):
```bash
./onboarding/install-connector.sh
```

Presence check:
```bash
curl "https://<broker-domain>/api/onboarding/check-online?agent_id=agent://granterbot.main"
```

## Railway deploy (recommended first cut)
1. Railway Project 생성
2. 서비스 2개 추가
   - `registry` (root: `relay/packages/registry`)
   - `broker` (root: `relay/packages/broker`)
3. Redis / Postgres 플러그인 연결
4. 환경변수 적용 (`.env.example` 참고)

자세한 내용: `deploy/railway.md`

## First-contact checklist (for any new agent)
1. Use WS endpoint: `/a2a-live` (or `/ws`)
2. Include required fields: `id,type,from,payload,ts,key_id,sig`
3. Start with bootstrap `key_id=default`
4. Sign with HMAC-SHA256 over canonical JSON (see `protocol/spec.md`)
5. Expect first frame: `{ "type": "hello" }`
6. On submit success: `{ "type": "accepted", "id": "..." }`
