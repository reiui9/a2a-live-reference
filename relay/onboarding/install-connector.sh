#!/usr/bin/env bash
set -euo pipefail

RELAY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_ID="${A2A_AGENT_ID:-agent://granterbot.main}"
BROKER_WS_URL="${A2A_BROKER_WS_URL:-wss://a2a-live-relay-production.up.railway.app/a2a-live}"
BROKER_SECRET="${A2A_BROKER_SECRET:-change_me}"
KEY_ID="${A2A_KEY_ID:-default}"

cd "$RELAY_DIR"
npm install
npm run build

PLIST_SRC="$RELAY_DIR/deploy/launchd/com.a2alive.connector.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.a2alive.connector.plist"
NODE_BIN="$(which node)"
TSX_CLI="$RELAY_DIR/node_modules/tsx/dist/cli.mjs"
TARGET="$RELAY_DIR/packages/connector/src/index.ts"

mkdir -p "$HOME/Library/LaunchAgents"
python3 - <<PY
from pathlib import Path
p=Path('$PLIST_SRC')
s=p.read_text()
# program args -> node tsx cli
start=s.index('<key>ProgramArguments</key>')
arr_start=s.index('<array>', start)
arr_end=s.index('</array>', arr_start)+len('</array>')
new_arr='''<array>
      <string>$NODE_BIN</string>
      <string>$TSX_CLI</string>
      <string>$TARGET</string>
    </array>'''
s=s[:arr_start]+new_arr+s[arr_end:]
for k,v in {
  'A2A_AGENT_ID':'$AGENT_ID',
  'A2A_BROKER_WS_URL':'$BROKER_WS_URL',
  'A2A_BROKER_SECRET':'$BROKER_SECRET',
  'A2A_KEY_ID':'$KEY_ID',
}.items():
  s=s.replace(f'<key>{k}</key><string>agent://granterbot.main</string>' if k=='A2A_AGENT_ID' else
              f'<key>{k}</key><string>wss://a2a-live-relay-production.up.railway.app/a2a-live</string>' if k=='A2A_BROKER_WS_URL' else
              f'<key>{k}</key><string>change_me</string>' if k=='A2A_BROKER_SECRET' else
              f'<key>{k}</key><string>default</string>',
              f'<key>{k}</key><string>{v}</string>')
Path('$PLIST_DST').write_text(s)
print('wrote', '$PLIST_DST')
PY

launchctl bootout gui/$(id -u) "$PLIST_DST" >/dev/null 2>&1 || true
launchctl bootstrap gui/$(id -u) "$PLIST_DST"
launchctl enable gui/$(id -u)/com.a2alive.connector
launchctl kickstart -k gui/$(id -u)/com.a2alive.connector

echo "connector installed and running"
echo "status: launchctl print gui/$(id -u)/com.a2alive.connector | head"
echo "logs: tail -f /tmp/a2alive-connector.log"
