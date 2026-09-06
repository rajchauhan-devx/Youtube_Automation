[CmdletBinding()]
param(
    [switch]$Cpu,
    [switch]$SkipModelDownload,
    [switch]$CacheOnly
)

$ErrorActionPreference = 'Stop'
$serviceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDir = Join-Path $serviceDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$requirements = Join-Path $serviceDir 'requirements.txt'
$serverDir = Split-Path -Parent $serviceDir
$modelCacheDir = Join-Path $serverDir 'data\model-cache'
$env:PKUSEG_HOME = Join-Path $modelCacheDir 'pkuseg'
New-Item -ItemType Directory -Force -Path $env:PKUSEG_HOME | Out-Null

function Find-Python310 {
    if ($env:CHATTERBOX_BOOTSTRAP_PYTHON -and (Test-Path -LiteralPath $env:CHATTERBOX_BOOTSTRAP_PYTHON)) {
        return $env:CHATTERBOX_BOOTSTRAP_PYTHON
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Python\pythoncore-3.10-64\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python310\python.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    $command = Get-Command python3.10 -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw 'Python 3.10 was not found. Install Python 3.10 x64 or set CHATTERBOX_BOOTSTRAP_PYTHON.'
}

$bootstrapPython = Find-Python310
Write-Host "Using Python: $bootstrapPython"

if ($CacheOnly) {
    if (-not (Test-Path -LiteralPath $venvPython)) {
        throw 'Chatterbox is not installed yet. Run setup.ps1 without -CacheOnly first.'
    }
    & $venvPython (Join-Path $serviceDir 'prefetch.py')
    Write-Host 'Chatterbox model and tokenizer caches are ready.'
    exit 0
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    & $bootstrapPython -m venv $venvDir
}

& $venvPython -m pip install --upgrade pip setuptools wheel

if (-not $Cpu -and (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    Write-Host 'Installing CUDA 12.4 PyTorch wheels...'
    & $venvPython -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
} else {
    Write-Host 'Installing CPU PyTorch wheels...'
    & $venvPython -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
}

& $venvPython -m pip install -r $requirements

# PyPI currently reports the same package version as the V3 source tree, so pip may
# otherwise keep an older wheel during an in-place upgrade. Repair only when needed.
& $venvPython -c "import inspect; from chatterbox.mtl_tts import ChatterboxMultilingualTTS; raise SystemExit(0 if 't3_model' in inspect.signature(ChatterboxMultilingualTTS.from_pretrained).parameters else 1)"
if ($LASTEXITCODE -ne 0) {
    & $venvPython -m pip install --force-reinstall --no-deps 'chatterbox-tts @ git+https://github.com/resemble-ai/chatterbox.git@5de7a54aa4e5e2baadb0182dde554908b48b85c2'
}

& $venvPython -c "import torch, fastapi, uvicorn; from chatterbox.mtl_tts import ChatterboxMultilingualTTS; print('Chatterbox dependencies OK'); print('CUDA:', torch.cuda.is_available()); print('Torch:', torch.__version__)"

if (-not $SkipModelDownload) {
    Write-Host 'Downloading Chatterbox Multilingual V3 model files (one-time download)...'
    & $venvPython (Join-Path $serviceDir 'prefetch.py')
}

Write-Host ''
Write-Host 'Chatterbox setup complete.'
Write-Host 'Start the app with: npm run dev'
