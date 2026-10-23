# Youtube_Automation

**Setting up another PC?** Open the **Setup** screen in the left sidebar (ex-Settings).
It lists every model/engine live from `/api/setup` — script LLMs (Gemini, Ollama Qwen 3.5 4B,
OpenCode/Groq/OpenRouter free models), voice (Google Chirp 3 HD default, Edge, OpenRouter, legacy Omni),
ComfyUI SDXL image, ACE-Step music, MuseTalk presenter, motion graphics — plus where each
API key is saved (`server/.env` vs browser `openrouter_key`), what git carries vs what you reinstall,
and a new-PC checklist with one-click `.md` export. Secret values are never shown.

Full runbook: [complete installation and migration guide](docs/NEW_PC_SETUP.md).
Recovery controls, persistent render/upload handling, measured speech timing, editor history and saved styles: [reliability and motion editor guide](docs/RELIABILITY_AND_EDITOR.md).
All profiles share [one script extraction format](docs/SHARED_SCRIPT_FORMAT.md), with content-preserving conversion for supported older responses.
It includes a prompt to give an AI installer, model download steps, external folder
dependencies, `server/.env` configuration, and runtime verification. Git clone alone
does not include ComfyUI, model weights, or the separate custom MuseTalk-Demo app.

AI-directed visual editing is available under **Artifacts** with a shared preview/MP4
renderer and an explicit enhanced mode in **Timeline & Render**. Legacy **Start Video Generation** also includes saved, enabled Artifacts graphics over the edited footage. See
[setup, configuration and qualification status](docs/AI_VIDEO_EDITING_SETUP.md).
Image-led documentary editing adds overlapping source images, verified detail insets and source highlights, with archival/cinematic/map treatments. Rendered placement review sends actual preview frames back to the vision model for bounded layout correction; cards show passed, rejected, or incomplete review. Autopilot prepares these visuals before export.

**Auto-Pilot:** Open a script and click **Run Auto-Pilot**. Topic is optional: leaving it blank lets AI research and select a topic using the channel identity, selected template and past exports. Auto-Pilot renders the final video, generates YouTube metadata and uploads to the connected channel using saved visibility (Private by default). Connect that profile’s YouTube account first.

In **Run Script → Auto-Pilot**, review Media generation, Voice model & narrator, Captions & motion graphics, Editing & audio finishing, and YouTube export before running. Choose the image provider/quality/seed, enable or disable Flow and select 720p or 1080p upscaling and clip duration, select an engine/language/saved narrator with voice preview and tuning, choose standard or motion captions independently of graphics, select graphics type/density/treatment/model, and choose an editing preset, finishing effects and audio levels. Visibility and optional scheduled publication are explicit. The choices are validated and saved per script, reused when reopening Run and continuing a failed production, and retained by Clear. Final exports remain 1080×1920 for Shorts and 1920×1080 for landscape profiles. Engine-specific voice controls appear only for the selected engine; cloud engines require their configured credentials. Image compositions need still-image scene sources; titles and callouts also support video-only scripts.

Each channel profile has a separate `server/data/accounts/<accountId>/topic-notes.json` file, created automatically. Ancient Dharma, Rule Zero and Against the Odds each keep their own channel guidance and successful YouTube topic history, shared across all video formats. **Profile → Auto-Pilot Topic Notes** displays the history. Topic research excludes previous subjects and reworded repeats; successful manual YouTube exports also update the notes. Failed exports and unexported drafts are not marked as used. Existing successful exports are recovered from saved upload receipts and script export data. These personal notes stay local in the ignored accounts directory and should be included when migrating that directory.

Auto-Pilot now plans three distinct opening hooks, selects one, and plans the viewer promise, titles and thumbnail concept before generating the script. Its story edit follows each channel’s genre, removes redundant setup, and keeps scene IDs and media types intact. The original AI response stays available; extraction uses the edited production version only while it matches that response. **AI Script Assistant → Hooks, Story Edit & Final Review** shows the alternatives, selected hook, revised narration and review findings. Music mood follows the story, camera choices follow scene purposes, and Auto-Pilot audio uses voice polishing, music ducking and limiting.

Before an automatic YouTube upload, Gemini reviews sampled frames from the rendered opening, middle and ending plus the opening/ending mixed audio. A missing review, incomplete review, blocking finding or changed production/render prevents Auto-Pilot upload. This requires a Gemini API key even when another model writes the script. The check is a sampled editorial review, not exhaustive frame-by-frame playback, exact caption alignment verification or a prediction of retention. Manual exports retain their existing workflow.

Incomplete required hook/edit fields get one corrective model request; optional hook explanations can be omitted. Image designs get local checks before compilation so duplicate backgrounds and unsupported maps can be corrected within the existing request budget. Final review retries transient provider overload once. If a run stops after narration, **Continue Production** reuses the saved images and audio; after rendering it reuses the finished MP4 for review and upload. Already exported productions cannot be continued into another upload.

Performance memory imports actual watch duration, average percentage viewed and retention curves through the [YouTube Analytics API](https://developers.google.com/youtube/analytics/reference). Reconnect existing YouTube accounts once to grant `yt-analytics.readonly`, and enable YouTube Analytics API in the Google Cloud project if needed. Refresh from **Profile → Refresh YouTube retention** or start another Auto-Pilot run. Imports consider uploads at least 48 hours old, cache reports for 24 hours, and process up to 20 videos per refresh. Low-sample results stay visible but are excluded from AI comparisons until they have at least 100 views and a curve. Comparisons use the same channel and video format with duration within 25%; observed curve drops are linked to saved scene purposes without claiming causation. Missing permission or unavailable reports preserve saved observations. Shorts swipe-away metrics remain in YouTube Studio. No background polling or live uploads are performed by tests.

AI presenter: enable **Timeline & Render → AI Presenter** to add a chest-up,
lip-synced character to the bottom-right of your video. The app starts the worker
using the existing MuseTalk installation. See [presenter setup and usage](docs/ai-presenter.md).

See [the production review](PRODUCTION_REVIEW.md) for verified fixes, RTX 3050 model guidance, scene/audio synchronization instructions, and remaining release blockers.

Validation: `npm run build:all` and `npm test`. The actual editor is **Timeline & Render**; use its playhead and **End scene at playhead** controls to match scenes to narration. **Fit timing to narration** preserves relative scene lengths and makes the total match the audio; it does not automatically align sentences.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-zpqkpkhy)

## Hindi and English narration

Google Chirp 3 HD is the default speech engine. Configure Google Cloud Application Default Credentials and enable Cloud Text-to-Speech in the billing project used for image generation. No local speech model installation is needed.

Choose a narrator in **Run Auto-Pilot → Voice model & narrator** or **Generation → Audio**. Preview a sample or your own text before starting. Voice selection, language and speed are saved with each production. Edge, OpenRouter and the opt-in legacy Omni engine remain available.

See [Google speech setup and billing behavior](docs/GOOGLE_TTS.md). Start the app with `npm run dev`.
