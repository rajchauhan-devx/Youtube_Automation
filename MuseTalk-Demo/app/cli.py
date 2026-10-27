"""Local setup/health/avatar preparation; rendering is owned by TubeFlow."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.musetalk_service import MuseTalkService, health


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("health")
    prepare = sub.add_parser("prepare")
    prepare.add_argument("--source", required=True)
    prepare.add_argument("--id", required=True)
    prepare.add_argument("--name", default="")
    prepare.add_argument("--seconds", type=float, default=10)
    args = parser.parse_args()
    if args.command == "health":
        result = health()
        print(json.dumps(result))
        sys.exit(0 if result["installed"] else 1)
    service = MuseTalkService()
    try:
        result = service.prepare_avatar(args.source, args.id, args.name, args.seconds,
                                        lambda stage, pct: print(f"{pct:.0%} {stage}", flush=True))
        print(json.dumps(result))
    finally:
        service.unload_models()


if __name__ == "__main__":
    main()
