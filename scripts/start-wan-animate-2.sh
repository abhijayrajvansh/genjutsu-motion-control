#!/usr/bin/env bash
set -euo pipefail
# Package mirrors used during installation must not persist in running services.
unset PIP_INDEX_URL PIP_EXTRA_INDEX_URL PIP_FIND_LINKS WAN_TORCH_INDEX
ROOT="${WAN_ROOT:-/workspace/wan-animate-2}"
mkdir -p "$ROOT/logs"
start() {
  local session="$1" command="$2"
  if ! tmux has-session -t "$session" 2>/dev/null; then
    tmux new-session -d -s "$session" "cd '$ROOT'; exec $command"
  fi
}
start wan-bf16-comfy "'$ROOT/venv/bin/python' '$ROOT/ComfyUI/main.py' --listen 127.0.0.1 --port 8188 --disable-auto-launch --bf16-unet --enable-compress-response-body >> '$ROOT/logs/comfy.log' 2>&1"
start wan-bf16-access "'$ROOT/venv/bin/python' '$ROOT/comfy-token-gateway.py' --secrets '$ROOT/private/access.json' >> '$ROOT/logs/access.log' 2>&1"
start wan-bf16-cloudflare "'$ROOT/bin/cloudflared' tunnel --protocol http2 --url http://127.0.0.1:8190 --no-autoupdate >> '$ROOT/logs/cloudflared.log' 2>&1"
printf 'Services started. Tunnel URL is in %s/logs/cloudflared.log; access credentials are in %s/private/access.json\n' "$ROOT" "$ROOT"
