# Local Chatterbox TTS

TubeFlow runs Resemble AI's MIT-licensed pretrained Chatterbox models behind a local, OpenAI-compatible HTTP service. Hindi requests use [Chatterbox-Multilingual-hi](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-hi), the official Hindi-specific V3 finetune, with its matching V3 speech decoder. English requests use Multilingual V3. No local training or LoRA is needed. The inference dependency and model revisions are pinned for reproducibility. Exact pause markers, long-script chunking, and voice-reference cloning remain supported.

The service starts with Hindi ready. It keeps one model in memory and switches checkpoints when a request changes language. Hindi's built-in voice uses the native Hindi reference from the official demo; saved voice references still override it. `/health` reports the active model and Hindi checkpoint revision, and generated audio responses include `X-TTS-Model`.

To fetch or verify the pretrained files on macOS/Linux:

```bash
server/chatterbox/.venv/bin/python server/chatterbox/prefetch.py --verify
```

Assets are reused from existing Hugging Face caches or downloaded into `server/data/model-cache/huggingface`. Hindi adds about 3.2 GB. Set `CHATTERBOX_HINDI_REFERENCE` to override the built-in native Hindi reference, or `CHATTERBOX_MODEL_CACHE` to change the download cache. Speak Hindi scripts in Devanagari for pronunciation testing.

If Apple MPS inference exceeds available unified memory, set `CHATTERBOX_DEVICE=cpu` in `server/.env`. CPU inference uses the same pretrained weights and voice references but generates more slowly. CUDA and MPS remain available through the device setting.

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

Upload a clean 8–12 second recording from the Audio Generation tab. Use only recordings you own or have explicit permission to clone. For Hindi, the opening must contain native Hindi speech, without music, echo, voice effects or an English introduction. The upload is converted to mono 24 kHz PCM WAV, leading silence is trimmed, and up to 12 seconds are kept. No denoising or dynamics compression is applied. The opening is checked for sufficient audible content, duration and clipping; this is an audio check, not automatic language or speaker verification. Older references remain available but should be re-uploaded from their original recording to use this preparation.

## Natural narration

The default **Natural conversation** preset uses exaggeration 0.5, CFG 0.5 and temperature 0.7 with locked seed 42. These neutral defaults are shared by previews, generation, and new Auto-Pilot settings. Existing Auto-Pilot settings can use **Use natural delivery** to apply the same settings while keeping the selected voice. Switching to Hindi no longer automatically increases expressiveness. Storyteller and other expressive styles remain explicit choices. Parameter tuning alone does not establish human-like naturalness; compare references and checkpoints by listening.

Use **Try your own sentence** to compare settings on up to 500 characters of your actual script. Previews and full narration share the same locked seed. Use a clean native Hindi recording with natural, restrained expression for the intended delivery. The model uses the first six seconds for speech-token conditioning and up to ten seconds for the speech decoder; the beginning of the reference should contain clear speech rather than silence, music, or an introduction in another language. A flat or synthetic reference can limit the result.

Hindi text preparation expands Indian and Western digit grouping, Devanagari digits, doctor abbreviations, currency with paise, and decimal percentages. It preserves the written Hindi words rather than guessing alternate phonetic spellings. Repeated question/exclamation marks are reduced to a single mark without removing the question or emphasis.

Hindi also expands selected uppercase initialisms (AI, API, UPI, GPU, etc.) into Devanagari before the model's tokenizer lowercases Latin text. Ordinary English words and embedded names are preserved. Invisible shaping/bidi controls are removed without removing vowel signs, nukta or virama. Normalization now happens before chunking, so number expansion cannot silently exceed the intended text chunk length.

In **Voice settings**, choose **Start fresh with native Hindi** to compare against the official native reference with neutral delivery. It changes the selected voice and delivery, without deleting saved voices or projects. Auto-Pilot has the same reset action. A saved clone is no longer chosen automatically for Hindi when no preference exists.

For recurring mispronunciations, expand **Hindi pronunciation corrections** and enter one literal correction per line, e.g. `ChatGPT = चैट जी पी टी`. Save before previewing. Corrections match complete words/phrases in a single pass and are applied only to Hindi Chatterbox speech; the stored script and captions retain their wording. The dictionary is private to the account and shared across its video profiles, including Auto-Pilot. The API is `GET/PUT /api/tts/pronunciations/hi` with `{ "entries": { "ChatGPT": "चैट जी पी टी" } }`. Save an empty dictionary to remove corrections. Preview and scene caches include the dictionary and reference identity, so changed corrections trigger regeneration automatically.

The service retains complete sentences where possible, splits long sentences at clauses before falling back to word boundaries, and preserves ellipses within the model's context. Blank lines add a 450 ms paragraph pause. Explicit `[pause 0.6s]` markers still work. Existing silence counts toward a boundary pause; no speech is overlapped across chunks. Only excess outer silence is trimmed, with guard space for consonants and breaths; internal pauses are retained. The old `CHATTERBOX_CROSSFADE_MS` setting is no longer used.

Restart Chatterbox after updating the Python service and regenerate narration. Old exported audio is unchanged. The synthesis revision and scene-cache identity prevent reuse of earlier speech when generating again.

Tests (from the repository root):

```powershell
server/chatterbox/.venv/Scripts/python.exe -m unittest discover -s server/chatterbox -p test_prosody.py
npm test
```

Naturalness requires listening with the chosen voice and script; these changes do not guarantee human-indistinguishable output.
