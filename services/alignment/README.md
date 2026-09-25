# Isolated alignment service

Use a separate Python 3.11 or 3.12 environment. Do not install these dependencies
into Node, Chatterbox, or ComfyUI environments. `uv.lock` pins the complete resolved
dependency graph with distribution hashes (resolved with uv 0.8.22). Resolution
is not runtime qualification: test the installed CPU/CUDA stack and language
models on the deployment host. No ML dependencies or weights were installed by
the application implementation.

```powershell
uv sync --frozen --project services/alignment --python 3.12
$env:ALIGNMENT_ASR_MODEL = '<installed Whisper-compatible ASR model or path>'
$env:ALIGNMENT_DEVICE = 'cpu'
services/alignment/.venv/Scripts/python services/alignment/server.py
```

Install uv 0.8.22 separately if unavailable. `requirements.txt` is only the direct
dependency pin for tooling interoperability; use the frozen lock for reproducible
installs. Do not update the lock in an existing TTS or ComfyUI environment.

Set `EDITING_ALIGNMENT_URL=http://127.0.0.1:8765` on the Node server. CPU is the
conservative default because other applications own the GPU. CUDA deployments
must coordinate GPU ownership with ComfyUI/TTS. One alignment subprocess runs at
a time. The caller sends multipart audio plus text/language/hash identity and
`X-Request-ID`; cancellation kills only the subprocess with that identity.

The worker transcribes first and rejects narration with low correspondence. It
then aligns the supplied original text, preserving repeated occurrences and
UTF-16 offsets. Missing/low-confidence words cause a caller-visible fallback,
never invented word timestamps. Hindi and mixed-language accuracy still need
human-annotated audio qualification on the installed language models.

Adapter-only tests require no WhisperX installation or model downloads:

```powershell
py -3.12 -m unittest discover -s services/alignment -p test_adapter.py -v
```

These check repeated Hindi/code-switched tokens, UTF-16 offsets, omitted words,
low-confidence rejection and cancellation before a worker starts. They do not
measure acoustic alignment accuracy.

Upstream: https://github.com/m-bain/whisperX/tree/v3.8.6
