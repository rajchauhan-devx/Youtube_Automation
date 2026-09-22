# Youtube_Automation

AI presenter: enable **Timeline & Render → AI Presenter** to add a chest-up,
lip-synced character to the bottom-right of your video. The app starts the worker
using the existing MuseTalk installation. See [presenter setup and usage](docs/ai-presenter.md).

See [the production review](PRODUCTION_REVIEW.md) for verified fixes, RTX 3050 model guidance, scene/audio synchronization instructions, and remaining release blockers.

Validation: `npm run build:all` and `npm test`. The actual editor is **Timeline & Render**; use its playhead and **End scene at playhead** controls to match scenes to narration. **Fit timing to narration** preserves relative scene lengths and makes the total match the audio; it does not automatically align sentences.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-zpqkpkhy)

## Local, human-like voice generation

Click the bottom-left **Profile & Voices** avatar to save named English and Hindi reference recordings. Saved references appear under their matching language in **Generation → Audio**, remain available after restarting, and can be played or deleted from the profile. Use a clean 10–20 second WAV, MP3, M4A, FLAC, or OGG recording (up to 8 MB); only the first 20 seconds are used. Saving references does not require the model to be running. Start Chatterbox before generating narration with a saved voice.

The default TTS provider is Resemble AI's free, MIT-licensed Chatterbox Multilingual V3. It runs locally and supports English, Hindi, exact pause markers, long narration, and authorized voice-reference cloning.

One-time setup on Windows:

```powershell
npm run setup:tts
```

Then run the application normally:

```powershell
npm run dev
```

Open **Generation → Audio**, start Chatterbox, and wait for the model to report ready. The first setup downloads several gigabytes. See [server/chatterbox/README.md](server/chatterbox/README.md) for configuration and troubleshooting.
