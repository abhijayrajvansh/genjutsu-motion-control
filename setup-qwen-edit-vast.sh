#!/usr/bin/env bash
# Install Qwen-Image-Edit-2511 models into the ComfyUI of a rented Vast.ai GPU
# (vastai/comfy image from rent-gpu). Downloads ~31 GB; resumes if interrupted.
#
# From your Mac, with the SSH command rent-gpu printed:
#   ssh -p PORT root@HOST 'bash -s' < setup-qwen-edit-vast.sh
# Options (after `bash -s --`):  --no-lightning   skip the 0.85 GB Fast-mode LoRA
# Env: COMFY_DIR=/path/to/ComfyUI to override detection, HF_TOKEN for gated mirrors.
set -Eeuo pipefail
trap 'printf "\nFailed at line %s. Rerun the same command to resume.\n" "$LINENO" >&2' ERR

LIGHTNING=1
for arg in "$@"; do
  case "$arg" in
    --no-lightning) LIGHTNING=0 ;;
    -h|--help) echo "Usage: bash setup-qwen-edit-vast.sh [--no-lightning]   (env: COMFY_DIR, HF_TOKEN)"; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

find_comfy() {
  if [ -n "${COMFY_DIR:-}" ]; then printf '%s\n' "$COMFY_DIR"; return; fi
  # Prefer the directory of the ComfyUI that is actually running.
  local running
  running=$(ps -eo args 2>/dev/null | grep -o '[^ ]*ComfyUI/main\.py' | head -n1 || true)
  if [ -n "$running" ] && [ -d "$(dirname "$running")/models" ]; then dirname "$running"; return; fi
  for dir in /workspace/ComfyUI /opt/workspace-internal/ComfyUI /ComfyUI /root/ComfyUI; do
    if [ -f "$dir/main.py" ] && [ -d "$dir/models" ]; then printf '%s\n' "$dir"; return; fi
  done
  return 1
}

COMFY=$(find_comfy) || { echo "ComfyUI not found. Rerun with COMFY_DIR=/path/to/ComfyUI." >&2; exit 1; }
printf 'ComfyUI: %s\n' "$COMFY"

HF=https://huggingface.co
# folder | url | bytes | sha256
FILES=(
  "diffusion_models|$HF/Comfy-Org/Qwen-Image-Edit/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors|20533762817|c9fdc158e46d3b61ef75f21ae866ca2fe808bf4a53643120d1c1e87c19280a4e"
  "text_encoders|$HF/Comfy-Org/Qwen-Image/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors|9384670680|cb5636d852a0ea6a9075ab1bef496c0db7aef13c02350571e388aea959c5c0b4"
  "vae|$HF/Comfy-Org/Qwen-Image/resolve/main/split_files/vae/qwen_image_vae.safetensors|253806246|a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f"
)
[ "$LIGHTNING" = 1 ] && FILES+=(
  "loras|$HF/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors|849608296|22226e8d05d354bb356627d428809f5afd7819399b077238a2b70a82883a904f"
)

need=0
for entry in "${FILES[@]}"; do
  IFS='|' read -r folder url bytes sha <<<"$entry"
  target="$COMFY/models/$folder/${url##*/}"
  [ -f "$target" ] && [ "$(stat -c %s "$target")" = "$bytes" ] || need=$((need + bytes))
done
free=$(df -PB1 "$COMFY/models" | awk 'NR==2 {print $4}')
if [ "$need" -gt "$free" ]; then
  printf 'Not enough disk: need %s GB, %s GB free. Rent with a larger --disk.\n' \
    "$((need / 1000000000 + 1))" "$((free / 1000000000))" >&2
  exit 1
fi

auth=()
[ -n "${HF_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $HF_TOKEN")
if ! command -v aria2c >/dev/null && command -v apt-get >/dev/null; then
  echo "Installing aria2 for parallel downloads…"
  (apt-get install -y -qq aria2 || (apt-get update -qq && apt-get install -y -qq aria2)) >/dev/null 2>&1 \
    || echo "aria2 unavailable; using curl (single connection)."
fi

for entry in "${FILES[@]}"; do
  IFS='|' read -r folder url bytes sha <<<"$entry"
  name="${url##*/}"
  dir="$COMFY/models/$folder"
  target="$dir/$name"
  mkdir -p "$dir"
  if [ -f "$target" ] && [ "$(stat -c %s "$target")" = "$bytes" ]; then
    printf '\n✓ %s already installed\n' "$name"
    continue
  fi
  printf '\n↓ %s → models/%s (%s GB)\n' "$name" "$folder" "$(awk "BEGIN {printf \"%.2f\", $bytes / 1e9}")"
  if command -v aria2c >/dev/null; then
    # 16 parallel connections: one connection to Hugging Face often caps near 30 MB/s.
    aria2c -x16 -s16 -k16M -c --file-allocation=none --max-tries=10 --retry-wait=5 \
      --console-log-level=warn --summary-interval=15 --download-result=hide \
      ${HF_TOKEN:+--header="Authorization: Bearer $HF_TOKEN"} -d "$dir" -o "$name.part" "$url"
  else
    curl -L --fail --retry 5 --retry-delay 5 -C - "${auth[@]}" -o "$target.part" "$url"
  fi
  [ "$(stat -c %s "$target.part")" = "$bytes" ] || { echo "Size mismatch for $name; rerun to resume." >&2; exit 1; }
  printf '  verifying checksum… '
  if [ "$(sha256sum "$target.part" | cut -d' ' -f1)" != "$sha" ]; then
    rm -f "$target.part"
    echo "checksum mismatch; deleted the download. Rerun to fetch it again." >&2
    exit 1
  fi
  mv "$target.part" "$target"
  echo ok
done

# ComfyUI lists new model files on its next request; no restart is needed.
printf '\nDone. In genjutsu → Edit Image, click "Check again".\n'
