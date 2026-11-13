#!/usr/bin/env python3
"""Separates clean dry vocals from a mixed music track using cached HDEMUCS and writes a 16kHz mono WAV."""

import subprocess
import sys
import numpy as np
import torch
import torchaudio


def main() -> int:
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: extract_vocals.py <input_audio> <output_16k_wav>\n")
        return 2

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    bundle = torchaudio.pipelines.HDEMUCS_HIGH_MUSDB_PLUS
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = bundle.get_model().to(device).eval()
    sr = bundle.sample_rate

    raw = subprocess.check_output(
        ["ffmpeg", "-y", "-v", "error", "-i", input_path, "-ar", str(sr), "-ac", "2", "-f", "f32le", "pipe:1"]
    )
    if not raw:
        sys.stderr.write("Decoded PCM was empty\n")
        return 1

    wav = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()
    waveform = torch.from_numpy(wav).to(device).unsqueeze(0)

    ref = waveform.mean(0)
    mean = ref.mean()
    std = ref.std() + 1e-8
    waveform_norm = (waveform - mean) / std

    chunk_len = sr * 10
    overlap = sr * 2
    step = chunk_len - overlap
    total_len = waveform.shape[-1]

    with torch.no_grad():
        out = torch.zeros((1, 4, 2, total_len), device=device)
        wsum = torch.zeros(total_len, device=device)
        win = torch.hann_window(chunk_len, device=device)
        for s in range(0, total_len, step):
            e = min(total_len, s + chunk_len)
            seg = waveform_norm[..., s:e]
            pad = chunk_len - seg.shape[-1]
            if pad > 0:
                seg = torch.nn.functional.pad(seg, (0, pad))
            est = model(seg)
            valid = e - s
            w = win[:valid]
            out[..., s:e] += est[..., :valid] * w
            wsum[s:e] += w
        out = out / wsum.clamp(min=1e-6)
        sources = out * std + mean

    sources_list = getattr(bundle, "_sources_list", ["drums", "bass", "other", "vocals"])
    vocals_idx = sources_list.index("vocals") if "vocals" in sources_list else 3
    vocals = sources[0, vocals_idx].mean(0).detach().cpu().numpy()
    pcm = np.clip(vocals, -1.0, 1.0).astype("<f4").tobytes()

    proc = subprocess.Popen(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output_path,
        ],
        stdin=subprocess.PIPE,
    )
    proc.communicate(pcm)
    return proc.returncode or 0


if __name__ == "__main__":
    raise SystemExit(main())
