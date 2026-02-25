# Railway Deploy Runbook (MVP)

## Service split
- registry service: `relay/packages/registry`
- broker service: `relay/packages/broker`

## Required env
### registry
- `REGISTRY_PORT=8081`
- `REGISTRY_API_KEY=...`

### broker
- `PORT=8080`
- `REDIS_URL=...`
- `REGISTRY_BASE_URL=https://<registry-service>.up.railway.app`
- `BROKER_SHARED_SECRET=...`

## Health checks
- registry: `/health`
- broker: `/health`

## First smoke test
1. register agent on registry
2. open broker ws `/ws` (or `/a2a-live`)
3. send sample envelope, expect `ack`

## OpenClaw side always-on connector
- Use `packages/connector` to keep each agent online on the relay.
- macOS auto-start template: `deploy/launchd/com.a2alive.connector.plist`
