# Complete setup on another PC (human and AI runbook)

Audited against this repository and the original Windows installation on 2026-09-25. Commands below use **Windows PowerShell**, from the repository root unless stated otherwise. This is a setup guide, not an automatic installer. A fresh-PC installation has not been executed as part of writing this guide.

## 1. Why cloning did not download the models

`git clone` retrieves the application source and dependency manifests. It does **not** install Node/Python dependencies, download model weights, recreate Python environments, copy your projects, or copy other applications from the old PC. `npm ci` also does not install the AI models.

The repository explicitly ignores `ComfyUI/`, `artifacts/`, Python virtual environments, `.env`, and much of `server/data/`. Other models live outside the repository in the Windows user profile. This is not a Git LFS or submodule download problem.

**The AI presenter requires a separate custom application, `MuseTalk-Demo`. Its `app/` wrapper is not included here. A clone of upstream MuseTalk alone cannot replace it. Transfer that application from the old PC or obtain its matching source before claiming presenter setup is complete.** The rest of TubeFlow can be installed without it.

### Locations found on the original PC

These are an inventory, not paths to paste into the new PC's configuration. `<old-repo>` was `C:/Users/zrajc/OneDrive/Desktop/Youtube_Automation/Youtube_Automation`.

| Component | Original location | Restore method |
| --- | --- | --- |
| ComfyUI engine | `<old-repo>/ComfyUI` | Separate Git clone; ignored by the main repository |
| ComfyUI Python | `<old-repo>/artifacts/comfy-venv/Scripts/python.exe` | Recreate with Python 3.12; do not copy the venv |
| SDXL image checkpoint | `<old-repo>/ComfyUI/models/checkpoints/juggernautXL_ragnarok.safetensors` | Transfer this file or download the publisher's checkpoint |
| ACE-Step music weights | `<old-repo>/ComfyUI/models/{diffusion_models,text_encoders,vae}` | Included downloader, section 7 |
| Chatterbox Python | `<old-repo>/server/chatterbox/.venv` | `npm run setup:tts` |
| Chatterbox weights | `C:/Users/zrajc/.cache/huggingface/hub/models--ResembleAI--chatterbox` | Setup downloader or complete cache transfer |
| Chatterbox tokenizer | `<old-repo>/server/data/model-cache/pkuseg` | Setup downloader or transfer |
| Ollama weights | `C:/Users/zrajc/.ollama/models` | `ollama pull qwen3.5:4b` or transfer complete model store |
| Custom presenter application | `C:/Users/zrajc/OneDrive/Documents/MuseTalk-Demo` | Transfer application, including `app/`, nested engine, weights, and avatars |
| Presenter Python | `C:/Users/zrajc/miniconda3/envs/musetalk-demo/python.exe` (default lookup) | Recreate Conda environment and verify on destination |
| Presenter weights | `<MuseTalk-Demo>/MuseTalk/models` | Transfer or use its `download_models.py` |
| Prepared presenter avatars | `<MuseTalk-Demo>/avatars/prepared` | Transfer or prepare again in the separate lab |
| Saved projects, voices, media | `<old-repo>/server/data` and browser local storage | Optional private data migration; section 11 |

The inspected ComfyUI folder was an ordinary folder containing a separate Git checkout; no `extra_model_paths.yaml` was present. On another installation also inspect that YAML file, directory junctions, and `HF_HOME`, `HF_HUB_CACHE`, and `OLLAMA_MODELS` overrides. The old Hugging Face cache contained OmniVoice and LivePortrait too; neither is required for the default Chatterbox/MuseTalk setup described here.

## 2. Instructions to give an AI on the new PC

Copy this prompt into your coding AI with this repository open:

```text
Set up this repository on this Windows PC using docs/NEW_PC_SETUP.md.
Perform the installation, not just an explanation. Inspect the current source,
hardware, free disk space, installed tools, and existing configuration first.
Use the current checkout and preserve existing data and working installations.
Install the frontend/backend, Ollama qwen3.5:4b, Chatterbox Multilingual V3,
ComfyUI with the documented SDXL checkpoint, and ACE-Step local music.
Configure server/.env using absolute paths for THIS PC. Use separate Python
environments. Download/restore and verify the weights; npm install is insufficient.
Enable and verify local AI editing after basic generation works.
For the presenter, inspect whether the custom MuseTalk-Demo app or a transfer
bundle is available. If absent, report the exact missing dependency and continue
with all independent setup; do not substitute a bare upstream MuseTalk clone.
Install optional WhisperX only if requested for accurate word alignment.
Do not overwrite secrets or existing environments. Do not print credentials.
Check every external command's exit code and actual readiness, since some bundled
setup scripts can print completion after a failed command. Test one real output
per installed feature, sequentially to avoid GPU contention. Do not upload to
YouTube as a setup test. Finish with a local setup report listing versions, paths,
downloaded models, successful checks, skipped/blocked features and start commands.
```

