#!/usr/bin/env python3
"""Back up one completed ComfyUI job, verify its videos, then stop its rental."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)


class Watcher:
    def __init__(self, config, allow_stop=True):
        self.config = config
        self.allow_stop = allow_stop
        self.destination = Path(config["destination"])
        self.state_path = Path(config["state_path"])
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {}
        self.state.update(job_id=config["job_id"], instance_id=config["instance_id"])

    def save(self, phase, **fields):
        self.state.update(phase=phase, updated_at=now(), **fields)
        atomic_json(self.state_path, self.state)
        if self.destination.exists():
            atomic_json(self.destination / "download-receipt.json", self.state)
        print(json.dumps({"time": now(), "phase": phase, **fields}), flush=True)

    def remote(self, script):
        command = shlex.quote(self.config["remote_python"]) + " -c " + shlex.quote(script)
        result = subprocess.run([
            "/usr/bin/ssh", "-F", self.config["ssh_config"],
            "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15",
            "-o", "ServerAliveCountMax=3", self.config["ssh_host"], command,
        ], capture_output=True, text=True, timeout=180)
        if result.returncode:
            raise RuntimeError("SSH inspection failed; will retry without stopping")
        marker = "WAN_RESULT="
        lines = [line[len(marker):] for line in result.stdout.splitlines() if line.startswith(marker)]
        if not lines:
            raise RuntimeError("SSH inspection returned no job state")
        return json.loads(lines[-1])

    def history(self):
        job = repr(self.config["job_id"])
        return self.remote(
            "import json,urllib.request; "
            f"j={job}; h=json.load(urllib.request.urlopen('http://127.0.0.1:8188/history/'+j)); "
            "print('WAN_RESULT='+json.dumps(h.get(j)))"
        )

    def remote_files(self, history):
        files = []
        for node, output in history.get("outputs", {}).items():
            for values in output.values():
                if not isinstance(values, list):
                    continue
                for item in values:
                    if (isinstance(item, dict) and item.get("type") == "output"
                            and Path(item.get("filename", "")).suffix.lower() in {".mp4", ".webm", ".mov", ".mkv"}):
                        files.append({"node": node, "filename": item["filename"], "subfolder": item.get("subfolder", ""),
                                      "expected_file_frames": item.get("metadata", {}).get("frame_count")})
        if not files:
            raise RuntimeError("Completed job has no saved video; instance will remain running")
        payload = repr(json.dumps(files))
        root = repr(self.config["remote_output"])
        return self.remote(f"""
import json,hashlib,subprocess
from pathlib import Path
root=Path({root}).resolve()
files=json.loads({payload})
for item in files:
    path=(root/item['subfolder']/item['filename']).resolve()
    if not path.is_relative_to(root) or not path.is_file(): raise ValueError('Unsafe or missing output')
    item.update(remote_path=str(path),size_bytes=path.stat().st_size,sha256=hashlib.file_digest(path.open('rb'),'sha256').hexdigest())
