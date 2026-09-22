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

## Natural narration

The default **Natural Conversation** preset uses exaggeration 0.5, CFG 0.5 and temperature 0.8. The dramatic presets remain available. Higher exaggeration can speed up delivery; it is not a general quality slider. These starting values follow the [upstream guidance](https://github.com/resemble-ai/chatterbox#original-chatterbox-tips).

Use **Try your own sentence** to compare settings on up to 500 characters of your actual script. Previews use a fixed seed for repeatable comparisons. Full narration retains normal sampling. Use a reference in the intended language with the conversational delivery you want; a flat or synthetic reference will limit the result. The bundled preset references were generated with Edge TTS, so a good human recording is preferable for natural cloning.

The service retains complete sentences where possible, splits long sentences at clauses before falling back to word boundaries, and preserves ellipses within the model's context. Blank lines add a 450 ms paragraph pause. Explicit `[pause 0.6s]` markers still work. Existing silence counts toward a boundary pause; no speech is overlapped across chunks. Only excess outer silence is trimmed, with guard space for consonants and breaths; internal pauses are retained. The old `CHATTERBOX_CROSSFADE_MS` setting is no longer used.

Restart Chatterbox after updating the Python service and regenerate narration. Old exported audio is unchanged. Scene-cache version 2 prevents reuse of earlier speech when generating again.

Tests (from the repository root):

```powershell
server/chatterbox/.venv/Scripts/python.exe -m unittest discover -s server/chatterbox -p test_prosody.py
npm test
```

Naturalness requires listening with the chosen voice and script; these changes do not guarantee human-indistinguishable output.