For a full presenter migration, provide the AI with the transferred `MuseTalk-Demo` directory as well as this repository. API credentials and Google login, if needed, are separate user inputs.

## 3. Prerequisites and directory choice

Use a short writable location such as `C:/AI/TubeFlow` or `D:/AI/TubeFlow`. This avoids tying the setup to the old username or OneDrive. Examples below use `C:/AI/TubeFlow`; replace it consistently.

Install the following before running the commands:

| Tool | Purpose / version guidance |
| --- | --- |
| Git | Application, ComfyUI, and Chatterbox source dependency |
| Node.js + npm | Use Node 24.x; the existing setup notes record Node 24.16.0 and npm 11.13.0. Retain the committed lockfiles. |
| Python 3.10 x64 | Chatterbox; the bootstrap script specifically looks for 3.10 |
| Python 3.12 x64 | Separate ComfyUI environment and optional alignment environment |
| FFmpeg + ffprobe on PATH | Audio conversion, subtitles, and MP4 rendering; both executables required |
| NVIDIA driver | CUDA acceleration for the documented local GPU setup; verify with `nvidia-smi` |
| Edge or Chrome | Chromium rendering for enhanced editing |
| Ollama for Windows | Local script and editing models |
| Miniconda | Presenter only; separate `musetalk-demo` environment |
| uv 0.8.22 | Optional frozen alignment installation only |

