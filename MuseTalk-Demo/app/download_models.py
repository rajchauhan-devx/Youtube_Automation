"""Download inference weights from their publishers, recording exact revisions."""
import json
from pathlib import Path
import urllib.request
from huggingface_hub import HfApi, hf_hub_download

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "MuseTalk" / "models"
SOURCES = [
    ("TMElyralab/MuseTalk", "", ["musetalkV15/musetalk.json", "musetalkV15/unet.pth"]),
    ("stabilityai/sd-vae-ft-mse", "sd-vae", ["config.json", "diffusion_pytorch_model.bin"]),
    ("openai/whisper-tiny", "whisper", ["config.json", "preprocessor_config.json", "pytorch_model.bin"]),
]


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    lock_path = MODELS / "sources.json"
    defaults = ROOT / "app" / "model-sources.json"
    lock = json.loads(lock_path.read_text()) if lock_path.exists() else json.loads(defaults.read_text())
    for repo, folder, files in SOURCES:
        revision = lock.get(repo) or HfApi().model_info(repo).sha
        lock[repo] = revision
        lock_path.write_text(json.dumps(lock, indent=2) + "\n")
        for filename in files:
            print(f"Downloading {repo}/{filename}", flush=True)
            hf_hub_download(repo, filename, revision=revision, local_dir=MODELS / folder)
    # YuNet is OpenCV's small CPU face detector. Avoids the CUDA-only MMCV
    # extension used by the upstream DWPose preparation pipeline on macOS.
    url = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
    detector = MODELS / "face_detection_yunet_2023mar.onnx"
    if not detector.exists():
        partial = detector.with_suffix(".partial")
        urllib.request.urlretrieve(url, partial)
        if partial.stat().st_size < 100000:
            raise RuntimeError("Incomplete face detector download")
        partial.replace(detector)
    print("MuseTalk inference models downloaded.", flush=True)


if __name__ == "__main__":
    main()
