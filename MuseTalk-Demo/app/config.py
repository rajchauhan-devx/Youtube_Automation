from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE_DIR = ROOT / "MuseTalk"
MODELS_DIR = ENGINE_DIR / "models"
AVATARS_DIR = ROOT / "avatars" / "prepared"
OUTPUTS_DIR = ROOT / "outputs"
TEMP_DIR = ROOT / "temp"
