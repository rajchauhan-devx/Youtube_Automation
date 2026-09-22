"""Download the official ComfyUI ACE-Step models, resume downloads and verify hashes."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import requests

ROOT = Path(__file__).resolve().parents[2]
REPO = 'Comfy-Org/ace_step_1.5_ComfyUI_files'
FILES = [
    'diffusion_models/acestep_v1.5_turbo.safetensors',
    'text_encoders/qwen_0.6b_ace15.safetensors',
    'text_encoders/qwen_1.7b_ace15.safetensors',
    'vae/ace_1.5_vae.safetensors',
]

def main():
    response = requests.get(f'https://huggingface.co/api/models/{REPO}?blobs=true', timeout=60)
    response.raise_for_status()
    metadata = response.json()
    revision = metadata['sha']
    entries = {entry['rfilename']: entry for entry in metadata['siblings']}
    print(f'Official model revision: {revision}', flush=True)

    def download(name):
        entry = entries[f'split_files/{name}']
        expected = entry['lfs']['sha256']
        target = ROOT / 'ComfyUI/models' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_suffix('.partial')
        def digest(file):
            with file.open('rb') as handle:
                return hashlib.file_digest(handle, 'sha256').hexdigest()
        if target.exists() and digest(target) == expected:
            print(f'Already verified: {name}', flush=True)
            return
        offset = partial.stat().st_size if partial.exists() else 0
        if offset < entry['size']:
            url = f'https://huggingface.co/{REPO}/resolve/{revision}/split_files/{name}'
            with requests.get(url, headers={'Range': f'bytes={offset}-'} if offset else {}, stream=True, timeout=(60, 120)) as stream:
                stream.raise_for_status()
                mode = 'ab' if offset and stream.status_code == 206 else 'wb'
                size = offset if mode == 'ab' else 0
                reported = size // (512 * 1024 * 1024)
                with partial.open(mode) as file:
                    for block in stream.iter_content(4 * 1024 * 1024):
                        file.write(block)
                        size += len(block)
                        if size // (512 * 1024 * 1024) > reported:
                            reported = size // (512 * 1024 * 1024)
                            print(f'{name}: {size / entry["size"]:.0%}', flush=True)
        if partial.stat().st_size != entry['size'] or digest(partial) != expected:
            raise RuntimeError(f'Download verification failed: {name}')
        partial.replace(target)
        print(f'Verified: {name}', flush=True)

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(download, FILES))
    print('ACE-Step music models installed and verified.', flush=True)

if __name__ == '__main__':
    main()
