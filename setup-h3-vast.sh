#!/usr/bin/env bash
# MiniMax H3 + SAM3 character swap on a Vast.ai RTX 5090 32GB rental.
# Installs into its own persistent directory; does not rent a GPU or submit jobs.
set -Eeuo pipefail
umask 022
trap 'printf "\nFailed at line %s. Fix the error above, then rerun the same command.\n" "$LINENO" >&2' ERR

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT=/workspace/minimax-h3
PORT=8188
LISTEN=127.0.0.1
TURBO=0
NO_APT=0
COMMAND=install
SOURCE_REV=212df10208ca0668c555081a775bba85d7f2a0dd
ASSET_BASE="https://raw.githubusercontent.com/abhijayrajvansh/genjutsu-motion-control/$SOURCE_REV/artifacts/comfyui/minimax-h3-character-swap"
MANIFEST_SHA=e4aca768505b332f1ed4875aeae1f8c94b7c54be7174185d798e4684493f8ef4
WORKFLOW_SHA=2079a7d4a86b097eed0758d5fa8a47365853f7192dc9e6fefe734a66696986d7
COMFY_REV=426f5eea52a7ece1dd599fff4cb6cd1f352ddd24 # v0.43.0
UNLOAD_REV=ac5ffb4ed05546545ce7cf38e7b69b5152714eed

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
say() { printf '\n==> %s\n' "$*"; }
usage() {
  cat <<'HELP'
Usage: bash setup-h3-vast.sh [install|start|check|plan] [options]

  install   Install dependencies, ComfyUI, custom nodes, models and workflows.
  start     Run ComfyUI in the foreground (use tmux to survive SSH disconnects).
  check     Verify CUDA, model checksums and the running server's workflow nodes.
  plan      Print the setup plan without network access or changing anything.

Options:
  --root PATH       Persistent installation directory (/workspace/minimax-h3).
  --port NUMBER     ComfyUI port (8188).
  --listen ADDRESS  Bind address (127.0.0.1); 0.0.0.0 exposes unauthenticated UI.
  --with-turbo      Also download the optional 1.96GB LoRA; keep Normal mode first.
  --no-apt          Use preinstalled system dependencies; do not run apt-get.
  -h, --help        Show this help.

Vast.ai rental selection (rent separately in your own account):
  RTX 5090 32GB, preferably 96-128GB RAM, 150-200GB persistent disk.
  Ubuntu 22.04/24.04 Linux x86_64; Python 3.10-3.12; NVIDIA driver 580+.
  Choose an SSH-enabled CUDA/PyTorch container with /workspace on persistent disk.
  The installer creates a separate venv with PyTorch 2.10.0 + CUDA 13.0.
  It does not replace the host driver or touch another ComfyUI installation.

Run on the GPU rental:
  bash setup-h3-vast.sh install
  tmux new -s h3
  bash setup-h3-vast.sh start
  # In a second rental SSH terminal:
  bash setup-h3-vast.sh check

On your computer, use the host and SSH port shown by Vast.ai's Connect button:
  ssh -p SSH_PORT -L 8188:127.0.0.1:8188 root@SSH_HOST
  Then open http://127.0.0.1:8188

Load h3-5090-0.5mp.workflow.json from ComfyUI's Workflows sidebar. Upload/select
your character photo and driving video, edit the prompt and inspect the SAM3
mask. Initial preset: 0.5MP, 124 frames, 24fps, Normal, 20 steps, audio off.
Outputs: ROOT/ComfyUI/output. No Kie/APIMart/Cloudinary key is needed.
Keep your data backed up before destroying the rental; GPU rent continues
until you stop/destroy it in Vast.ai. This script does not manage billing.
H3 commercial-use terms: https://docs.comfy.org/tutorials/video/minimax/minimax-h3
HELP
}

