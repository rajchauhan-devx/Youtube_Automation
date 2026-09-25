"""Loopback multipart adapter with one owned, cancellable worker process at a time."""
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time

gate = threading.Lock()
processes = {}
state_lock = threading.Lock()
cancelled = {}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        content = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        try:
            self.wfile.write(content)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self.reply(200, {"provider": "whisperx", "version": "3.8.6-adapter-1", "configured": bool(os.environ.get("ALIGNMENT_ASR_MODEL")), "device": os.environ.get("ALIGNMENT_DEVICE", "cpu")})

    def do_POST(self):
        request_id = self.headers.get("X-Request-ID", "")
        if not request_id or len(request_id) > 128:
            return self.reply(422, {"error": "Missing request ID"})
        if self.path == "/cancel":
            with state_lock:
                cutoff = time.monotonic() - 600
                for key in list(cancelled):
                    if cancelled[key] < cutoff:
                        cancelled.pop(key)
                if len(cancelled) >= 1024:
                    cancelled.pop(next(iter(cancelled)))
                cancelled[request_id] = time.monotonic()
                process = processes.get(request_id)
                if process and process.poll() is None:
                    process.kill()
            return self.reply(200, {"cancelled": True})
        if self.path != "/align":
            return self.reply(404, {"error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.reply(422, {"error": "Invalid payload length"})
        if length < 1 or length > 260 * 1024 * 1024:
            return self.reply(413, {"error": "Invalid audio payload size"})
        if not gate.acquire(blocking=False):
            return self.reply(409, {"error": "Alignment worker busy"})
        try:
            with state_lock:
                if request_id in cancelled:
                    return self.reply(409, {"error": "Alignment cancelled before start"})
            body = self.rfile.read(length)
            message = BytesParser(policy=policy.default).parsebytes(("Content-Type: " + self.headers["Content-Type"] + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + body)
            fields = {part.get_param("name", header="content-disposition"): part.get_payload(decode=True) for part in message.iter_parts()}
            with tempfile.TemporaryDirectory(prefix="tubeflow-alignment-") as folder:
                directory = Path(folder)
                (directory / "audio").write_bytes(fields["audio"])
                data = {key: fields[key].decode("utf-8") for key in ("text", "language", "audioHash", "narrationHash")}
                data["audioPath"] = str(directory / "audio")
                (directory / "request.json").write_text(json.dumps(data), encoding="utf-8")
                with state_lock:
                    if request_id in cancelled:
                        return self.reply(409, {"error": "Alignment cancelled before start"})
                    process = subprocess.Popen([sys.executable, str(Path(__file__).with_name("worker.py")), str(directory / "request.json"), str(directory / "result.json")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                    processes[request_id] = process
                try:
                    process.wait(timeout=int(os.environ.get("ALIGNMENT_TIMEOUT_SECONDS", "300")))
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                if process.returncode:
                    return self.reply(422, {"error": "Alignment failed or was cancelled; verify model installation, language support and narration correspondence"})
                self.reply(200, json.loads((directory / "result.json").read_text(encoding="utf-8")))
        except (ValueError, KeyError, OSError):
            self.reply(422, {"error": "Invalid alignment request or worker configuration"})
        finally:
            with state_lock:
                processes.pop(request_id, None)
                cancelled.pop(request_id, None)
            gate.release()

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("ALIGNMENT_PORT", "8765"))), Handler).serve_forever()
