"""TubeFlow-owned worker. Reuses the installed MuseTalk engine and avatar cache.

One process per job: exiting releases model memory, cancellation kills this
process tree, and all new output/temp files stay inside the script workspace.
"""
import argparse
import inspect
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
    num_threads = min(8, os.cpu_count() or 4)
    torch.set_num_threads(num_threads)
    cv2.setNumThreads(num_threads)
    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
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
        if request.get("action") == "prepare":
            result = service.prepare_avatar(request["source"], request["avatarId"],
                                            request.get("name", ""), request.get("seconds", 10), progress)
            event(result=result)
            return
        sig = inspect.signature(service.generate_lipsync)
        kwargs = {
            "audio_path": request["audio"],
            "avatar_id": request["avatarId"],
            "batch_size": request.get("batchSize", 8),
            "reuse_prepared": True,
            "progress_cb": progress,
        }
        if "silence_gate" in sig.parameters:
            kwargs["silence_gate"] = request.get("silenceGate", False)
        if "silence_threshold_db" in sig.parameters:
            kwargs["silence_threshold_db"] = request.get("silenceThresholdDb", -40)

        result = service.generate_lipsync(**kwargs)
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