if [[ $# -gt 0 && $1 != -* ]]; then COMMAND=$1; shift; fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root|--port|--listen)
      [[ $# -ge 2 && -n $2 && $2 != -* ]] || die "$1 needs a value."
      case "$1" in --root) ROOT=$2;; --port) PORT=$2;; --listen) LISTEN=$2;; esac
      shift 2 ;;
    --with-turbo) TURBO=1; shift ;;
    --no-apt) NO_APT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (use --help)." ;;
  esac
done
case "$COMMAND" in install|start|check|plan) ;; *) die "Unknown command: $COMMAND.";; esac
[[ $ROOT == /* && $ROOT != / && $ROOT != *$'\n'* ]] || die '--root must be an absolute directory other than /.'
if [[ ! $PORT =~ ^[1-9][0-9]{0,4}$ ]] || (( PORT > 65535 )); then
  die 'Port must be 1-65535.'
fi
[[ $LISTEN =~ ^[a-zA-Z0-9.:_-]+$ ]] || die 'Invalid listen address.'
COMFY="$ROOT/ComfyUI"
PY="$ROOT/venv/bin/python"
MANIFEST="$ROOT/assets/download-manifest.json"
WORKFLOW="$ROOT/assets/runcomfy-original.workflow.json"

if [[ $COMMAND == plan ]]; then
  printf 'Target: %s\nComfyUI v0.43.0: %s\nPyTorch: 2.10.0 + cu130\n' "$ROOT" "$COMFY_REV"
  printf 'Models: five required (~44.22GB); optional Turbo selected: %s\n' "$TURBO"
  printf 'Custom nodes: rgthree, VideoHelperSuite, Unload-Model (pinned revisions).\n'
  printf 'Workflows: unchanged RunComfy original + separate 0.5MP RTX 5090 preset.\n'
  printf 'Server: %s:%s (foreground; no automatic rendering or rental).\n' "$LISTEN" "$PORT"
  printf 'Rental: RTX 5090 32GB; 96-128GB RAM preferred; 150-200GB persistent disk.\n'
  exit 0
fi

[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || die 'Run install/start/check inside the Linux x86_64 GPU rental. --help and plan work locally.'
command -v nvidia-smi >/dev/null || die 'nvidia-smi is missing. Choose a GPU-enabled Vast.ai image.'
DRIVER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -n 1)
if [[ ! ${DRIVER%%.*} =~ ^[0-9]+$ ]] || (( ${DRIVER%%.*} < 580 )); then
  die "NVIDIA driver 580+ required; found $DRIVER. Choose another host; do not install a driver inside the container."
fi

system_dependencies() {
  if (( NO_APT == 0 )); then
    command -v apt-get >/dev/null || die 'Use an Ubuntu image, or install dependencies yourself and pass --no-apt.'
    local elevate=()
    if (( EUID != 0 )); then
      command -v sudo >/dev/null || die 'System packages need root/sudo, or use --no-apt.'
      elevate=(sudo)
    fi
    say 'Installing system packages (no system upgrade or GPU-driver changes)'
    "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get update
    "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      git curl ca-certificates python3 python3-venv python3-dev build-essential \
      pkg-config ffmpeg libgl1 libglib2.0-0 tmux
  fi
  local tool
  for tool in git curl python3 ffmpeg ffprobe; do
    command -v "$tool" >/dev/null || die "Missing $tool; install it or omit --no-apt."
  done
  python3 - <<'PYTHON'
import sys
if not (3, 10) <= sys.version_info[:2] <= (3, 12):
    raise SystemExit("Use Python 3.10-3.12 (Ubuntu 22.04/24.04 recommended).")
from pathlib import Path
ram = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
               if line.startswith('MemTotal:'))) * 1024
# Respect the container limit rather than assuming the host's RAM is available.
for file in ('/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes'):
    p = Path(file)
    if p.exists() and p.read_text().strip().isdigit():
        ram = min(ram, int(p.read_text()))
print(f'Available RAM limit: {ram / 1e9:.1f}GB; 96-128GB preferred.')
if ram < 60_000_000_000:
    raise SystemExit('This setup requires a rental with at least about 64GB RAM.')
PYTHON
}

sha_ok() {
  "$HASH_PY" - "$1" "$2" <<'PYTHON'
import hashlib, pathlib, sys
p = pathlib.Path(sys.argv[1])
if not p.is_file():
    sys.exit(1)
h = hashlib.sha256()
with p.open('rb') as f:
    for block in iter(lambda: f.read(16 * 1024 * 1024), b''):
        h.update(block)
sys.exit(0 if h.hexdigest() == sys.argv[2] else 1)
PYTHON
}

fetch_checked() {
  local url=$1 dest=$2 sha=$3
  mkdir -p -- "$(dirname -- "$dest")"
  if [[ -f $dest ]]; then
    say "Checking $(basename -- "$dest")"
    sha_ok "$dest" "$sha" && return
    die "Checksum mismatch: $dest. Move the invalid file aside and rerun; existing files are never overwritten."
  fi
  if sha_ok "$dest.part" "$sha"; then mv -- "$dest.part" "$dest"; return; fi
  say "Downloading $(basename -- "$dest") (resumes .part files)"
  curl --fail --location --retry 6 --retry-delay 3 --connect-timeout 30 \
    --speed-time 120 --speed-limit 1024 --continue-at - --output "$dest.part" "$url"
  sha_ok "$dest.part" "$sha" || die "Checksum mismatch: $dest.part. Move it aside and rerun."
  mv -- "$dest.part" "$dest"
}

clone_pinned() {
  local url=$1 dest=$2 revision=$3 head
  if [[ ! -e $dest ]]; then
    git init -q "$dest"
    git -C "$dest" remote add origin "$url"
  fi
  [[ -d $dest/.git ]] || die "Not an installer-managed Git repository: $dest"
  [[ $(git -C "$dest" remote get-url origin) == "$url" ]] || die "Unexpected Git remote in $dest."
  head=$(git -C "$dest" rev-parse --verify HEAD 2>/dev/null || true)
  if [[ -n $head ]]; then
    [[ $head == "$revision" ]] || die "Different revision already installed in $dest; use a new --root."
    if ! git -C "$dest" diff --quiet || ! git -C "$dest" diff --cached --quiet; then
      die "Local edits in $dest; preserve them before reinstalling."
    fi
  else
    git -C "$dest" fetch --depth 1 origin "$revision"
    git -C "$dest" checkout --detach FETCH_HEAD
  fi
}

gpu_check() {
  "$PY" - <<'PYTHON'
import torch
if not torch.cuda.is_available():
    raise SystemExit('CUDA is unavailable in the isolated environment.')
p = torch.cuda.get_device_properties(0)
print(f'GPU: {p.name}, {p.total_memory / 2**30:.1f}GiB; torch {torch.__version__}; CUDA {torch.version.cuda}')
if '5090' not in p.name or p.total_memory < 30 * 2**30:
    raise SystemExit('This preset targets an RTX 5090 with 32GB VRAM.')
if torch.version.cuda != '13.0':
    raise SystemExit('Expected the pinned CUDA 13.0 PyTorch build.')
# Execute a real CUDA kernel; importing torch alone does not verify Blackwell support.
x = torch.ones((32, 32), device='cuda', dtype=torch.bfloat16)
assert (x @ x).float().sum().item() == 32768
torch.cuda.synchronize()
PYTHON
}

model_rows() {
  "$HASH_PY" - "$MANIFEST" "$TURBO" <<'PYTHON'
import json, sys
for m in json.load(open(sys.argv[1]))['models']:
    if m['required_for_saved_normal_path'] or sys.argv[2] == '1':
        print('\t'.join((m['download_url'], m['comfyui_destination'], m['sha256'])))
PYTHON
}

if [[ $COMMAND == install ]]; then
  system_dependencies
  HASH_PY=python3
  if [[ -d $ROOT && ! -f $ROOT/.genjutsu-h3 && -n $(ls -A -- "$ROOT") ]]; then
    die "Directory is not managed by this installer: $ROOT. Choose an empty --root."
  fi
  mkdir -p -- "$ROOT/assets"
  touch "$ROOT/.genjutsu-h3"
  # Prefer the checked-in files; also support copying only this script to the rental.
  for asset in download-manifest.json runcomfy-original.workflow.json; do
    local_asset="$SCRIPT_DIR/artifacts/comfyui/minimax-h3-character-swap/$asset"
    if [[ $asset == download-manifest.json ]]; then expected=$MANIFEST_SHA; else expected=$WORKFLOW_SHA; fi
    if [[ -f $local_asset && ! -e $ROOT/assets/$asset ]]; then
      sha_ok "$local_asset" "$expected" || die "Changed source asset: $local_asset"
      cp -- "$local_asset" "$ROOT/assets/$asset"
    fi
    fetch_checked "$ASSET_BASE/$asset" "$ROOT/assets/$asset" "$expected"
  done
  python3 - "$MANIFEST" "$COMFY" "$ROOT" "$TURBO" <<'PYTHON'
import json, pathlib, shutil, sys
manifest, comfy, root, turbo = sys.argv[1:]
missing = 0
for m in json.load(open(manifest))['models']:
    if not m['required_for_saved_normal_path'] and turbo != '1':
        continue
    p = pathlib.Path(comfy) / m['comfyui_destination']
    part = pathlib.Path(str(p) + '.part')
    have = p.stat().st_size if p.exists() else (part.stat().st_size if part.exists() else 0)
    missing += max(0, m['size_bytes'] - have)
free = shutil.disk_usage(root).free
needed = missing + 30_000_000_000  # CUDA wheels, environment, caches, output headroom.
print(f'Disk: {free / 1e9:.1f}GB free; {needed / 1e9:.1f}GB needed including installation headroom.')
if free < needed:
    raise SystemExit('Insufficient disk space. Increase the persistent disk or choose another --root.')
PYTHON
  clone_pinned https://github.com/Comfy-Org/ComfyUI.git "$COMFY" "$COMFY_REV"
  while IFS=$'\t' read -r package url revision; do
    clone_pinned "$url" "$COMFY/custom_nodes/$package" "$revision"
  done < <(python3 - "$MANIFEST" "$UNLOAD_REV" <<'PYTHON'
import json, sys
for p in json.load(open(sys.argv[1]))['custom_node_packages']:
    print('\t'.join((p['id'], p['repository'], p.get('workflow_revision', sys.argv[2]))))
PYTHON
  )
  [[ -x $PY ]] || python3 -m venv "$ROOT/venv"
  printf 'torch==2.10.0\ntorchvision==0.25.0\ntorchaudio==2.10.0\n' > "$ROOT/torch-constraints.txt"
  say 'Installing isolated Python environment'
  "$PY" -m pip install --no-cache-dir --upgrade pip wheel setuptools
  "$PY" -m pip install --no-cache-dir torch==2.10.0 torchvision==0.25.0 torchaudio==2.10.0 \
    --index-url https://download.pytorch.org/whl/cu130
  "$PY" -m pip install --no-cache-dir -c "$ROOT/torch-constraints.txt" -r "$COMFY/requirements.txt"
  for requirements in "$COMFY"/custom_nodes/*/requirements.txt; do
    [[ -f $requirements ]] || continue
    "$PY" -m pip install --no-cache-dir -c "$ROOT/torch-constraints.txt" -r "$requirements"
  done
  "$PY" -m pip check
  "$PY" -c 'import cv2, av; print("OpenCV and video decoding imports OK")'
  gpu_check
  while IFS=$'\t' read -r url relative sha; do
    fetch_checked "$url" "$COMFY/$relative" "$sha"
  done < <(model_rows)
  "$PY" - "$WORKFLOW" "$COMFY/user/default/workflows" <<'PYTHON'
import copy, json, pathlib, sys
source, target = map(pathlib.Path, sys.argv[1:])
target.mkdir(parents=True, exist_ok=True)
original = target / 'runcomfy-original.workflow.json'
if not original.exists():
    original.write_bytes(source.read_bytes())
workflow = copy.deepcopy(json.loads(source.read_text()))
node = next(n for n in workflow['nodes'] if n['id'] == 501)
assert node['type'] == 'ResolutionSelector' and node['widgets_values'][1] == 1
node['widgets_values'][1] = 0.5
# Give the copy its own identity, so editing it does not replace the original.
import uuid
workflow['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'genjutsu:h3-5090-0.5mp'))
preset = target / 'h3-5090-0.5mp.workflow.json'
if not preset.exists():
    preset.write_text(json.dumps(workflow, indent=2) + '\n')
else:
    print(f'Preserving existing preset: {preset}')
PYTHON
  touch "$ROOT/.install-complete"
  say 'Installation complete. Models verified; no generation submitted.'
  printf 'Start: bash %q start --root %q --port %q --listen %q\n' "$0" "$ROOT" "$PORT" "$LISTEN"
  printf 'Upload your photo/video in ComfyUI, then load h3-5090-0.5mp.workflow.json.\n'
  exit 0
fi

[[ -f $ROOT/.install-complete && -x $PY && -f $COMFY/main.py && -f $MANIFEST ]] || die 'Finish install first, using the same --root.'
HASH_PY=$PY
if [[ $COMMAND == start ]]; then
  gpu_check
  say "Starting ComfyUI on $LISTEN:$PORT; Ctrl-C stops the server"
  cd -- "$COMFY"
  # Keep native dynamic offloading. Do not force --gpu-only/--highvram on 32GB.
  exec "$PY" -u main.py --listen "$LISTEN" --port "$PORT" --disable-auto-launch
fi

say 'Checking CUDA, model hashes, dependencies and running workflow nodes'
gpu_check
"$PY" -m pip check
sha_ok "$MANIFEST" "$MANIFEST_SHA" || die 'Manifest checksum mismatch.'
while IFS=$'\t' read -r url relative sha; do
  say "Checking $relative"
  sha_ok "$COMFY/$relative" "$sha" || die "Missing/corrupt model: $COMFY/$relative"
done < <(model_rows)
"$PY" - "$MANIFEST" "$PORT" "$LISTEN" <<'PYTHON'
import json, sys, urllib.error, urllib.request
manifest = json.load(open(sys.argv[1]))
host = {'0.0.0.0': '127.0.0.1', '::': '::1'}.get(sys.argv[3], sys.argv[3])
if ':' in host:
    host = '[' + host + ']'
try:
    with urllib.request.urlopen(f'http://{host}:{sys.argv[2]}/object_info', timeout=60) as response:
        info = json.load(response)
except (OSError, urllib.error.URLError) as e:
    raise SystemExit(f'Cannot reach ComfyUI. Run start in another SSH terminal first. {e}')
frontend_only = {'Note', 'Fast Groups Muter (rgthree)'}
missing = sorted(set(manifest['nodes_by_type']) - frontend_only - set(info))
if missing:
    raise SystemExit('Missing backend nodes (inspect ComfyUI startup output): ' + ', '.join(missing))
for m in manifest['models']:
    if not m['required_for_saved_normal_path']:
        continue
    required = info[m['node_type']]['input']['required']
    key = {'UNETLoader': 'unet_name', 'CLIPLoader': 'clip_name',
           'VAELoader': 'vae_name', 'CheckpointLoaderSimple': 'ckpt_name'}[m['node_type']]
    if m['filename'] not in required[key][0]:
        raise SystemExit('Model absent from ComfyUI loader options: ' + m['filename'])
print('All required backend node types and model loader entries are available.')
print('Upload/select your own media and inspect the SAM3 mask before your first render.')
PYTHON
