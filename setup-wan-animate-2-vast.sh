#!/usr/bin/env bash
# Run as root on a fresh CUDA 13 Linux rental, from a copy of this repository.
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${WAN_ROOT:-/workspace/wan-animate-2}"
COMFY_REV=384577510969e0ed59506f8eb5fcf6e6df15a3d1
mkdir -p "$ROOT" "$ROOT/logs" "$ROOT/bin" "$ROOT/private"
chmod 700 "$ROOT/private"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3-venv python3-dev git ffmpeg curl build-essential tmux ca-certificates
python3 -m venv "$ROOT/venv"
PY="$ROOT/venv/bin/python"
if [ ! -d "$ROOT/ComfyUI/.git" ]; then
  git init "$ROOT/ComfyUI"
  git -C "$ROOT/ComfyUI" remote add origin https://github.com/comfyanonymous/ComfyUI.git
fi
if ! git -C "$ROOT/ComfyUI" cat-file -e "$COMFY_REV^{commit}" 2>/dev/null; then
  git -C "$ROOT/ComfyUI" fetch --depth 1 origin "$COMFY_REV"
fi
git -C "$ROOT/ComfyUI" checkout --detach "$COMFY_REV"
"$PY" -m pip install torch torchvision torchaudio --index-url "${WAN_TORCH_INDEX:-https://download.pytorch.org/whl/cu130}"
"$PY" -m pip install -r "$ROOT/ComfyUI/requirements.txt" huggingface_hub
export WAN_ROOT="$ROOT" WAN_SOURCE="$SOURCE_DIR" HF_XET_CHUNK_CACHE_SIZE_BYTES=0
"$PY" -u - <<'PY'
import concurrent.futures, hashlib, json, os, secrets, shutil
from pathlib import Path
from huggingface_hub import hf_hub_download
root, source = Path(os.environ['WAN_ROOT']), Path(os.environ['WAN_SOURCE'])
artifact = source / 'artifacts/comfyui/wan-animate-2-bf16'
manifest = json.loads((artifact / 'download-manifest.json').read_text())
workflow = artifact / manifest['workflow_file']
if hashlib.sha256(workflow.read_bytes()).hexdigest() != manifest['workflow_sha256']:
    raise RuntimeError('Workflow checksum does not match the manifest')
def download(item):
    relative = item['destination'].removeprefix('models/')
    path = Path(hf_hub_download(repo_id=manifest['model_repository'], filename=relative,
        revision=manifest['model_revision'], local_dir=root/'ComfyUI/models'))
    digest = hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
    if path.stat().st_size != item['size_bytes'] or digest != item['sha256']:
        raise RuntimeError(f'Checksum failed: {relative}')
    print(f'Verified {relative}', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(download, manifest['models']))
workflows = root/'ComfyUI/user/default/workflows'
workflows.mkdir(parents=True, exist_ok=True)
shutil.copy2(workflow, workflows/manifest['workflow_file'])
shutil.copy2(source/'scripts/comfy-token-gateway.py', root/'comfy-token-gateway.py')
secret = root/'private/access.json'
if not secret.exists():
    secret.write_text(json.dumps({'access_token': secrets.token_urlsafe(32), 'cookie_secret': secrets.token_hex(32)}))
secret.chmod(0o600)
PY
CF_SHA=1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872
if ! echo "$CF_SHA  $ROOT/bin/cloudflared" | sha256sum -c --status 2>/dev/null; then
  curl -fL --retry 3 https://github.com/cloudflare/cloudflared/releases/download/2026.10.7/cloudflared-linux-amd64 -o "$ROOT/bin/cloudflared.download"
  echo "$CF_SHA  $ROOT/bin/cloudflared.download" | sha256sum -c -
  mv "$ROOT/bin/cloudflared.download" "$ROOT/bin/cloudflared"
fi
chmod 755 "$ROOT/bin/cloudflared"
mkdir -p "$ROOT/ComfyUI/input" "$ROOT/samples"
SAMPLE_BASE=https://raw.githubusercontent.com/Comfy-Org/workflow_templates/cdccb2ee7a7cd0baee4630cf7186283a98ab408f/input
curl -fL --retry 3 "$SAMPLE_BASE/pink_hair_mech_arms_ref.png" -o "$ROOT/ComfyUI/input/pink_hair_mech_arms_ref.png"
curl -fL --retry 3 "$SAMPLE_BASE/street_dance_drive.mp4" -o "$ROOT/samples/street_dance_drive.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$ROOT/samples/street_dance_drive.mp4" -t 2 -vf fps=24 -an -c:v libx264 -crf 18 "$ROOT/ComfyUI/input/street_dance_drive.mp4"
cp "$SOURCE_DIR/scripts/start-wan-animate-2.sh" "$ROOT/start-services.sh"
"$PY" -m pip freeze > "$ROOT/runtime-requirements.txt"
touch "$ROOT/.installed"
WAN_ROOT="$ROOT" bash "$ROOT/start-services.sh"
