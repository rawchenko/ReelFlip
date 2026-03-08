#!/bin/zsh

set -euo pipefail

BACKEND_PORT=3001
CLIENT_PORT=8081

lookup_port_pids() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

stop_service() {
  local name="$1"
  local port="$2"
  local pids
  pids=$(lookup_port_pids "$port")

  if [[ -z "$pids" ]]; then
    echo "$name is not running"
    return 0
  fi

  local stopped=0
  local pid
  for pid in ${(f)pids}; do
    if kill "$pid" 2>/dev/null; then
      echo "Stopped $name on port $port (pid $pid)"
      stopped=1
    fi
  done

  if [[ "$stopped" -eq 0 ]]; then
    echo "$name is not running"
  fi
}

stop_service "expo dev server" "$CLIENT_PORT"
stop_service "backend" "$BACKEND_PORT"
