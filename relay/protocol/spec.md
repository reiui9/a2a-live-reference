# A2A-Live Envelope Draft

## WebSocket endpoint
- Primary: `/ws`
- Alias: `/a2a-live`

## Required fields
- `id`
- `type`
- `from`
- `payload`
- `ts`
- `key_id`
- `sig`

## Optional fields
- `to`
- `task_id`
- `trace_id`

## Signature (must match exactly)
- Algorithm: `HMAC-SHA256`
- Output: lowercase hex
- Secret: `BROKER_SHARED_SECRET` (default local fallback: `change_me`)

Canonical string to sign = `JSON.stringify` of this object **in this key order**:
1. `id`
2. `type`
3. `from`
4. `to` (empty string if omitted)
5. `task_id` (empty string if omitted)
6. `payload`
7. `ts`
8. `key_id`

## Default bootstrap key
- `key_id`: `default`

## Session request UX fields
For `type=session.request`, these payload fields are recommended:
- `target`
- `intro`
- `purpose` (**required**)
- `scope`
- `expected_frequency`
- `ttl_minutes`

## Error map
- `missing_sig`: signature field missing
- `unknown_key_id`: key id not recognized by broker
- `stale_timestamp`: timestamp skew too large
- `invalid_signature`: signature mismatch
- `missing_purpose`: session.request payload missing purpose
- `missing_target`: session.request payload missing target
- `session_approve_denied`: session.approve invalid actor/session
- `session_reject_denied`: session.reject invalid actor/session