print('WAN_RESULT='+json.dumps(files))
""")

    def verify(self, path, item):
        if not path.is_file() or path.stat().st_size != item["size_bytes"]:
            raise RuntimeError("Downloaded size does not match server")
        with path.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != item["sha256"]:
                raise RuntimeError("Downloaded SHA-256 does not match server")
        probe = subprocess.run([
            self.config["ffprobe"], "-v", "error", "-count_frames", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,nb_read_frames,avg_frame_rate:format=duration",
            "-of", "json", str(path),
        ], capture_output=True, text=True, timeout=600, check=True)
        info = json.loads(probe.stdout)
        video = info["streams"][0]
        if min(video["width"], video["height"]) <= 0 or float(info["format"]["duration"]) <= 0:
            raise RuntimeError("Downloaded video metadata is invalid")
        expected = item.get("expected_file_frames")
        if expected and int(video["nb_read_frames"]) != expected:
            raise RuntimeError("Downloaded frame count does not match server metadata; preserving instance")
        subprocess.run([
            self.config["ffmpeg"], "-hide_banner", "-v", "error", "-xerror",
            "-i", str(path), "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-",
        ], capture_output=True, timeout=600, check=True)
        return info

    def instance(self):
        result = subprocess.run([self.config["vastai"], "show", "instances", "--raw"],
                                capture_output=True, text=True, timeout=120, check=True)
        instances = json.loads(result.stdout)
        return next((x for x in instances if int(x["id"]) == int(self.config["instance_id"])), None)

    def stop_and_confirm(self):
        if not self.state.get("verification_complete") or not self.state.get("files"):
            raise RuntimeError("Stop requires a durable receipt for verified local videos")
        instance = self.instance()
        if not instance:
            raise RuntimeError("Rental missing from account; cannot confirm stopped state")
        if instance.get("intended_status") == "stopped" and instance.get("actual_status") in {"exited", "stopped"}:
            self.save("stopped", stopped_verified_at=now(), actual_status=instance["actual_status"])
            return True
        if instance.get("intended_status") != "stopped":
            queue = self.remote("import json,urllib.request; q=json.load(urllib.request.urlopen('http://127.0.0.1:8188/queue')); print('WAN_RESULT='+json.dumps({k:[x[1] for x in q[k]] for k in ('queue_running','queue_pending')}))")
            if queue["queue_running"] or queue["queue_pending"]:
                self.save("verified_waiting_for_idle", other_jobs=queue)
                return False
            # This branch is reachable only after every local video passed all checks.
            subprocess.run([self.config["vastai"], "stop", "instance", str(self.config["instance_id"]), "--raw"],
                           capture_output=True, timeout=120, check=True)
            self.save("stop_requested", stop_requested_at=now())
        for _ in range(12):
            time.sleep(5)
            instance = self.instance()
            if instance and instance.get("intended_status") == "stopped" and instance.get("actual_status") in {"exited", "stopped"}:
                self.save("stopped", stopped_verified_at=now(), actual_status=instance["actual_status"])
                return True
        self.save("stop_requested", confirmation_pending=True)
        return False

    def tick(self):
        if self.state.get("phase") == "stopped":
            return True
        self.destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Exercise Desktop access before waiting for the generation.
        probe = self.destination / ".watcher-write-check"
        probe.write_text("ready")
        probe.unlink()
        if self.state.get("verification_complete"):
            for item in self.state["files"]:
                self.verify(Path(item["local_path"]), item)
            return self.stop_and_confirm() if self.allow_stop else True
        history = self.history()
        if history is None:
            self.save("waiting_for_generation")
            return False
        if history.get("status", {}).get("status_str") != "success":
            self.save("generation_failed_preserving_instance", generation_status=history.get("status", {}).get("status_str"))
            return False
        self.save("downloading")
        atomic_json(self.destination / "generation-history.json", history)
        timing_path = repr(str(Path(self.config["remote_output"]).parent.parent / "logs" / ("monitor-" + self.config["job_id"]) / "report.json"))
        try:
            timing = self.remote(f"from pathlib import Path; import json; p=Path({timing_path}); print('WAN_RESULT='+json.dumps(json.loads(p.read_text()) if p.exists() else None))")
            if timing:
                atomic_json(self.destination / "step-timings.json", timing)
        except Exception:
            pass  # Timing telemetry must not block a verified backup.
        files = self.remote_files(history)
        staging = self.state_path.parent / "downloads"
        staging.mkdir(exist_ok=True, mode=0o700)
        for item in files:
            safe_node = re.sub(r"[^a-zA-Z0-9_-]", "_", item["node"])
            prefix = "generation" if item["node"] == "246" else "comparison" if item["node"] == "292" else "output-" + safe_node
            safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", Path(item["filename"]).name)
            name = prefix + "-" + safe_name
            final = self.destination / name
            temporary = staging / (name + ".part")
            if final.exists():
                try:
                    item["probe"] = self.verify(final, item)
                    item["local_path"] = str(final)
                    continue
                except Exception:
                    pass
            subprocess.run([
                "/usr/bin/scp", "-F", self.config["ssh_config"],
                self.config["ssh_host"] + ":" + item["remote_path"], str(temporary),
            ], capture_output=True, timeout=1200, check=True)
            item["probe"] = self.verify(temporary, item)
            with temporary.open("rb") as stream:
                os.fsync(stream.fileno())
            temporary.chmod(0o600)
            os.replace(temporary, final)
            item["local_path"] = str(final)
        expected = self.config.get("expected_frames")
        if expected and max(int(item["probe"]["streams"][0]["nb_read_frames"]) for item in files) < expected:
            raise RuntimeError("No full-length generated video found; preserving instance")
        primary = {}
        for node, label in (("246", "generation"), ("292", "comparison")):
            candidates = [item for item in files if item["node"] == node]
            if candidates:
                best = max(candidates, key=lambda item: int(item["probe"]["streams"][0]["nb_read_frames"]))
                alias = self.destination / (label + Path(best["local_path"]).suffix)
                temporary = alias.with_suffix(alias.suffix + ".link")
                temporary.unlink(missing_ok=True)
                os.link(best["local_path"], temporary)
                os.replace(temporary, alias)
                primary[label] = str(alias)
        self.save("verified", verification_complete=True, verified_at=now(), files=files, primary_files=primary)
        return self.stop_and_confirm() if self.allow_stop else True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--no-stop", action="store_true")
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    lock = Path(config["state_path"]).with_suffix(".lock").open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    watcher = Watcher(config, allow_stop=not args.no_stop)
    while True:
        try:
            if watcher.tick():
                return
        except Exception as error:
            # No secrets, command output, or provider API responses enter the log.
            watcher.save("retrying", error_type=type(error).__name__, error=str(error)[:300])
        if args.once:
            return
        time.sleep(config.get("poll_seconds", 60))


if __name__ == "__main__":
    main()
