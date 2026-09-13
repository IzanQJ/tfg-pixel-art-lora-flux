"""
Generador simple usando el mismo sistema del entrenamiento (con cuantización completa)
Uso: python generate_simple.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import torch
from toolkit.job import get_job

# Configuración de generación
config = {
    "job": "extension",
    "config": {
        "name": "generate_test_iter01",
        "process": [
            {
                "type": "sd_trainer",
                "training_folder": "outputs/iter_01",
                "device": "cuda:0",
                "trigger_word": "pixelart",
                
                # Configuración del modelo (igual que entrenamiento)
                "model": {
                    "name_or_path": "black-forest-labs/FLUX.1-dev",
                    "is_flux": True,
                    "quantize": True  # Cuantización completa
                },
                
                # Red LoRA entrenada
                "network": {
                    "type": "lora",
                    "linear": 16,
                    "linear_alpha": 16
                },
                
                # Cargar checkpoint
                "network_weight": "outputs/iter_01/pixel_art_lora_v1/pixel_art_lora_v1.safetensors",
                
                # Configuración de muestreo
                "sample": {
                    "sampler": "flowmatch",
                    "width": 512,
                    "height": 512,
                    "prompts": [
                        # Prompt personalizado (el usuario lo cambiará aquí)
                        "pixelart, blocky armored soldier sprite, front view, simple colors, retro game style"
                    ],
                    "neg": "",
                    "seed": 42,
                    "guidance_scale": 4,
                    "sample_steps": 20
                }
            }
        ]
    }
}

print("=" * 70)
print("🎨 GENERADOR CON CUANTIZACIÓN COMPLETA")
print("=" * 70)
print("\n⚠️  IMPORTANTE: Edita este archivo para cambiar el prompt")
print("    Línea ~48: Cambia el texto entre comillas\n")
print(f"📝 Prompt actual: {config['config']['process'][0]['sample']['prompts'][0]}\n")
print("🔄 Cargando FLUX.1-dev con cuantización completa (2-3 min)...")
print("    Esto usa el mismo sistema que el entrenamiento\n")

# Generar usando el sistema del toolkit
job = get_job(config)
job.run()

print("\n" + "=" * 70)
print("✅ ¡IMAGEN GENERADA!")
print("📁 Busca la imagen en: outputs/iter_01/generate_test_iter01/samples/")
print("=" * 70)
