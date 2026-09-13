"""Entrenamiento de FLUX.1 LoRA en Modal Cloud GPU.

Lanzado automáticamente por la UI — no es necesario ejecutar manualmente.
Para lanzar manualmente:
  modal run run_modal.py --config-file config/iter_03_train.yaml --gpu-type A10G

GPUs disponibles en Modal:
  L4           (24 GB, ~$0.80/h)
  A10G         (24 GB, ~$1.10/h, recomendada)
  A100-40GB    (40 GB, ~$3.00/h)
  H100         (80 GB)
"""

import os
import json
import time
from pathlib import Path

import modal

_HERE = Path(__file__).parent
REMOTE_ROOT = "/root/ai-toolkit"
VOLUME_DIR = "/root/modal_output"
HF_CACHE_DIR = "/root/hf_cache"

FLUX_PREFETCH_ALLOW_PATTERNS = [
    "model_index.json",
    "scheduler/*",
    "text_encoder/*",
    "text_encoder_2/*",
    "tokenizer/*",
    "tokenizer_2/*",
    "transformer/*",
    "vae/*",
]

# ---------------------------------------------------------------------------
# Volumen persistente para guardar los LoRA entrenados
# ---------------------------------------------------------------------------
model_volume = modal.Volume.from_name("flux-lora-models", create_if_missing=True)
hf_cache_volume = modal.Volume.from_name("flux-lora-hf-cache", create_if_missing=True)

# ---------------------------------------------------------------------------
# Imagen del contenedor con todas las dependencias
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "git")
    .pip_install(
        # Pin transformers + tokenizers FIRST to prevent pip backtracking cascade
        "transformers==4.57.3",
        "tokenizers==0.22.1",
        "huggingface_hub>=0.24.0,<1.0",
        # Core training stack
        "torch==2.6.0",
        "torchvision==0.21.0",
        "accelerate",
        # Pinned git commit required by ltx2 extension (PyPI release is too old)
        "diffusers @ git+https://github.com/huggingface/diffusers@8600b4c10d67b0ce200f664204358747bd53c775",
        "av",  # required by diffusers ltx2 video export utilities
        "controlnet-aux==0.0.10",
        "safetensors",
        "peft",
        # LoRA / model utilities
        "lycoris-lora==1.8.3",
        "optimum-quanto==0.2.4",
        "bitsandbytes",
        "sentencepiece",
        "omegaconf",
        "open_clip_torch",
        "timm",
        # Dataset / image processing — pin scipy+albumentations to avoid deep backtracking
        "scipy==1.12.0",
        "albumentations==1.4.15",
        "albucore==0.0.16",
        "opencv-python-headless",
        "kornia",
        "lpips",
        # Training utilities
        "prodigyopt",
        "tensorboard",
        "einops",
        "ftfy",
        "oyaml",
        "pyyaml",
        "toml",
        "flatten_json",
        "pydantic",
        "python-dotenv",
        "hf_transfer",
        "torchaudio==2.6.0",
        "torchao==0.10.0",
    )
    # k-diffusion is installed AFTER the main step so scipy/requests are already
    # locked, preventing the resolution-too-deep conflict caused by clean-fid.
    .run_commands("pip install k-diffusion --quiet")
    .env({
        "PYTHONPATH": REMOTE_ROOT,
        "DISABLE_TELEMETRY": "YES",
        "NO_ALBUMENTATIONS_UPDATE": "1",
        "HF_HOME": HF_CACHE_DIR,
        "HF_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
        "HUGGINGFACE_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
        "TRANSFORMERS_CACHE": f"{HF_CACHE_DIR}/transformers",
        "HF_HUB_ENABLE_HF_TRANSFER": "0",
    })
    .add_local_file(str(_HERE / "info.py"), remote_path=f"{REMOTE_ROOT}/info.py")
    .add_local_file(str(_HERE / "version.py"), remote_path=f"{REMOTE_ROOT}/version.py")
    .add_local_dir(str(_HERE / "toolkit"), remote_path=f"{REMOTE_ROOT}/toolkit")
    .add_local_dir(str(_HERE / "jobs"), remote_path=f"{REMOTE_ROOT}/jobs")
    .add_local_dir(str(_HERE / "extensions_built_in"), remote_path=f"{REMOTE_ROOT}/extensions_built_in")
    .add_local_dir(str(_HERE / "extensions"), remote_path=f"{REMOTE_ROOT}/extensions")
    .add_local_dir(str(_HERE / "datasets"), remote_path=f"{REMOTE_ROOT}/datasets")
)

