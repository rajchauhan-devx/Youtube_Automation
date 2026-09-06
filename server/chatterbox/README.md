# Local Chatterbox TTS

TubeFlow runs Resemble AI's MIT-licensed Chatterbox Multilingual V3 behind a local, OpenAI-compatible HTTP service. The dependency is pinned to an official source revision because the current PyPI wheel does not yet expose the V3 loader. It supports English, Hindi, exact pause markers, long-script chunking, and authorized voice-reference cloning.

## One-time setup (Windows)

From the repository root:

```powershell
npm run setup:tts
```

This creates an isolated Python 3.10 environment in `server/chatterbox/.venv`, installs CUDA-enabled PyTorch when an NVIDIA GPU is detected, and downloads the model files. The first setup downloads several gigabytes.

To force CPU-only installation:

```powershell
powershell -ExecutionPolicy Bypass -File server/chatterbox/setup.ps1 -Cpu
```

## Runtime

`npm run dev` starts the web app and Node server. In the Audio Generation tab, click **Start Chatterbox**. The Node server manages the Python child process and reports model-loading or CUDA errors in the UI.

Configuration is documented in `.env.example` at the repository root. Generated voice references and tokenizer caches stay local under `server/data` and are ignored by Git.

## Voice cloning

Upload a clean 8–15 second recording from the Audio Generation tab. Use only recordings you own or have explicit permission to clone. The upload is normalized to mono 24 kHz PCM WAV before Chatterbox receives it.
