# MuseTalk for TubeFlow

`MuseTalk/` contains the source from [rajchauhan-devx/MuseTalk](https://github.com/rajchauhan-devx/MuseTalk), pinned in `UPSTREAM.json`. Its [license](MuseTalk/LICENSE) is retained. The only upstream file adjustment anchors the model-download ignore rule so Python model source remains trackable.

`app/` provides TubeFlow's avatar preparation and rendering interface. Install from the main repository root with `npm run setup:presenter` (Python 3.10–3.12 and FFmpeg required). The setup command finds a compatible interpreter and creates `.venv` here. Models, prepared avatars, environments and outputs stay outside Git.

Use **Timeline & Render → AI Presenter → Add an avatar**. The app starts and stops the local engine automatically. No Gradio lab or ComfyUI installation is required.

The adapter reuses the fork's VAE, UNet, positional encoding and Whisper audio processor. Portable preparation uses OpenCV YuNet and lower-face feathering in place of DWPose/face parsing. Apple MPS uses float32; CUDA uses fp16 for the UNet/audio model. CPU is also selectable. See [installation, limitations and verification](../docs/ai-presenter.md).
