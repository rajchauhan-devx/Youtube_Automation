# Local background music

In **Timeline & Render → Audio & Voiceover Mix → Music source**, choose:

- **Local music library** for existing tracks or voice only.
- **AI-generated music · local ACE-Step** to compose instrumental background music on this computer.

Choose **Auto-generate prompt from video** to let local Qwen build an editable music direction from the title, narration, mood, pacing, and scene visuals. You can also describe the desired mood and instruments yourself. Both paths enforce a clean, sparse instrumental arrangement with one to three complementary instruments, restrained dynamics, and room for narration. Generate a 30, 60, or 90 second segment, audition it, and adjust music volume before rendering. Longer videos repeat the segment. Automatic editing can lower music during speech.

Generated music is saved with its project and remains available after reloading. Another version replaces the selected generated track only after successful generation. Changing the narration or scene plan invalidates the old story-specific selection. Cancelling or failing a generation preserves the previous track.

## Installed runtime

ACE-Step 1.5 Turbo runs through the existing ComfyUI installation at `127.0.0.1:8188`. It uses the 0.6B text encoder, the 1.7B music-planning model, tiled audio decoding, and ComfyUI's low-VRAM offloading. Models unload after the queue becomes idle. No cloud API key is used. Qwen and ComfyUI start on demand using the installed local runtimes.

Models can be restored with:

```powershell
artifacts/comfy-venv/Scripts/python.exe server/scripts/setup-local-music.py
```

The installer downloads official Comfy-Org ACE-Step files and checks their SHA-256 hashes before making them available. It can resume interrupted downloads. Keep narration and image generation idle while composing music. The app blocks competing requests while its music job runs; unrelated applications can still consume GPU memory.

## Validation on this machine

RTX 3050 Laptop 6 GB: generated a 60-second stereo instrumental from the 41-scene temple story. ComfyUI reported 38.97 seconds for the music workflow. The saved MP3 is 48 kHz stereo, with a measured peak of -2.3 dBFS. Actual speed varies with duration, GPU load, and model loading. Musical quality remains a listening choice; use the preview before rendering.
