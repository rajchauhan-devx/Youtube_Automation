# Local AI on this computer

Ollama and `qwen3.5:4b` are installed. The app talks only to `http://127.0.0.1:11434` for this provider and sends no API key. The downloaded model runs offline.

## Use it

- Scripts → AI Model → Local · Ollama → Qwen 3.5 4B.
- Automatic editing → Editing AI → Local · Ollama → Qwen 3.5 4B.
- New scripts and the editing selector default to the local model. Existing scripts keep their saved model choice.

Start Ollama from the Windows Start menu if the app reports it offline. Restart the TubeFlow backend and refresh the web page after updating the code.

## Memory and large requests

The integration uses an 8,192-token context, one response at a time in the normal UI, and `keep_alive: 0` to unload the model after each response. Stop Chatterbox and ComfyUI GPU work before using local AI; otherwise models may compete for the RTX 3050's 6 GB VRAM or fall back to slower CPU execution.

Script generation defaults to Fast mode. Thinking mode is a separate choice using the same model; it can spend its entire token allowance reasoning, so Fast is preferable for routine narration. The UI displays only the final response. Input has a conservative UTF-8 byte budget to avoid silently discarding long templates; split lengthy scripts into sections or select a cloud provider if the app reports that the prompt is too long.

Editing uses JSON output without thinking for faster constrained decisions. It processes at most four scenes per request, using short narration and visual excerpts. All decisions must validate before the app applies them, so a failed batch leaves existing editing settings intact. Multiple batches can take several minutes and may have less global continuity than a large cloud model.

## Commands

```powershell
ollama list
ollama run qwen3.5:4b
ollama ps
ollama stop qwen3.5:4b
```

If reinstalling on another computer, install the official Windows application from https://ollama.com/download/windows and run `ollama pull qwen3.5:4b` (about 3.4 GB).
