"""In-process adapter: upstream MuseTalk 1.5 neural inference, bounded local IO.

Face preparation uses OpenCV YuNet on CPU rather than MMLab's CUDA extensions.
Only the lower face is feathered into the original frame; all other motion comes
from the supplied avatar. The neural VAE, UNet and audio features are upstream.
"""
import gc
import json
import math
import os
from pathlib import Path
import pickle
import re
import shutil
import subprocess
import sys
import uuid

from app import config

os.environ.setdefault("HF_HOME", str(config.TEMP_DIR / "huggingface"))
sys.path.insert(0, str(config.ENGINE_DIR))


def device_name():
    import torch
    requested = os.environ.get("MUSETALK_DEVICE", "auto")
    if requested not in {"auto", "cpu", "cuda", "mps"}:
        raise ValueError("MUSETALK_DEVICE must be auto, cpu, cuda or mps")
    available = {"cpu": True, "cuda": torch.cuda.is_available(),
                 "mps": torch.backends.mps.is_available()}
    if requested != "auto":
        if not available[requested]:
            raise RuntimeError(f"Requested MuseTalk device is unavailable: {requested}")
        return requested
    return next(name for name in ["cuda", "mps", "cpu"] if available[name])


def avatar_dir(avatar_id):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", avatar_id):
        raise ValueError("Invalid avatar ID")
    target = config.AVATARS_DIR / avatar_id
    if target.is_symlink():
        raise ValueError("Avatar directory must not be a symlink")
    return target


def media(args):
    subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def health():
    import torch
    import cv2
    import diffusers
    import transformers
    files = ["musetalkV15/unet.pth", "musetalkV15/musetalk.json",
             "sd-vae/config.json", "sd-vae/diffusion_pytorch_model.bin",
             "whisper/config.json", "whisper/preprocessor_config.json",
             "whisper/pytorch_model.bin", "face_detection_yunet_2023mar.onnx"]
    missing = [name for name in files if not (config.MODELS_DIR / name).is_file()]
    for binary in ["ffmpeg", "ffprobe"]:
        if not shutil.which(binary):
            missing.append(binary)
    detector = config.MODELS_DIR / "face_detection_yunet_2023mar.onnx"
    if detector.is_file():
        cv2.FaceDetectorYN.create(str(detector), "", (320, 320))
    return {"installed": not missing, "device": device_name(), "missing": missing,
            "torch": torch.__version__, "engine": "MuseTalk 1.5"}


