"""
Script para generar imágenes con el LoRA entrenado
Uso: python generate_test.py
"""

from diffusers import FluxPipeline
from transformers import T5EncoderModel, BitsAndBytesConfig
import torch
import random

# Configuración
LORA_PATH = "outputs/iter_01/pixel_art_lora_v1/pixel_art_lora_v1.safetensors"
OUTPUT_FOLDER = "outputs/iter_01/test_generations"

# Prompts de prueba
prompts = [
    "pixelart, dragon sprite breathing fire, red scales, wings spread, retro game style",
    "pixelart, wizard character with staff and hat, purple robes, casting spell animation",
    "pixelart, haunted mansion on a hill, full moon, spooky atmosphere, dark colors",
    "pixelart, pirate ship sailing on ocean waves, skull flag, sunset sky",
    "pixelart, magical forest with glowing mushrooms, fairy lights, mystical",
]

print("🎨 Cargando FLUX.1-dev con cuantización...")

# Configurar cuantización 8-bit
quantization_config = BitsAndBytesConfig(load_in_8bit=True)

# Cargar T5 cuantizado
text_encoder_2 = T5EncoderModel.from_pretrained(
    "black-forest-labs/FLUX.1-dev",
    subfolder="text_encoder_2",
    quantization_config=quantization_config,
    torch_dtype=torch.bfloat16
)

pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-dev",
    text_encoder_2=text_encoder_2,
    torch_dtype=torch.bfloat16
)
pipe.to("cuda")

print(f"📦 Cargando LoRA desde: {LORA_PATH}")
pipe.load_lora_weights(LORA_PATH)

print("\n🖼️ Generando imágenes...\n")

import os
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

for i, prompt in enumerate(prompts):
    print(f"[{i+1}/{len(prompts)}] Generando: {prompt[:60]}...")
    
    seed = random.randint(0, 1000000)
    generator = torch.Generator("cuda").manual_seed(seed)
    
    image = pipe(
        prompt=prompt,
        num_inference_steps=20,
        guidance_scale=4.0,
        width=512,
        height=512,
        generator=generator
    ).images[0]
    
    filename = f"{OUTPUT_FOLDER}/test_{i+1}_seed{seed}.png"
    image.save(filename)
    print(f"   ✓ Guardada: {filename}\n")

print("✅ ¡Generación completada!")
print(f"📁 Imágenes guardadas en: {OUTPUT_FOLDER}/")
