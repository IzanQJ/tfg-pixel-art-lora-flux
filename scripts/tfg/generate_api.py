"""
Script NO interactivo para generar imágenes pixel-art con FLUX + LoRA.
Basado en generate_single.py pero con argumentos CLI para uso desde la web app.

Uso:
  python scripts/tfg/generate_api.py --prompt "dragon sprite" --model iter_02
  python scripts/tfg/generate_api.py --prompt "castle" --model base --seed 42
"""

import argparse
import gc
import json
import os
import random
import re
import sys
import time

import torch

# Mapeo de iteración → ruta relativa del LoRA (desde la raíz del repo)
LORA_PATHS = {
    "iter_01": "outputs/iter_01/pixel_art_lora_v1/pixel_art_lora_v1.safetensors",
    "iter_02": "outputs/iter_02/pixel_art_lora_v2/pixel_art_lora_v2.safetensors",
    "iter_03": "outputs/iter_03/pixel_art_lora_v3/pixel_art_lora_v3.safetensors",
    "iter_03_Arreglo": "outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/pixel_art_lora_v3_Arreglo.safetensors",
    "iter_04": "outputs/iter_04/pixel_art_lora_v4/pixel_art_lora_v4.safetensors",
}

BASE_MODEL = "black-forest-labs/FLUX.1-dev"
BASE_OUTPUT_ID = "flux_base"
CHECKPOINT_PATTERN = re.compile(r"_\d{9}\.safetensors$")


def is_safe_model_id(model_id):
    return (
        isinstance(model_id, str)
        and model_id.strip() == model_id
        and model_id not in ("", ".", "..")
        and "/" not in model_id
        and "\\" not in model_id
    )


def find_dynamic_lora_path(model_id):
    if not is_safe_model_id(model_id):
        return None

    outputs_root = os.path.abspath("outputs")
    model_root = os.path.abspath(os.path.join(outputs_root, model_id))
    if not model_root.startswith(outputs_root + os.sep) or not os.path.isdir(model_root):
        return None

    candidates = []
    for root, _, files in os.walk(model_root):
        for filename in files:
            if not filename.endswith(".safetensors"):
                continue
            if CHECKPOINT_PATTERN.search(filename):
                continue
            candidates.append(os.path.join(root, filename))

    if not candidates:
        return None

    def candidate_score(candidate):
        filename_no_ext = os.path.splitext(os.path.basename(candidate))[0]
        exact_name = 0 if filename_no_ext == model_id else 1
        depth = os.path.relpath(candidate, model_root).count(os.sep)
        return exact_name, depth, candidate

    candidates.sort(key=candidate_score)
    return os.path.relpath(candidates[0], os.getcwd()).replace("\\", "/")


def resolve_lora_path(model_id):
    if model_id in LORA_PATHS:
        return LORA_PATHS[model_id]
    return find_dynamic_lora_path(model_id)


def parse_args():
    parser = argparse.ArgumentParser(description="Genera imágenes pixel-art con FLUX + LoRA")
    parser.add_argument("--prompt", required=True, help="Prompt de generación")
    parser.add_argument(
        "--model",
        required=True,
        help="Modelo: base (sin LoRA), iteracion catalogada o carpeta de outputs con LoRA",
    )
    parser.add_argument("--seed", type=int, default=None, help="Seed (aleatorio si no se indica)")
    parser.add_argument("--steps", type=int, default=20, help="Pasos de inferencia")
    parser.add_argument("--guidance", type=float, default=4.0, help="Guidance scale")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    return parser.parse_args()


def main():
    args = parse_args()

    # --- Normalizar prompt ---
    prompt = args.prompt.strip()
    if not prompt.lower().startswith("pixelart"):
        prompt = f"pixelart, {prompt}"

    seed = args.seed if args.seed is not None else random.randint(0, 999_999)
    is_base = args.model == "base"
    lora_path = None if is_base else resolve_lora_path(args.model)

    # Validar que el LoRA exista
    if not is_base and not lora_path:
        print(json.dumps({"status": "error", "error": f"LoRA not found for model: {args.model}"}))
        sys.exit(1)
    if lora_path and not os.path.isfile(lora_path):
        print(json.dumps({"status": "error", "error": f"LoRA not found: {lora_path}"}))
        sys.exit(1)

    # --- Cargar pipeline ---
    # Importar aquí para que el --help sea rápido
    from diffusers import FluxPipeline

    print("Cargando FLUX.1-dev en CPU...", file=sys.stderr)
    torch.cuda.empty_cache()
    gc.collect()

    # La version actual de diffusers en este entorno todavia espera torch_dtype.
    # Usar dtype se ignora y puede hacer que FLUX cargue en un formato mas pesado.
    pipe = FluxPipeline.from_pretrained(BASE_MODEL, torch_dtype=torch.bfloat16)
    pipe.to("cpu")

    if lora_path:
        print(f"Cargando LoRA: {lora_path}", file=sys.stderr)
        pipe.load_lora_weights(lora_path)

    print("Activando sequential CPU offload...", file=sys.stderr)
    pipe.enable_sequential_cpu_offload()

    try:
        pipe.enable_attention_slicing()
    except Exception:
        pass
    try:
        if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_slicing"):
            pipe.vae.enable_slicing()
        else:
            pipe.enable_vae_slicing()
    except Exception:
        pass

    # --- Generar ---
    print(f"Generando (seed={seed})...", file=sys.stderr)
    generator = torch.Generator("cpu").manual_seed(seed)

    image = pipe(
        prompt=prompt,
        num_inference_steps=args.steps,
        guidance_scale=args.guidance,
        width=args.width,
        height=args.height,
        generator=generator,
        joint_attention_kwargs={"scale": 1.0} if lora_path else None,
    ).images[0]

    # --- Guardar ---
    saved = False
    out_path = None

    output_id = BASE_OUTPUT_ID if is_base else args.model
    outdir = os.path.join("outputs", output_id, "generated")
    os.makedirs(outdir, exist_ok=True)
    timestamp = int(time.time())
    prefix = "flux_base" if is_base else "pixelart"
    filename = f"{prefix}_seed{seed}_{timestamp}.png"
    out_path = os.path.join(outdir, filename)
    image.save(out_path)
    # Normalizar a forward-slashes para JSON
    out_path = out_path.replace("\\", "/")
    saved = True

    # --- Resultado JSON (última línea de stdout) ---
    result = {"status": "ok", "saved": saved, "path": out_path, "seed": seed}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