Use official installers: [Node](https://nodejs.org/en/download), [Python](https://www.python.org/downloads/windows/), [Git](https://git-scm.com/downloads/win), [FFmpeg download options](https://ffmpeg.org/download.html), and [Ollama](https://ollama.com/download/windows). Reopen PowerShell after changing PATH.

The old machine's documented working baseline was an RTX 3050 Laptop GPU with 6 GB VRAM and 16 GB RAM. It ran GPU tasks sequentially. This is an observation, not a guaranteed minimum for every feature. Plan substantial SSD space: the inspected image checkpoint was 6.62 GiB and music weights totaled about 9.33 GiB, before Ollama, Chatterbox, MuseTalk, Python packages, caches, and generated videos. Reserving at least 60 GB initially is a planning allowance, not a measured full-install size. Inspect available space before downloading.

For a non-NVIDIA PC, the web app and CPU Chatterbox can still be installed. ComfyUI acceleration needs a hardware-specific installation, and this custom FP16 presenter has not been qualified for CPU/AMD/Mac. Do not report those features as working without real tests.

```powershell
git --version
node --version
npm --version
py -3.10 --version
py -3.12 --version
ffmpeg -version
ffprobe -version
nvidia-smi
```

Run each command separately and stop to resolve its failure before its dependent steps. In Windows PowerShell, `$ErrorActionPreference = 'Stop'` does not by itself make every native program's nonzero exit code throw. Check `$LASTEXITCODE` immediately after installers, Git, npm, Python, and Ollama commands.

## 4. Clone, install packages, and configure the backend

If already cloned, use that checkout and skip the clone. On a fresh machine:

```powershell
New-Item -ItemType Directory -Force C:/AI | Out-Null
git clone https://github.com/rajchauhan-devx/Youtube_Automation.git C:/AI/TubeFlow
Set-Location C:/AI/TubeFlow
git rev-parse HEAD
npm ci
npm ci --prefix server
if (-not (Test-Path server/.env)) {
    Copy-Item .env.example server/.env
}
```

**Use `server/.env`.** The normal `npm run dev` command launches npm in `server/`, and `server/src/index.ts` loads `dotenv/config` from that working directory. A root `.env` alone does not configure the normal backend startup. Use the documented npm commands rather than starting `server/src/index.ts` from an arbitrary folder.

Merge these values into `server/.env` without creating duplicate keys. Paths must be real absolute paths on the new machine. Forward slashes work on Windows. Dotenv does not run PowerShell or expand `$env:USERPROFILE`, `<repo>`, or `~` in these examples.

```dotenv
HOST=127.0.0.1
PORT=3001
CORS_ORIGIN=http://localhost:5173

TTS_PROVIDER=chatterbox
CHATTERBOX_URL=http://127.0.0.1:8880
CHATTERBOX_HOST=127.0.0.1
CHATTERBOX_PORT=8880
CHATTERBOX_DEVICE=auto
CHATTERBOX_T3_MODEL=v3
CHATTERBOX_TIMEOUT_MS=900000
CHATTERBOX_MAX_CHUNK_CHARS=280

COMFYUI_PATH=C:/AI/TubeFlow/ComfyUI
COMFYUI_PYTHON=C:/AI/TubeFlow/artifacts/comfy-venv/Scripts/python.exe
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_WORKFLOW_PATH=C:/AI/TubeFlow/server/workflows/flux_klein_t2i.json
COMFYUI_PROMPT_NODE_ID=6
COMFYUI_SEED_NODE_ID=13
COMFYUI_SEED_INPUT_KEY=seed
COMFYUI_TIMEOUT_MS=600000
COMFYUI_LOW_VRAM=true

AI_EDITING_ENABLED=false
```

Start with enhanced editing disabled; configure it in section 9. Keep existing blank provider key entries from `.env.example` if desired. Local Ollama, Chatterbox, ComfyUI, and ACE-Step do not require a cloud inference API key.

The frontend proxy is configured for backend port 3001. Keep the defaults during installation. If changing ports, update `vite.config.ts`, CORS and any OAuth callback together. A Vite fallback to port 5174 can cause rejected API requests when CORS still allows only 5173.

## 5. Install and download local language and voice models

### Ollama: scripts and editing

Install and start Ollama, then explicitly download the model:

```powershell
ollama pull qwen3.5:4b
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/tags
ollama run qwen3.5:4b "Reply with one short sentence."
ollama stop qwen3.5:4b
```

The app's **Fast** and **Thinking** choices use this same model. Do not pull a separate `qwen3.5:4b:thinking` model. The script adapter uses loopback port 11434; adding an invented `OLLAMA_URL` variable will not change it.

Ollama normally stores models under `%USERPROFILE%/.ollama/models`. To use another drive, configure `OLLAMA_MODELS` in the Windows environment for the Ollama process and restart Ollama before pulling. Adding it only to TubeFlow's `server/.env` does not reconfigure an already running Ollama application. See [Ollama's Windows documentation](https://docs.ollama.com/windows).

### Chatterbox: English/Hindi narration and voice cloning

Explicitly identify Python 3.10 because the setup script does not discover every installation via the `py` launcher:

```powershell
$env:CHATTERBOX_BOOTSTRAP_PYTHON = (py -3.10 -c "import sys; print(sys.executable)").Trim()
npm run setup:tts
& ./server/chatterbox/.venv/Scripts/python.exe -c "import torch; from chatterbox.mtl_tts import ChatterboxMultilingualTTS; print(torch.__version__); print('CUDA:', torch.cuda.is_available())"
```

This creates `server/chatterbox/.venv`, installs the source-pinned Chatterbox dependency, installs PyTorch/torchaudio 2.6.0 (CUDA 12.4 wheels when NVIDIA is detected), and runs `prefetch.py`. Do not install ComfyUI dependencies into this venv. On hardware unsupported by these pinned wheels, report the compatibility issue rather than upgrading the whole environment blindly.

CPU alternative:

```powershell
powershell -ExecutionPolicy Bypass -File server/chatterbox/setup.ps1 -Cpu
```

For CPU runtime also set `CHATTERBOX_DEVICE=cpu` in `server/.env`. To retry just the model/tokenizer downloads after the environment exists:

```powershell
powershell -ExecutionPolicy Bypass -File server/chatterbox/setup.ps1 -CacheOnly
```

`-CacheOnly` still runs the bootstrap Python discovery, so keep `CHATTERBOX_BOOTSTRAP_PYTHON` set in that shell. `-SkipModelDownload` deliberately leaves model downloads unfinished. Inspect actual download output and readiness; the current script does not fail immediately on every native command error.

`prefetch.py` requests these six files from `ResembleAI/chatterbox`: `ve.pt`, `t3_mtl23ls_v3.safetensors`, `s3gen.pt`, `grapheme_mtl_merged_expanded_v1.json`, `conds.pt`, and `Cangjie5_TC.json`. It also preloads the pkuseg tokenizer. The weights follow Hugging Face's cache settings; the tokenizer defaults to `server/data/model-cache/pkuseg`. Source is pinned, but the weight downloader uses revision `main`, so this is not a fully immutable model release lock.

If choosing a custom cache, set `$env:HF_HOME='D:/AI/cache/huggingface'` **before** setup and put `HF_HOME=D:/AI/cache/huggingface` in `server/.env` for runtime. Existing `HF_HUB_CACHE` overrides can affect the actual location. The same user/cache must be visible to download and runtime processes. See [Hugging Face cache environment variables](https://huggingface.co/docs/huggingface_hub/en/package_reference/environment_variables). Most public downloads do not need a token; configure one privately only if the service actually requests it.

After app startup, use **Generation > Audio > Start Chatterbox**. Wait until `http://127.0.0.1:8880/health` returns `ready: true`. First model load can require additional downloads. A running HTTP server with `ready: false` is not a successful installation. Generate and listen to a short English and Hindi sample.

## 6. Install ComfyUI and the image model

The repository does not contain a ComfyUI installer. Use its separate checkout and environment. The original ComfyUI checkout was `f42b24efbeee194513fff465d84ad6913a2698d5`; use it as the starting point for reproducing this integration. Do not overwrite an existing ComfyUI folder containing models.

```powershell
git clone https://github.com/Comfy-Org/ComfyUI.git ComfyUI
git -C ComfyUI checkout f42b24efbeee194513fff465d84ad6913a2698d5
py -3.12 -m venv artifacts/comfy-venv
& ./artifacts/comfy-venv/Scripts/python.exe -m pip install --upgrade pip
& ./artifacts/comfy-venv/Scripts/python.exe -m pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu130
& ./artifacts/comfy-venv/Scripts/python.exe -m pip install -r ComfyUI/requirements.txt
& ./artifacts/comfy-venv/Scripts/python.exe -m pip check
& ./artifacts/comfy-venv/Scripts/python.exe -c "import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

The CUDA command above follows the [official ComfyUI manual installation instructions](https://docs.comfy.org/installation/manual_install) inspected on the audit date. The installer must check the destination GPU/driver and the selected ComfyUI revision's requirements. PyTorch dependencies are not locked by TubeFlow; save a successful `pip freeze` in the local setup report. Do not force the Chatterbox CUDA/PyTorch versions into ComfyUI.

### The actual image checkpoint

Despite its name, **`server/workflows/flux_klein_t2i.json` currently contains an SDXL checkpoint workflow**, with `CheckpointLoaderSimple` and `juggernautXL_ragnarok.safetensors`. It is not a FLUX Klein workflow and installing FLUX weights will not satisfy it.

To reproduce the old installation, copy the existing 6.62 GiB file into:

```text
C:/AI/TubeFlow/ComfyUI/models/checkpoints/juggernautXL_ragnarok.safetensors
```

Compare `Get-FileHash -Algorithm SHA256` results on old and new PCs. If downloading fresh, obtain the single-file SDXL checkpoint through the [publisher's Juggernaut XIII Ragnarok page](https://www.rundiffusion.com/juggernaut-xiii-ragnarok), following its model download link and access requirements. The repository does not record an immutable download URL or checksum for the old file, so its local filename alone cannot prove an identical publisher revision. Do not use an invented download URL or a small HTML/login response renamed to `.safetensors`.

If the legitimate download has a different filename, select that checkpoint in TubeFlow's image-model selector. Inspect workflow node `4.inputs.ckpt_name` if using the JSON directly. The adapter can replace that value from the selected model; the original filename is not mandatory for a compatible SDXL checkpoint. A different architecture requires corresponding workflow changes and validation.

Start ComfyUI manually in a separate terminal for first diagnosis:

```powershell
Set-Location C:/AI/TubeFlow/ComfyUI
& ../artifacts/comfy-venv/Scripts/python.exe main.py --listen 127.0.0.1 --port 8188 --lowvram
```

Then check from another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8188/system_stats
$checkpointInfo = Invoke-RestMethod http://127.0.0.1:8188/object_info/CheckpointLoaderSimple
$checkpointInfo.CheckpointLoaderSimple.input.required.ckpt_name[0]
```

Confirm the installed checkpoint is listed and generate one real image from TubeFlow. Once manual startup works, TubeFlow can start ComfyUI using the configured executable and `COMFYUI_PATH` (the folder containing `main.py`). Stop the manually started process before testing app-managed startup; do not run two servers on port 8188.

External model paths are possible in ComfyUI, but this project's music readiness check examines files physically under `COMFYUI_PATH/models`. Use the documented local layout for the complete setup. Old username-specific fallback paths remain in `comfyui.ts`, so always set `COMFYUI_PATH` explicitly.

## 7. Download ACE-Step music weights

Use the ComfyUI Python created above, from the TubeFlow repository root:

```powershell
& ./artifacts/comfy-venv/Scripts/python.exe server/scripts/setup-local-music.py
```

The downloader requires Python 3.11+ (`hashlib.file_digest`) and `requests`, already covered by this Python 3.12 ComfyUI environment. It downloads from `Comfy-Org/ace_step_1.5_ComfyUI_files`, resolves a repository revision, resumes partial downloads, and checks file size and SHA-256 before finalizing files:

| Path under `ComfyUI/models` | Inspected size |
| --- | --- |
| `diffusion_models/acestep_v1.5_turbo.safetensors` | 4.46 GiB |
| `text_encoders/qwen_0.6b_ace15.safetensors` | 1.11 GiB |
| `text_encoders/qwen_1.7b_ace15.safetensors` | 3.45 GiB |
| `vae/ace_1.5_vae.safetensors` | 0.31 GiB |

**Downloader path limitation:** it always writes to `<repository>/ComfyUI/models`; it does not read `COMFYUI_PATH` from `server/.env`. If using an external ComfyUI installation, copy the verified files into that installation's matching model subfolders. The runtime music client also uses `127.0.0.1:8188` directly, so retain this port for music even if image generation supports another base URL.

Check ComfyUI's `/object_info` includes `TextEncodeAceStepAudio1.5`, `EmptyAceStep1.5LatentAudio`, `VAEDecodeAudioTiled`, and `SaveAudio`. Missing classes indicate an incompatible/failed ComfyUI installation, not necessarily missing weights. Generate and audition a 30-second instrumental in **Timeline & Render > Audio & Voiceover Mix > AI-generated music** with other GPU tasks idle.

## 8. Restore the custom MuseTalk presenter application

This feature has an additional source dependency outside Git. The TubeFlow worker imports `app.config` and `app.musetalk_service.MuseTalkService` from the external application. It calls a custom `generate_lipsync(...)` interface with prepared avatars and silence settings. Merely installing a PyPI package, downloading weights, or cloning upstream MuseTalk does not supply this interface.

### On the old PC, before losing access

Copy the complete `C:/Users/zrajc/OneDrive/Documents/MuseTalk-Demo` application to a private transfer drive, including:

- `app/`, `requirements_demo.txt`, `setup.bat`, `run.bat`, `download_models.py`;
- `MuseTalk/` engine source, configuration files, and `MuseTalk/models/`;
- `avatars/prepared/`, `avatars/source/`, and original avatar media;
- any local source modifications and model/engine configuration files.

Also export the working Conda environment's specifications to the transfer bundle. Run from an Anaconda/Miniconda prompt where `conda` works; choose an existing transfer directory:

```powershell
conda env export -n musetalk-demo --no-builds | Out-File -Encoding utf8 D:/TubeFlow-transfer/musetalk-environment.yml
conda list -n musetalk-demo --explicit | Out-File -Encoding utf8 D:/TubeFlow-transfer/musetalk-conda-explicit.txt
conda run -n musetalk-demo python -m pip freeze | Out-File -Encoding utf8 D:/TubeFlow-transfer/musetalk-pip-freeze.txt
```

Treat exports as private; review local paths or authenticated package URLs before sharing. Copy the application while generation is stopped. A Python/Conda environment directory is not a portable replacement for reinstalling dependencies.

### On the new PC

1. Restore the application to, for example, `C:/AI/MuseTalk-Demo`.
2. Recreate the environment from the exported YAML after removing its old absolute `prefix:` line and reviewing any local file dependencies. Use `conda env create -n musetalk-demo -f <reviewed-yaml-path>` for a new environment; do not overwrite an existing working environment.
3. If no environment export exists, inspect and run the transferred `setup.bat` from its own directory. It attempts Python 3.10, PyTorch 2.0.1 / torchvision 0.15.2 / torchaudio 2.0.2 with CUDA 11.8, plus OpenMMLab dependencies. Its dependencies are not fully pinned; modern GPU support and Windows wheel compatibility need verification. The script has interactive pauses and does not reliably stop on all failures. The copied application and current upstream requirements must be reconciled if this bootstrap fails.
4. Run `download_models.py` with that environment's Python if weights are missing. Its success messages/existing-file size checks are not a full checksum verification; inspect failures and perform real inference.
5. Use the separate lab (`run.bat`) to prepare a short avatar if none were transferred. Close the lab before rendering in TubeFlow to release GPU memory.

Set actual destination paths in **`server/.env`**, then restart TubeFlow:

```dotenv
MUSETALK_ROOT=C:/AI/MuseTalk-Demo
MUSETALK_PYTHON=C:/Users/NEW_USERNAME/miniconda3/envs/musetalk-demo/python.exe
```

Required weight/config groups under `MuseTalk-Demo/MuseTalk/models` include:

| Folder | Files / source used by the external downloader |
| --- | --- |
| `musetalkV15` | `unet.pth`, `musetalk.json` from `TMElyralab/MuseTalk` |
| `sd-vae` | `config.json`, `diffusion_pytorch_model.bin` from `stabilityai/sd-vae-ft-mse` |
| `whisper` | `config.json`, `pytorch_model.bin`, `preprocessor_config.json` from `openai/whisper-tiny` |
| `dwpose` | `dw-ll_ucoco_384.pth` from `yzd-v/DWPose` |
| `face-parse-bisent` | `79999_iter.pth`, `resnet18-5c106cde.pth` from `ManyOtherFunctions/face-parse-bisent` |

The downloader also attempts optional SyncNet evaluation weights. The inspected upstream MuseTalk checkout was `0a89dec45a0192b824e3cf4daf96c239440c5ed8`; this does not identify or restore the separate custom `app/` source.

Each visible avatar needs `metadata.json` with `preparation_status: "prepared"`, `source_25fps.mp4`, `coords.pkl`, `mask_coords.pkl`, `latents.pt`, `full_imgs/`, and `mask/` under `avatars/prepared/<avatar-id>/`. The original default selection was `avatar_005`; select an avatar that actually exists on the new PC. Preserve transparent WebM originals and `server/data/presenter-alpha` for transparent presenters, and reselect/reprepare sources if saved metadata points to old absolute paths or temporary uploads.

The TubeFlow worker sets Hugging Face/Transformers **offline mode**. Finish downloads and a successful standalone lab generation before testing integration; runtime cannot be relied upon to fetch missing files.

Verify `GET http://localhost:3001/api/presenter/status`: `installed` should be true and the expected avatars should appear. That status only checks a subset of files; finish with a short real presenter render. If the custom application is unavailable, leave AI Presenter off and explicitly record the feature as blocked. See [presenter usage](ai-presenter.md).

## 9. Enable AI-directed editing and optional alignment

Once Ollama, narration and rendering work, merge into `server/.env`:

```dotenv
AI_EDITING_ENABLED=true
EDITING_PLANNER_MODEL=ollama/qwen3.5:4b
EDITING_VISION_MODEL=ollama/qwen3.5:4b
EDITING_REVIEW_MODEL=ollama/qwen3.5:4b
EDITING_LOCAL_CONTEXT=16384
EDITING_LOCAL_OUTPUT_TOKENS=4096
EDITING_LOCAL_TIMEOUT_MS=300000
EDITING_RENDER_CONCURRENCY=1
EDITING_GPU_CONCURRENCY=1
```

Restart the backend, then check `/api/editing/capabilities?verify=true`. If Chromium discovery fails, set `EDITING_BROWSER_EXECUTABLE` to the actual installed Edge/Chrome executable. Test **Artifacts > Generate visual edit** and an enhanced MP4 export. A completed run may validly retain zero artifacts after review; installation success does not guarantee the small local model's design quality.

The separate WhisperX service is optional for word-level alignment. Without it, the application uses measured scene boundaries where available or explicitly approximate timing. To install it, use an isolated environment and the frozen lock:

```powershell
uv sync --frozen --project services/alignment --python 3.12
$env:ALIGNMENT_DEVICE = 'cpu'
$env:ALIGNMENT_ASR_MODEL = 'small'
& ./services/alignment/.venv/Scripts/python.exe -c "import whisperx; whisperx.load_model('small', 'cpu', compute_type='int8', language='en'); whisperx.load_align_model(language_code='en', device='cpu'); whisperx.load_align_model(language_code='hi', device='cpu')"
& ./services/alignment/.venv/Scripts/python.exe services/alignment/server.py
```

`small` is an example Whisper model identifier for initial testing, not an accuracy guarantee. The explicit preload can download ASR, VAD, and English/Hindi alignment assets; inspect all errors and access requirements. Record the resolved models/cache paths. Use the same environment and cache when starting the service again. Its `ALIGNMENT_*` settings belong to the Python process, not just Node's `.env`.

Only after successful installation and actual alignment testing set `EDITING_ALIGNMENT_URL=http://127.0.0.1:8765` in `server/.env`. A response from port 8765 only proves that the adapter is up. CPU is the conservative initial configuration to avoid competing GPU environments. See [alignment instructions](../services/alignment/README.md) and [editing qualification limits](AI_VIDEO_EDITING_SETUP.md).

Leave `EDITING_GROUNDING_URL`, `EDITING_ARTIFACT_WORKFLOW_PATH`, and `EDITING_BACKGROUND_REMOVAL_WORKFLOW_PATH` empty unless separately implementing and verifying those integrations. This repository does not ship a ready grounding service or a qualified artifact/background-removal model installation. The ordinary scene-image workflow does not satisfy all artifact-generation requirements; see [artifact workflow contract](../server/workflows/artifacts/README.md).

## 10. Start and verify the entire installation

From the repository root:

```powershell
npm run build:all
npm test
npm run test:editing
npm run dev
```

Open `http://localhost:5173`. `npm run dev` starts Vite and Node, and builds the shared packages/server worker. It does **not** start every model service or download models. Start Ollama separately; use the image/audio UI controls for ComfyUI/Chatterbox. Presenter starts on demand during rendering. Start alignment separately if configured. `npm start --prefix server` runs only the built API server; it does not serve the frontend as a complete production deployment.

In another terminal:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
Invoke-RestMethod http://localhost:3001/api/generate/status
Invoke-RestMethod http://localhost:3001/api/generate/models
Invoke-RestMethod http://localhost:3001/api/tts/status
Invoke-RestMethod http://localhost:3001/api/presenter/status
Invoke-RestMethod 'http://localhost:3001/api/editing/capabilities?verify=true'
```

Perform real smoke checks in this order, avoiding simultaneous GPU jobs:

1. Generate a short script using **Local > Qwen 3.5 4B**.
2. Generate one image and verify it displays and persists after refresh.
3. Start Chatterbox, generate English/Hindi narration, and listen to the results.
4. Generate and audition a 30-second music segment if music was installed.
5. Export a short video; inspect audio, captions (including Hindi glyphs), and duration.
6. Render a short presenter clip if the external application was restored.
7. Generate an enhanced edit and export it if enabled.

`npm run test:editing:render` checks the enhanced renderer with synthetic fixtures; `npm run test:editing:browser` checks its browser UI. They do not verify downloaded ML weights. `node server/scripts/test-presenter.mjs` is an optional real presenter check using the installed avatar. Do not claim a model works just because the TypeScript build or health endpoint passes.

## 11. Optional: migrate saved work and avoid re-downloading

Stop generation and close TubeFlow on both PCs before transferring data. Back up the destination first; do not blindly merge unrelated accounts/projects. Preserve relative directory structure and identifiers.

- Copy the old `server/data` (or the configured `TUBEFLOW_DATA_DIR`) privately if you want saved stories/accounts, generated media, editing revisions/assets, voice references, music, sound effects, and presenter alpha sources. Do not copy the active `editing-scheduler.lock`, temporary/partial job outputs, or test workspaces. Do not delete a destination lock unless you have confirmed no server owns it.
- `server/data/client_secret.json`, `youtube-token.json`, and account subdirectories can contain credentials. Keep backups private and out of Git. Reconnecting YouTube on the new PC is preferable to blindly reusing stale tokens.
- Browser local storage is not in Git or in `server/data`. Re-enter browser-only settings/API keys and select the correct account/profile. Do not assume copying the source folder transfers these settings.
- Copy `ComfyUI/models` into the new ComfyUI model tree and verify hashes. Preserve any separately configured extra model folders too.
- For Chatterbox cache migration, copy the complete `models--ResembleAI--chatterbox` repository cache structure, including `blobs`, `refs`, and `snapshots`, into the matching Hugging Face hub directory; preserve links or their contents. Copy the pkuseg cache too. Running the prefetch step afterward verifies accessibility and retrieves missing files. Copying only snapshot directory names is insufficient.
- For Ollama, stop Ollama and copy the complete model store, including blobs and manifests, to its actual destination store. Restart and verify `ollama list` and inference. Alternatively, pull again.
- Recreate `node_modules`, Python venvs, and Conda environments. Absolute interpreter paths inside copied environments commonly point back to the old PC.

`TUBEFLOW_DATA_DIR` moves workspace storage, but some voice/tokenizer/presenter caches have their own paths. Audit those separately; it is not a universal model-storage override. Keep the full relevant data backup until the migrated project successfully renders.

YouTube uploading is optional. Supply your own OAuth application credentials through `server/data/client_secret.json` or `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`, and configure the callback `http://localhost:3001/api/youtube/callback`. Connect through the app on the destination. Do not upload/publish as a setup smoke test. Cloud script/editing providers similarly require their own configured credentials; never use `VITE_` variables for server secrets.

## 12. Troubleshooting and completion report

| Symptom | Check / fix |
| --- | --- |
| Clone finished but models are missing | Complete sections 5-8 or copy the listed model stores; Git does not manage them. |
| Node modules cannot resolve | Run both root `npm ci` and `npm ci --prefix server`, then build from root. |
| Settings seem ignored | Edit `server/.env`, remove duplicate keys, restart Node, verify actual absolute paths. |
| Python 3.10 not found by TTS setup | Set `CHATTERBOX_BOOTSTRAP_PYTHON` to `py -3.10`'s real interpreter path. |
| Chatterbox HTTP responds but won't speak | Read `/health` fields `ready`, `state`, and `error`; check model/cache downloads and CUDA. |
| Model downloads repeat or offline cache is missing | Check user identity and effective `HF_HOME` / `HF_HUB_CACHE`; setup and runtime must agree. |
| ComfyUI offline / cannot launch | Verify `COMFYUI_PATH/main.py`, `COMFYUI_PYTHON`, port 8188, and manual startup logs. |
| Image model list empty / checkpoint rejected | Check `models/checkpoints`, `/object_info/CheckpointLoaderSimple`, actual file size, and architecture. |
| Music reports weights missing after download | Downloader wrote repo-local ComfyUI; compare it with `COMFYUI_PATH/models`. |
| Music says a node class does not exist | Confirm compatible ComfyUI revision and successful dependency installation; inspect startup errors. |
| MuseTalk installed but no avatars | Restore complete prepared-avatar folders, metadata, and original media; refresh avatar selection. |
| Presenter fails importing `app` | Missing custom MuseTalk-Demo wrapper or wrong `MUSETALK_ROOT`; upstream engine alone is insufficient. |
| CUDA out of memory | Stop competing GPU tasks, use low-VRAM ComfyUI mode, and test one service at a time. |
| FFmpeg/ffprobe not found | Install both and restart terminals/Node after updating PATH. |
| API requests rejected after Vite starts on 5174 | Free port 5173 or update the configured CORS origin to the actual frontend address. |
| Enhanced renderer cannot launch browser | Set `EDITING_BROWSER_EXECUTABLE` to a real Edge/Chrome executable. |
| Setup printed success but feature fails | Inspect command exit codes, downloads and actual inference; bundled scripts have incomplete failure propagation. |

The installing AI should save a **local** report (for example `artifacts/new-pc-setup-report.md`, ignored by Git) with: repository revision; OS/GPU/driver; Node/Python versions; per-service interpreter and model paths; ComfyUI revision and resolved packages; restored/downloaded model names and available hashes; ports; successful smoke outputs; and blocked or skipped features with exact reasons. Never include secret values. Mark setup complete only for features that actually passed their runtime checks.
