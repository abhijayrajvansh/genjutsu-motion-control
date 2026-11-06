#!/usr/bin/env bash
# Manage the genjutsu `npm run dev` server inside a tmux session.
# Install globally: ln -sf "$PWD/scripts/genjutsu-dev.sh" ~/.local/bin/genjutsu-dev
set -euo pipefail

SESSION="${GENJUTSU_TMUX_SESSION:-genjutsu-dev}"
PORT=3107
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
REPO_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

  start     Start the dev server in tmux session '$SESSION' (default)
  attach    Reconnect to the live logs (detach with Ctrl-b d)
  logs [n]  Print the last n log lines without attaching (default 100)
  stop      Stop the dev server and close the session
  restart   Stop, then start
  status    Show whether the server is running

URL: http://127.0.0.1:$PORT
EOF
}

require_tmux() {
  command -v tmux >/dev/null 2>&1 || { echo "tmux is not installed (brew install tmux)" >&2; exit 1; }
}

running() { tmux has-session -t "=$SESSION" 2>/dev/null; }

start() {
  if running; then
    echo "Already running in tmux session '$SESSION' → http://127.0.0.1:$PORT"
    return
  fi
  tmux new-session -d -s "$SESSION" -c "$REPO_DIR" -n dev
  tmux send-keys -t "=$SESSION:dev" "npm run dev" C-m
  echo "Started in tmux session '$SESSION' → http://127.0.0.1:$PORT"
  echo "Logs: $(basename "$0") attach"
}

attach() {
  running || { echo "Not running. Start with: $(basename "$0") start" >&2; exit 1; }
  if [[ -n "${TMUX:-}" ]]; then
    tmux switch-client -t "=$SESSION"
  else
    tmux attach-session -t "=$SESSION"
  fi
}

logs() {
  running || { echo "Not running." >&2; exit 1; }
  tmux capture-pane -p -t "=$SESSION:dev" -S "-${1:-100}" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
}

stop() {
  if ! running; then
    echo "Not running."
    return
  fi
  tmux send-keys -t "=$SESSION:dev" C-c
  for _ in {1..20}; do
    lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.25
  done
  tmux kill-session -t "=$SESSION" 2>/dev/null || true
  echo "Stopped '$SESSION'."
}

status() {
  if running; then
    echo "Running in tmux session '$SESSION' → http://127.0.0.1:$PORT"
  else
    echo "Not running."
  fi
}

require_tmux
case "${1:-start}" in
  start)   start ;;
  attach|a|reconnect) attach ;;
  logs|log|l) logs "${2:-100}" ;;
  stop)    stop ;;
  restart) stop; start ;;
  status|s) status ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
