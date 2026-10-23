# Google Chirp 3 HD narration

Google speech is the default narrator in **Run Auto-Pilot → Voice model & narrator → Voice engine**, and **Generation → Audio → Voice engine**. Select **Google Chirp 3 HD**, then **Hindi** or **English**, and choose a voice. English includes Indian and US accents. Google voices are read from the Cloud voice catalog; other languages and non-Chirp models are excluded.

Before Auto-Pilot, use **Preview voice** to audition the selected narrator. Leave preview text empty for the voice's sample, enter up to 500 characters, or choose **Use script excerpt**. The audio player supports replay and seeking. Changing engine, language, voice or delivery settings clears the earlier preview. The selected engine, exact voice ID, language and speed are saved in the script's Auto-Pilot production settings and passed to both short narration and synchronized scene narration. Playback does not substitute a browser/system voice when the provider fails.

## Google Cloud setup

The service reuses the image generator's Google Cloud Application Default Credentials and quota/billing project. No Gemini API key or local model training is needed for Google speech.

1. Enable **Cloud Text-to-Speech API** (`texttospeech.googleapis.com`) in the same Cloud project.
2. Configure Application Default Credentials with access to that project. The existing user ADC login used for images works. Set `GOOGLE_APPLICATION_CREDENTIALS` if the ADC file is outside the standard gcloud config directory.
3. Set `GOOGLE_CLOUD_PROJECT` if the credential file has no `quota_project_id` or you need a different billing/quota project.
4. Restart the Node server after environment changes, then refresh voices.

The default is `TTS_PROVIDER=google`. Changing engines for one run does not change the server default. Narration uses provider voices; there is no local voice cloning or model installation. Saved options for retired speech engines are normalized to the Google narrator when projects are opened.

## Billing and generation behavior

Google Cloud applies its current Chirp 3 HD monthly free character allowance and any eligible trial credit. Usage above the allowance can incur charges. This app does not know the billing account's remaining free allowance or credit balance and does not enforce a monthly spending cap. Consult [Google's current pricing](https://cloud.google.com/text-to-speech/pricing) and Cloud Billing for account totals. Previews are synthesis requests and count as usage. Identical successful previews are cached in memory (up to 30); concurrent identical previews share one request. A server restart clears this cache.

Long narration is split by UTF-8 byte length to stay below Google's 5,000-byte input limit, keeping Hindi combining sequences intact. Audio is requested as mono 24 kHz LINEAR16 WAV, validated, and joined without repeating WAV headers. Scene narration retains the existing measured timing, retry cache and final mastering. Pitch/expression controls for other engines are not sent to Google; its supported speed control is shared by preview and generation. Explicit pause annotations are converted to punctuation for natural pacing; exact pause durations are not guaranteed with this plain-text Google path.

Errors for missing credentials, disabled APIs, permissions, quotas, timeouts and invalid audio are shown without switching to a different voice engine.

## Validation

```sh
npm run build:all
node --test --test-concurrency=1 server/tests/google-tts.test.mjs server/tests/autopilot-settings.test.mjs server/tests/long-video.test.mjs
node server/tests/google-tts.browser.mjs
```

The focused tests use fake Google responses and temporary data. The browser test uses a simulated backend and audio, and does not generate images, publish videos or invoke a live model. Live Hindi and English Google samples from the implementation check are under `artifacts/google-tts/`.

