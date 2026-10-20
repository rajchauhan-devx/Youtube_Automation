# Recovery, speech timing and motion editing

## Saved data and workspace recovery

The JSON store validates array data and blocks reads and mutations on malformed or wrong-shaped stores. It preserves the damaged bytes and keeps the latest committed and previous good snapshots in `.store-recovery`. It never treats corruption as an empty project list.

Open **Profile → Backups & recovery** for the selected channel and video format. **Restore last verified scripts copy** repairs damaged script storage. **Create verified backup** snapshots scripts, settings, generated media, completed exports and registered motion assets. Account credentials, other profiles, browser local storage and model caches are excluded. Backups live under `TUBEFLOW_DATA_DIR/.workspace-backups/<account>/<profile>`; copy that directory to another disk for off-device protection.

Restoring requires the workspace fingerprint shown by the last recovery refresh. Every backup file is checked against its recorded SHA-256 and size before replacement. Active mutations, narration, music, Flow, renders and motion jobs block backup/restore; new mutations are blocked while an operation is running. The current workspace is retained in `.before-restore-*`. A write-ahead restore journal rolls back an interrupted replacement before scripts can be read or written. Newer upload receipts survive a restore because restoring a local project cannot undo an external upload.

## Render and upload recovery

Legacy render inputs, revision, progress and results persist under `.render-jobs`. A server restart exposes the unfinished job as interrupted. **Timeline & Render → Legacy → Restart saved render** reruns its saved inputs with the existing media. This restarts rendering from the beginning; it does not resume an individual FFmpeg frame. Changed production revisions require a new render. The motion scheduler retains its existing durable job/checkpoint behavior.

YouTube upload journals use the connected channel plus a hash of the actual MP4 bytes. Concurrent requests are blocked, and completed retries return the existing video instead of sending another copy. A lost response leaves an uncertain outcome. **Export → YouTube → Previous upload needs attention** lets you bind the journal to an existing video after channel ownership verification, or explicitly confirm in Studio that no video exists before permitting another send. No automatic resend occurs after an ambiguous upload failure. Thumbnail or local-history failures after a confirmed upload cannot cause another insert request.

## Measured English and Hindi speech timing

Run `npm run setup:alignment` to install an isolated WhisperX environment using Python 3.10–3.13. Set `ALIGNMENT_BOOTSTRAP_PYTHON` if needed. `ALIGNMENT_PYTHON` can select an existing environment; `ALIGNMENT_DEVICE` defaults to `cpu`, and `ALIGNMENT_MODEL_DIR` selects the cache location. The default cache is ignored `artifacts/alignment-models`. Language models download on first use.

In **Artifacts**, choose **Align spoken words**. The operation uses the selected immutable audio and the exact saved narration, runs as a cancellable/recoverable motion job, and caches results by audio/text identity. It accepts measured timing only when every original word matches, intervals are ordered and within the audio, and confidence meets the threshold. Failed or cancelled jobs preserve the current revision. Long recordings need synchronized per-scene narration to bound alignment work.

Existing scene boundaries and graphic placement remain stable. Existing motion captions regenerate with measured per-word reveal times. Regenerate scene graphics to use the new phrase cues; manually edited graphic timestamps remain unchanged. Approximate and phrase timing remain available when alignment is not installed or cannot confidently measure the speech. Model alignment is an estimate of phoneme boundaries, not a guarantee of transcription or factual accuracy. Implementation follows the [WhisperX alignment API](https://github.com/m-bain/whisperX).

`npm run test:alignment:live` accepts `ALIGNMENT_SMOKE_AUDIO`, `ALIGNMENT_SMOKE_TEXT` and `ALIGNMENT_SMOKE_LANGUAGE`. Local English and Hindi speech fixtures are also detected under `artifacts/alignment-check`. The live test exercises the HTTP endpoint, durable job, word validation and revision publication. It requires local models and is excluded from credential-free CI.

## Editor additions

- **Undo/Redo** records up to 100 draft snapshots and groups continuous gestures/typing. Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y work outside text fields. Saving or discarding starts a fresh draft history; saved revisions remain in the revision selector.
- **Reusable motion styles** saves palette, approved font order, image movement and strength for the selected channel/format. Applying a style creates a revision and clears previous visual placement review. Media sources and verified targets remain unchanged.
- A documentary composition with exactly two registered image layers supports **Side-by-side comparison** or **Animated before / after wipe**, with editable labels. Source assets and crops remain protected. For a single-image shot, regenerate with two related source images first. Preview and export use the same comparison renderer.

## Checks and known baseline failures

`npm test` now includes both `server/tests/*.test.mjs` and `tests/editing/*.test.mjs`, sequentially. `npm run test:server` retains a server-only command. GitHub Actions installs dependencies and FFmpeg, checks types/builds, runs both test groups, and runs browser interactions even when a test group fails. Failure screenshots are retained as workflow artifacts. This workflow requires no API credentials or speech-model downloads.

Verification added for corrupt stores, invalid snapshots, stale restore state, crash recovery, retained upload receipts, process restart, saved render restart, ambiguous uploads, full-phrase/word alignment validation, approved style fonts, and comparison rendering. Browser checks exercise move/resize, Undo/Redo, style persistence, comparison wipe, backups, corrupt-store recovery and mobile layouts. Real local English and Hindi clips passed measured alignment through the app's job API.

The initial whole-project run exposed 24 failures across 249 tests (223 passed; two Windows-only tests skipped). One failure was an older upload test expecting automatic retry after an ambiguous failure; it now tests explicit recovery and receipt reuse and passes. The remaining 23 failures are outside this change's implementation: legacy scene/prose extraction expectations, mixed/Shorts media fixtures, a source-motion assertion, channel style text expectations, a hard-coded local Flow reference, and local music model fixtures. These failures are not suppressed by CI. Local details are recorded in ignored `artifacts/reliability-full-tests.tap`; targeted server and editing verification is in `artifacts/reliability-server-tests.tap` and `artifacts/reliability-editing-tests.tap`.
