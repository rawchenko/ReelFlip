#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
BACKEND_LOG=/tmp/reelflip-backend.log
BACKEND_PID=/tmp/reelflip-backend.pid
BACKEND_URL=http://127.0.0.1:3001/health
STARTED_BACKEND=0

cleanup() {
  if [[ "$STARTED_BACKEND" -eq 1 && -f "$BACKEND_PID" ]]; then
    local pid
    pid=$(cat "$BACKEND_PID")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo
      echo "Stopped backend (pid $pid)"
    fi
    rm -f "$BACKEND_PID"
  fi
}

trap cleanup EXIT INT TERM

lookup_backend_pid() {
  lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

start_backend() {
  local existing_pid
  existing_pid=$(lookup_backend_pid)
  if [[ -n "$existing_pid" ]]; then
    echo "Backend already running on port 3001 (pid $existing_pid)"
    return 0
  fi

  : >"$BACKEND_LOG"

  (
    cd "$ROOT_DIR"
    npm --prefix backend run dev >>"$BACKEND_LOG" 2>&1
  ) &
  local pid
  pid=$!
  echo "$pid" >"$BACKEND_PID"
  STARTED_BACKEND=1
  echo "Started backend (pid $pid)"
}

echo "Starting ReelFlip daily dev stack..."
start_backend

echo "Waiting for backend health check..."
for _ in {1..30}; do
  if curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
    echo "Backend is healthy at $BACKEND_URL"
    echo "Backend log: $BACKEND_LOG"
    echo "Open a second terminal for: npm run android"
    echo
    cd "$ROOT_DIR"
    exec npm run dev
  fi
  sleep 1
done

echo "Backend did not become healthy within 30s."
echo "Tail logs with: npm run dev:logs"
exit 1