# ---------------------------------------------------------------------------
# App Modal
# ---------------------------------------------------------------------------
app = modal.App(name="flux-lora-training", image=image)


@app.function(
    gpu="A10G",  # default; se sobreescribe con .with_options(gpu=...) al llamar
    timeout=7200,  # 2 horas
    volumes={VOLUME_DIR: model_volume, HF_CACHE_DIR: hf_cache_volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
def train(config_json: str):
    """Ejecuta el entrenamiento LoRA en el contenedor Modal."""
    import sys as _sys
    import platform
    _sys.path.insert(0, REMOTE_ROOT)
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"
    os.environ["HF_HOME"] = HF_CACHE_DIR
    os.environ["HF_HUB_CACHE"] = f"{HF_CACHE_DIR}/hub"
    os.environ["HUGGINGFACE_HUB_CACHE"] = f"{HF_CACHE_DIR}/hub"
    os.environ["TRANSFORMERS_CACHE"] = f"{HF_CACHE_DIR}/transformers"

    from toolkit.job import get_job

    train_started_at = time.perf_counter()
    config = json.loads(config_json)
    training_name = config["config"]["name"]

    # Redirigir la carpeta de salida al volumen persistente
    config["config"]["process"][0]["training_folder"] = VOLUME_DIR
    # La base de datos va al volumen (no a la máquina local)
    config["config"]["process"][0]["sqlite_db_path"] = f"{VOLUME_DIR}/{training_name}_db.db"

    os.makedirs(VOLUME_DIR, exist_ok=True)

    print(f"[Modal] Starting training: {training_name}")
    print(f"[Modal] Output path in volume: {VOLUME_DIR}/{training_name}/")
    os.makedirs(HF_CACHE_DIR, exist_ok=True)
    os.makedirs(f"{HF_CACHE_DIR}/hub", exist_ok=True)
    os.makedirs(f"{HF_CACHE_DIR}/transformers", exist_ok=True)
    print(f"[Modal debug] Python: {_sys.version.split()[0]} on {platform.platform()}", flush=True)
    print(f"[Modal debug] HF cache dir: {HF_CACHE_DIR}", flush=True)

    try:
        import torch
        print(f"[Modal debug] CUDA available: {torch.cuda.is_available()}", flush=True)
        if torch.cuda.is_available():
            device_index = torch.cuda.current_device()
            props = torch.cuda.get_device_properties(device_index)
            total_gb = props.total_memory / 1024**3
            print(
                f"[Modal debug] CUDA device: {torch.cuda.get_device_name(device_index)} "
                f"({total_gb:.1f} GB)",
                flush=True,
            )
    except Exception as cuda_debug_error:
        print(f"[Modal debug] Could not read CUDA info: {cuda_debug_error}", flush=True)

    # Si viene un pretrained LoRA en base64, escribirlo al filesystem del contenedor
    proc0 = config["config"]["process"][0]
    model_cfg = proc0.get("model", {})
    train_cfg = proc0.get("train", {})
    sample_cfg = proc0.get("sample", {})
    print(
        "[Modal debug] Config summary: "
        f"model={model_cfg.get('name_or_path')} arch={model_cfg.get('arch')} "
        f"quantize={model_cfg.get('quantize')} qtype={model_cfg.get('qtype')} "
        f"low_vram={model_cfg.get('low_vram')} steps={train_cfg.get('steps')} "
        f"skip_first_sample={train_cfg.get('skip_first_sample')} "
        f"disable_sampling={train_cfg.get('disable_sampling')} "
        f"sample_every={sample_cfg.get('sample_every')} samples={len(sample_cfg.get('samples', []))}",
        flush=True,
    )

    for idx, dataset in enumerate(proc0.get("datasets", []), start=1):
        dataset_path = dataset.get("folder_path", "")
        image_count = 0
        caption_count = 0
        if dataset_path and os.path.isdir(dataset_path):
            for name in os.listdir(dataset_path):
                lower = name.lower()
                if lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                    image_count += 1
                elif lower.endswith(".txt"):
                    caption_count += 1
        print(
            f"[Modal debug] Dataset {idx}: path={dataset_path} "
            f"exists={os.path.isdir(dataset_path)} images={image_count} captions={caption_count}",
            flush=True,
        )

    lora_b64 = proc0.pop("_pretrained_lora_b64", None)
    lora_remote = proc0.pop("_pretrained_lora_remote_path", None)
    if lora_b64 and lora_remote:
        import base64
        os.makedirs(os.path.dirname(lora_remote), exist_ok=True)
        with open(lora_remote, "wb") as _f:
            _f.write(base64.b64decode(lora_b64))
        print(f"[Modal] Pretrained LoRA written to {lora_remote}")
        print(f"[Modal debug] Pretrained LoRA size: {os.path.getsize(lora_remote) / 1024**2:.1f} MB", flush=True)
    else:
        lora_path = proc0.get("network", {}).get("pretrained_lora_path")
        if lora_path:
            print(
                f"[Modal debug] Pretrained LoRA path={lora_path} exists={os.path.exists(lora_path)}",
                flush=True,
            )

    # Escribir config temporal para get_job (después de limpiar campos internos)
    model_name = model_cfg.get("name_or_path")
    model_arch = model_cfg.get("arch")
    should_prefetch_flux = (
        model_arch == "flux"
        and isinstance(model_name, str)
        and model_name
        and not os.path.exists(model_name)
    )
    if should_prefetch_flux:
        from huggingface_hub import snapshot_download

        prefetch_started_at = time.perf_counter()
        print(
            f"[Modal debug] Prefetching FLUX model snapshot: {model_name} "
            f"into {HF_CACHE_DIR}",
            flush=True,
        )
        try:
            snapshot_path = snapshot_download(
                repo_id=model_name,
                cache_dir=HF_CACHE_DIR,
                allow_patterns=FLUX_PREFETCH_ALLOW_PATTERNS,
                max_workers=4,
            )
            print(
                f"[Modal debug] FLUX snapshot ready at {snapshot_path} "
                f"in {(time.perf_counter() - prefetch_started_at) / 60:.1f} min",
                flush=True,
            )
            print("[Modal debug] Committing Hugging Face cache volume", flush=True)
            hf_cache_volume.commit()
        except Exception as prefetch_error:
            print(f"[Modal debug] FLUX snapshot prefetch failed: {prefetch_error}", flush=True)
            raise
    else:
        print(
            f"[Modal debug] Skipping model prefetch: arch={model_arch} model={model_name}",
            flush=True,
        )

    config_path = f"/tmp/{training_name}_config.json"
    with open(config_path, "w") as f:
        json.dump(config, f)

    job_build_started_at = time.perf_counter()
    print(f"[Modal debug] Building job object from {config_path}", flush=True)
    job = get_job(config_path)
    print(f"[Modal debug] get_job() completed in {time.perf_counter() - job_build_started_at:.1f}s", flush=True)

    print("[Modal debug] job.run() starting", flush=True)
    job.run()
    print(f"[Modal debug] job.run() finished in {(time.perf_counter() - job_build_started_at) / 60:.1f} min", flush=True)

    # Persistir resultados en el volumen antes de que el contenedor muera
    print("[Modal debug] Committing Modal volume", flush=True)
    model_volume.commit()
    print("[Modal debug] Committing Hugging Face cache volume", flush=True)
    hf_cache_volume.commit()
    job.cleanup()

    print(
        f"[Modal] Training complete! LoRA saved to volume 'flux-lora-models/{training_name}/' "
        f"after {(time.perf_counter() - train_started_at) / 60:.1f} min"
    )


@app.local_entrypoint()
def main(config_file: str, gpu_type: str = "A10G"):
    """
    Entrypoint local. Lee el config, ajusta rutas de Windows → Linux y
    lanza el entrenamiento en Modal. Descarga los resultados al terminar.
    """
    import subprocess

    print(f"[Modal] GPU: {gpu_type}", flush=True)

    with open(config_file, encoding="utf-8") as f:
        config = json.load(f)

    training_name = config["config"]["name"]
    orig_training_folder = config["config"]["process"][0].get("training_folder", "outputs")

    print(f"[Modal] Job: {training_name}", flush=True)

    # Ajustar rutas de datasets de Windows → contenedor Linux
    # (startJob.ts may have already converted them to /root/ai-toolkit/... paths)
    for dataset in config.get("config", {}).get("process", [{}])[0].get("datasets", []):
        fp = dataset.get("folder_path", "")
        if not fp:
            continue
        if fp.startswith(REMOTE_ROOT):
            # Already a Linux container path — no conversion needed
            print(f"[Modal] Dataset: {fp} (already converted)")
        elif os.path.isabs(fp):
            try:
                rel = os.path.relpath(fp, str(_HERE)).replace("\\", "/")
                dataset["folder_path"] = f"{REMOTE_ROOT}/{rel}"
                print(f"[Modal] Dataset: {fp}")
                print(f"         → {dataset['folder_path']}")
            except Exception as e:
                print(f"[Modal] WARNING: Could not convert dataset path '{fp}': {e}")

    # Convertir pretrained_lora_path de ruta Windows local → ruta del contenedor.
    # El archivo se sube al contenedor via Modal Function call payload (base64).
    proc0 = config["config"]["process"][0]
    network = proc0.get("network", {})
    lora_path = network.get("pretrained_lora_path", "")
    if lora_path:
        # Resolver a ruta absoluta desde _HERE si es relativa
        if not os.path.isabs(lora_path):
            lora_abs = str(_HERE / lora_path.replace("\\", "/"))
        else:
            lora_abs = lora_path
        if os.path.exists(lora_abs):
            import base64
            with open(lora_abs, "rb") as _f:
                lora_b64 = base64.b64encode(_f.read()).decode()
            # Pasar el contenido en base64 y la ruta remota destino
            rel = os.path.relpath(lora_abs, str(_HERE)).replace("\\", "/")
            remote_lora_path = f"{REMOTE_ROOT}/{rel}"
            network["pretrained_lora_path"] = remote_lora_path
            proc0["_pretrained_lora_b64"] = lora_b64
            proc0["_pretrained_lora_remote_path"] = remote_lora_path
            print(f"[Modal] Pretrained LoRA: {lora_abs}")
            print(f"         → {remote_lora_path} (uploading {os.path.getsize(lora_abs)//1024//1024} MB)")
        else:
            print(f"[Modal] WARNING: pretrained_lora_path '{lora_abs}' not found locally, skipping upload")

    config_json = json.dumps(config)

    print(f"[Modal] Launching remote training on {gpu_type}...", flush=True)
    train.with_options(gpu=gpu_type).remote(config_json)

    print(f"[Modal] Training complete!", flush=True)
    print(f"[Modal] Downloading results from Modal volume 'flux-lora-models'...")

    # Normalizar ruta de destino local
    if os.path.isabs(orig_training_folder):
        try:
            orig_training_folder = os.path.relpath(orig_training_folder, str(_HERE))
        except Exception:
            orig_training_folder = "outputs"

    local_dest = os.path.join(str(_HERE), orig_training_folder)
    os.makedirs(local_dest, exist_ok=True)

    # Use the same Python interpreter's modal CLI so the venv doesn't need to
    # be on PATH (the UI worker may not inherit the venv environment).
    import sys
    _scripts_dir = Path(sys.executable).parent
    # On Windows the entry-point is modal.exe; on Linux/macOS just "modal"
    _modal_name = "modal.exe" if os.name == "nt" else "modal"
    modal_exe = _scripts_dir / _modal_name
    modal_cmd = str(modal_exe) if modal_exe.exists() else "modal"

    result = subprocess.run(
        [modal_cmd, "volume", "get", "flux-lora-models", training_name, local_dest, "--force"],
        cwd=str(_HERE),
    )

    if result.returncode == 0:
        print(f"[Modal] LoRA downloaded to: {os.path.join(local_dest, training_name)}/")
    else:
        print(f"[Modal] WARNING: Auto-download failed. Run manually:")
        print(f"  modal volume get flux-lora-models {training_name} {local_dest}/")

