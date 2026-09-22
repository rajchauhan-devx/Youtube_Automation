"""TubeFlow-owned worker. Reuses the installed MuseTalk engine and avatar cache.

One process per job: exiting releases model memory, cancellation kills this
process tree, and all new output/temp files stay inside the script workspace.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import traceback
import faulthandler


def event(**data):
    print("TUBEFLOW_EVENT " + json.dumps(data), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    request = json.loads(Path(args.request).read_text(encoding="utf-8"))
    root = Path(request["root"]).resolve()
    work = Path(request["work"]).resolve()
    diagnostics = open(work / "worker-stack.log", "w", encoding="utf-8")
    faulthandler.dump_traceback_later(60, repeat=True, file=diagnostics)
    sys.path.insert(0, str(root))
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    event(stage="Loading presenter engine", progress=2)
    from app import config
    # Set these BEFORE importing the service, which imports path constants.
    config.OUTPUTS_DIR = work
    config.TEMP_DIR = work / "temp"
    config.TEMP_DIR.mkdir(exist_ok=True)
    from app.musetalk_service import MuseTalkService
    import torch
    import cv2
    torch.set_num_threads(2)
    cv2.setNumThreads(2)
    original_imread = cv2.imread
    def cancellable_imread(*args, **kwargs):
        if (work / "cancel.request").exists():
            raise RuntimeError("Presenter generation cancelled.")
        return original_imread(*args, **kwargs)
    cv2.imread = cancellable_imread
    service = MuseTalkService()
    def progress(stage, pct):
        if (work / "cancel.request").exists():
            raise RuntimeError("Presenter generation cancelled.")
        event(stage=stage, progress=round(pct * 100))
    try:
        progress("Presenter engine ready", 0.03)
        result = service.generate_lipsync(
            audio_path=request["audio"], avatar_id=request["avatarId"],
            batch_size=4, reuse_prepared=True,
            silence_gate=request["silenceGate"],
            silence_threshold_db=request["silenceThresholdDb"],
            progress_cb=progress,
        )
        output = Path(result["output_path"]).resolve()
        if output.parent != work:
            raise RuntimeError("MuseTalk output escaped the job directory")
        destination = work / "presenter.mp4"
        output.replace(destination)
        result["output_path"] = str(destination)
        event(result=result)
    finally:
        cv2.imread = original_imread
        faulthandler.cancel_dump_traceback_later()
        diagnostics.close()
        service.unload_models()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        traceback.print_exc()
        event(error=str(error))
        sys.exit(1)