class MuseTalkService:
    def __init__(self):
        import torch
        self.device = torch.device(device_name())
        # MuseTalk's fp16 attention overflows on Apple MPS. Float32 is required
        # for both audio conditioning and the UNet there (verified on real input).
        self.dtype = torch.float16 if self.device.type == "cuda" else torch.float32
        self.vae = self.unet = self.whisper = self.pe = None
        torch.set_num_threads(min(8, os.cpu_count() or 4))

    def load_vae(self):
        if self.vae is None:
            from musetalk.models.vae import VAE
            self.vae = VAE(str(config.MODELS_DIR / "sd-vae"))
            # Keep the VAE in float32: decoding in fp16 can overflow on Apple GPU.
            self.vae.vae.to(self.device).eval()

    def load_models(self):
        import torch
        from musetalk.models.unet import UNet, PositionalEncoding
        from transformers import WhisperModel
        self.load_vae()
        if self.unet is None:
            self.unet = UNet(str(config.MODELS_DIR / "musetalkV15/musetalk.json"),
                             str(config.MODELS_DIR / "musetalkV15/unet.pth"), device=torch.device("cpu"))
            self.unet.model.to(device=self.device, dtype=self.dtype).eval()
            # Sliced attention limits peak memory for laptop GPUs.
            self.unet.model.set_attention_slice("auto")
            self.pe = PositionalEncoding(d_model=384).to(device=self.device, dtype=self.dtype)
            self.whisper = WhisperModel.from_pretrained(str(config.MODELS_DIR / "whisper"), local_files_only=True)
            self.whisper.to(device=self.device, dtype=self.dtype).eval().requires_grad_(False)

    def prepare_avatar(self, source, avatar_id, name="", seconds=10, progress_cb=None):
        import cv2
        import numpy as np
        import torch
        progress = progress_cb or (lambda stage, pct: None)
        source = Path(source).resolve()
        target = avatar_dir(avatar_id)
        if target.exists():
            raise ValueError("Avatar already exists; use a new ID to preserve it")
        if not source.is_file() or source.suffix.lower() not in {".mp4", ".mov", ".webm", ".mkv", ".png", ".jpg", ".jpeg"}:
            raise ValueError("Choose an existing MP4, MOV, WebM, MKV, PNG or JPEG")
        if not math.isfinite(seconds) or not 0.2 <= seconds <= 30:
            raise ValueError("Avatar source length must be 0.2–30 seconds")
        config.AVATARS_DIR.mkdir(parents=True, exist_ok=True)
        temporary = config.AVATARS_DIR / (".prepare-" + avatar_id)
        temporary.mkdir()
        frames_dir = temporary / "full_imgs"
        frames_dir.mkdir()
        try:
            progress("Normalizing avatar video", 0.02)
            image = source.suffix.lower() in {".png", ".jpg", ".jpeg"}
            normalize = ["ffmpeg", "-v", "error", "-y"] + (["-loop", "1"] if image else [])
            normalize += ["-i", str(source), "-t", str(seconds), "-an", "-vf",
                          "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                          "-r", "25", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(temporary / "source_25fps.mp4")]
            media(normalize)
            if source.suffix.lower() == ".webm":
                info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(source)]))
                video = next(s for s in info["streams"] if s["codec_type"] == "video")
                if video.get("codec_name") == "vp9" and str(video.get("tags", {}).get("alpha_mode")) == "1":
                    shutil.copyfile(source, temporary / "transparent.webm")
            self.load_vae()
            detector = cv2.FaceDetectorYN.create(str(config.MODELS_DIR / "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.85)
            cap = cv2.VideoCapture(str(temporary / "source_25fps.mp4"))
            total = max(1, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
            coords, latents = [], []
            try:
                with torch.inference_mode():
                    while True:
                        ok, frame = cap.read()
                        if not ok:
                            break
                        height, width = frame.shape[:2]
                        detector.setInputSize((width, height))
                        _, faces = detector.detect(frame)
                        if faces is None or len(faces) != 1:
                            raise ValueError(f"Frame {len(coords) + 1}: use one clearly visible, forward-facing face")
                        face = faces[0]
                        # Centre the model's half-mask on the nose; add room for the chin.
                        x, y, w, h = face[:4]
                        nose_y = float(face[9])
                        bottom = min(height, int(y + h + h * 0.06))
                        top = max(0, int(2 * nose_y - bottom))
                        left, right = max(0, int(x)), min(width, int(x + w))
                        if min(right - left, bottom - top) < 48:
                            raise ValueError("Face is too small; use a closer avatar source")
                        box = [left, top, right, bottom]
                        crop = cv2.resize(frame[top:bottom, left:right], (256, 256), interpolation=cv2.INTER_LANCZOS4)
                        latent = self.vae.get_latents_for_unet(crop).cpu()
                        if not torch.isfinite(latent).all():
                            raise RuntimeError("Avatar encoding produced invalid values")
                        if not cv2.imwrite(str(frames_dir / f"{len(coords):08d}.png"), frame):
                            raise RuntimeError("Could not save avatar frame")
                        coords.append(box)
                        latents.append(latent)
                        progress("Preparing face frames", 0.1 + 0.85 * len(coords) / total)
            finally:
                cap.release()
            if not coords:
                raise ValueError("Avatar source has no decodable frames")
            with (temporary / "coords.pkl").open("wb") as stream:
                pickle.dump(coords, stream)
            torch.save(latents, temporary / "latents.pt")
            metadata = {"name": name.strip()[:100] or avatar_id, "preparation_status": "prepared",
                        "resolution": f"{width}x{height}", "fps": 25, "duration": len(coords) / 25,
                        "num_frames_cycle": len(coords) * 2, "adapter_version": 1, "face_detector": "OpenCV YuNet",
                        "tight_crop": {"x": 0, "y": 0, "width": 100, "height": 100}}
            (temporary / "metadata.json").write_text(json.dumps(metadata, indent=2))
            temporary.rename(target)
            progress("Avatar ready", 1)
            return {"avatar_id": avatar_id, **metadata}
        finally:
            shutil.rmtree(temporary, ignore_errors=True)

    def generate_lipsync(self, audio_path, avatar_id, batch_size=1, reuse_prepared=True,
                         progress_cb=None, silence_gate=False, silence_threshold_db=-40):
        import cv2
        import numpy as np
        import torch
        import librosa
        from musetalk.utils.audio_processor import AudioProcessor
        progress = progress_cb or (lambda stage, pct: None)
        directory = avatar_dir(avatar_id)
        metadata = json.loads((directory / "metadata.json").read_text())
        if metadata.get("adapter_version") != 1:
            raise ValueError("Re-prepare this avatar with the bundled MuseTalk adapter")

        # Detect mouthless avatars: base frames have no mouth, so silence gating would erase the mouth completely.
        is_mouthless = metadata.get("source_mode") == "mouthless" or bool(metadata.get("mouthless", False))
        if not is_mouthless and coords:
            try:
                sample_frame = cv2.imread(str(directory / "full_imgs" / "00000000.png"))
                if sample_frame is not None:
                    l, t, r, b = coords[0]
                    mh_w, mh_h = r - l, b - t
                    mouth_y1, mouth_y2 = int(mh_h * 0.60), int(mh_h * 0.85)
                    mouth_x1, mouth_x2 = int(mh_w * 0.25), int(mh_w * 0.75)
                    mouth_crop = sample_frame[t:b, l:r][mouth_y1:mouth_y2, mouth_x1:mouth_x2]
                    gray = cv2.cvtColor(mouth_crop, cv2.COLOR_BGR2GRAY)
                    if cv2.Laplacian(gray, cv2.CV_64F).var() < 60.0:
                        is_mouthless = True
            except Exception:
                pass

        if is_mouthless:
            silence_gate = False

        progress("Loading MuseTalk 1.5 models", 0.05)
        self.load_models()
        latents = torch.load(directory / "latents.pt", map_location="cpu", weights_only=True)
        # Coordinates are created locally during preparation; never accept uploaded pickle files.
        with (directory / "coords.pkl").open("rb") as stream:
            coords = pickle.load(stream)
        if not latents or len(latents) != len(coords):
            raise ValueError("Avatar cache is incomplete; prepare it again")
        progress("Encoding narration", 0.12)
        config.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
        output = config.OUTPUTS_DIR / ("musetalk-" + uuid.uuid4().hex + ".mp4")
        raw_video = output.with_suffix(".silent.mp4")
        wav = output.with_suffix(".wav")
        encoder = None
        try:
            media(["ffmpeg", "-v", "error", "-y", "-i", str(audio_path), "-vn", "-ar", "16000", "-ac", "1", str(wav)])
            waveform, _ = librosa.load(str(wav), sr=16000)
            duration = len(waveform) / 16000
            if duration < 0.2 or duration > 3600:
                raise ValueError("Presenter narration must be 0.2–3600 seconds")
            with torch.inference_mode():
                processor = AudioProcessor(str(config.MODELS_DIR / "whisper"))
                features, length = processor.get_audio_feature(str(wav))
                chunks = processor.get_whisper_chunk(features, self.device, self.dtype, self.whisper, length, fps=25)
                count = math.ceil(duration * 25)
                if len(chunks) < count:
                    chunks = torch.cat([chunks, chunks[-1:].expand(count - len(chunks), -1, -1)])
                width, height = map(int, metadata["resolution"].split("x"))
                encoder = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
                                            "-s", f"{width}x{height}", "-r", "25", "-i", "pipe:0", "-an",
                                            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", str(raw_video)],
                                           stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
                # A single frame per batch bounds memory on Apple Silicon and CPU.
                batch_size = max(1, min(int(batch_size), 8 if self.device.type == "cuda" else 1))
                n = len(latents)
                for start in range(0, count, batch_size):
                    progress("Generating lip-sync", 0.2 + 0.7 * start / count)
                    indices = [i % (2 * n) for i in range(start, min(start + batch_size, count))]
                    indices = [i if i < n else 2 * n - 1 - i for i in indices]
                    batch = torch.cat([latents[i] for i in indices]).to(device=self.device, dtype=self.dtype)
                    audio = self.pe(chunks[start:start + len(indices)].to(device=self.device, dtype=self.dtype))
                    predicted = self.unet.model(batch, torch.zeros(1, device=self.device, dtype=torch.long), encoder_hidden_states=audio).sample
                    if not torch.isfinite(predicted).all():
                        raise RuntimeError("MuseTalk inference produced invalid values; try MUSETALK_DEVICE=cpu")
                    faces = self.vae.decode_latents(predicted.float())
                    for offset, (idx, face) in enumerate(zip(indices, faces)):
                        frame = cv2.imread(str(directory / "full_imgs" / f"{idx:08d}.png"))
                        if frame is None:
                            raise ValueError("Avatar frame is missing; prepare it again")
                        sample = waveform[int((start + offset) * 640):int((start + offset + 1) * 640)]
                        db = 20 * np.log10(max(float(np.sqrt(np.mean(sample ** 2))) if sample.size else 0, 1e-8))
                        if not silence_gate or is_mouthless or db > silence_threshold_db:
                            left, top, right, bottom = coords[idx]
                            w, h = right - left, bottom - top
                            if w > 0 and h > 0:
                                face = cv2.resize(face, (w, h), interpolation=cv2.INTER_LANCZOS4)
                                orig_crop = frame[top:bottom, left:right]

                                # Exact face skin matching in LAB color space
                                face_lab = cv2.cvtColor(face, cv2.COLOR_BGR2LAB).astype(np.float32)
                                orig_lab = cv2.cvtColor(orig_crop, cv2.COLOR_BGR2LAB).astype(np.float32)

                                # Sample lower half of face crop for skin statistics
                                sample_y1, sample_y2 = int(h * 0.50), int(h * 0.90)
                                sample_x1, sample_x2 = int(w * 0.10), int(w * 0.90)

                                for c in range(3):
                                    o_mean = orig_lab[sample_y1:sample_y2, sample_x1:sample_x2, c].mean()
                                    o_std = orig_lab[sample_y1:sample_y2, sample_x1:sample_x2, c].std() + 1e-6
                                    f_mean = face_lab[sample_y1:sample_y2, sample_x1:sample_x2, c].mean()
                                    f_std = face_lab[sample_y1:sample_y2, sample_x1:sample_x2, c].std() + 1e-6
                                    face_lab[..., c] = (face_lab[..., c] - f_mean) * (o_std / f_std) + o_mean

                                face_matched = cv2.cvtColor(np.clip(face_lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

                                # Unsharp mask for crisp lip borders
                                blur = cv2.GaussianBlur(face_matched, (0, 0), sigmaX=1.0)
                                face_sharp = cv2.addWeighted(face_matched, 1.35, blur, -0.35, 0)

                                # High-frequency skin microtexture transfer from original frame
                                orig_hf = cv2.subtract(orig_crop, cv2.GaussianBlur(orig_crop, (0, 0), sigmaX=1.5))
                                face_textured = cv2.addWeighted(face_sharp, 1.0, orig_hf, 0.40, 0)

                                # Tight mouth mask protecting philtrum, chin, cheeks and jawline
                                tight_mask = np.zeros((h, w), np.float32)
                                mouth_cx = w // 2
                                mouth_cy = int(h * 0.725)
                                mouth_rx = int(w * 0.22)
                                mouth_ry = int(h * 0.11)
                                cv2.ellipse(tight_mask, (mouth_cx, mouth_cy), (mouth_rx, mouth_ry), 0, 0, 360, 1, -1)

                                # Hard bounds to preserve philtrum above 0.61*h and chin below 0.85*h
                                tight_mask[:int(h * 0.61), :] = 0
                                tight_mask[int(h * 0.85):, :] = 0

                                # Natural feathering around the tight lips
                                feather = max(3, int(w * 0.035))
                                if feather % 2 == 0:
                                    feather += 1
                                tight_mask = cv2.GaussianBlur(tight_mask, (feather, feather), 0)[..., None]

                                blended = face_textured * tight_mask + orig_crop * (1.0 - tight_mask)
                                frame[top:bottom, left:right] = np.clip(blended, 0, 255).astype(np.uint8)
                        encoder.stdin.write(frame.tobytes())
                encoder.stdin.close()
                if encoder.wait(timeout=120) != 0:
                    raise RuntimeError("Presenter frame encoder failed")
            progress("Finishing presenter video", 0.94)
            media(["ffmpeg", "-v", "error", "-y", "-i", str(raw_video), "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0",
                   "-c:v", "copy", "-c:a", "aac", "-t", str(duration), "-movflags", "+faststart", str(output)])
            progress("Presenter ready", 1)
            return {"output_path": str(output.resolve()), "duration": duration, "device": str(self.device)}
        finally:
            if encoder is not None and encoder.poll() is None:
                encoder.kill()
                encoder.wait()
            raw_video.unlink(missing_ok=True)
            wav.unlink(missing_ok=True)

    def unload_models(self):
        import torch
        self.vae = self.unet = self.whisper = self.pe = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
