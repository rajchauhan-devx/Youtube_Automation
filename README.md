# Youtube_Automation

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-zpqkpkhy)

## Local, human-like voice generation

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
