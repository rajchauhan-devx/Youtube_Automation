"""Install the bundled inference environment and only the models it uses."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[2] / "MuseTalk-Demo"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights-only", action="store_true")
    args = parser.parse_args()
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not args.weights_only:
        if not python.exists():
            venv.create(ROOT / ".venv", with_pip=True)
        subprocess.run([str(python), "-m", "pip", "install", "--no-cache-dir", "-r", str(ROOT / "requirements-inference.txt")], check=True)
    # Runs inside the isolated interpreter. The model files live in one place,
    # without retaining a second multi-GB global download cache.
    subprocess.run([str(python), str(ROOT / "app" / "download_models.py")], check=True)
    subprocess.run([str(python), str(ROOT / "app" / "cli.py"), "health"], check=True)


if __name__ == "__main__":
    main()
