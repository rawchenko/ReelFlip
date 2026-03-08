#!/bin/zsh

set -euo pipefail

BACKEND_LOG=/tmp/reelflip-backend.log

touch "$BACKEND_LOG"
echo "Tailing backend log. Metro logs stay in the active dev terminal."
tail -n 60 -f "$BACKEND_LOG"
