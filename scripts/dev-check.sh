#!/bin/zsh

set -euo pipefail

BACKEND_URL=http://127.0.0.1:3001/health
BACKEND_PORT=3001
CLIENT_PORT=8081

lookup_port_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

print_service() {
  local name="$1"
  local port="$2"
  local pid
  pid=$(lookup_port_pid "$port")
  if [[ -n "$pid" ]]; then
    echo "$name: running on port $port (pid $pid)"
    return 0
  fi

  echo "$name: not running"
}

print_service "backend" "$BACKEND_PORT"
print_service "expo dev server" "$CLIENT_PORT"

if curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
  echo "backend health: ok"
else
  echo "backend health: failing"
fi
