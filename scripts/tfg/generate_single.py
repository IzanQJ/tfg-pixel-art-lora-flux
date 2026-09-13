"""
Script interactivo para generar UNA imagen con tu prompt personalizado
Uso: python generate_single.py
"""

from diffusers import FluxPipeline
import torch
import random
import gc
import os

# Configuración
LORA_PATH = "outputs/iter_02/pixel_art_lora_v2/pixel_art_lora_v2.safetensors"
BASE_MODEL = "black-forest-labs/FLUX.1-dev"

print("=" * 60)
print("🎨 GENERADOR DE PIXEL-ART CON TU LORA ENTRENADO")
print("=" * 60)

# Pedir prompt al usuario
print("\n💡 Tips para buenos prompts:")
print("  - SIEMPRE empieza con 'pixelart,' (trigger word)")
print("  - Describe el objeto principal: 'dragon sprite', 'castle', etc.")
print("  - Añade detalles: 'fire breathing', 'stone walls', etc.")
print("  - Estilo: 'retro game style', 'simple colors'\n")

prompt = input("📝 Escribe tu prompt: ")

# Validar que incluya trigger word
if not prompt.lower().startswith("pixelart"):
    print("\n⚠️  No incluiste 'pixelart,' al inicio. Lo añado automáticamente.")
    prompt = f"pixelart, {prompt}"

print(f"\n✅ Prompt final: {prompt}\n")

# Configuración de generación
seed = random.randint(0, 1000000)
steps = 20
guidance = 4.0
width = 512
height = 512

print(f"🎲 Seed aleatorio: {seed}")
print(f"⚙️  Parámetros: {steps} steps, guidance {guidance}, {width}x{height}\n")

print("🔄 Cargando FLUX.1-dev EN CPU (para evitar OOM al cargar el LoRA)...")

# Limpieza previa
torch.cuda.empty_cache()
gc.collect()

# 1) Cargar pipeline en CPU (sin bitsandbytes 8bit)
pipe = FluxPipeline.from_pretrained(
    BASE_MODEL,
    torch_dtype=torch.bfloat16,
)

# Asegura CPU explícitamente
pipe.to("cpu")

# 2) Cargar LoRA en CPU (aquí es donde antes te petaba en GPU)
print("📦 Cargando tu LoRA entrenado (en CPU)...")
pipe.load_lora_weights(LORA_PATH)

# 3) Activar offload SECUENCIAL (menos VRAM, más lento, pero estable en 16GB)
#    IMPORTANTE: esto debe ir DESPUÉS de cargar LoRA si lo cargas en CPU
print("🚚 Activando sequential CPU offload (para usar la GPU sin reventar VRAM)...")
pipe.enable_sequential_cpu_offload()

# Extras para bajar picos de VRAM (si están disponibles en tu versión)
try:
    pipe.enable_attention_slicing()
except Exception:
    pass

try:
    pipe.enable_vae_slicing()
except Exception:
    pass

print("🎨 Generando imagen (puede tardar más por el offload)...")

# Con offload, usa generator en CPU para evitar reservas CUDA extra
generator = torch.Generator("cpu").manual_seed(seed)

image = pipe(
    prompt=prompt,
    num_inference_steps=steps,
    guidance_scale=guidance,
    width=width,
    height=height,
    generator=generator
).images[0]

# Guardar imagen
os.makedirs("outputs/iter_02", exist_ok=True)
output_file = f"outputs/iter_02/my_pixelart_seed{seed}.png"
image.save(output_file)

print("\n" + "=" * 60)
print("✅ ¡IMAGEN GENERADA!")
print(f"📁 Guardada en: {output_file}")
print(f"🎲 Seed usado: {seed}")
print("=" * 60)
print("\n💡 Para generar otra imagen, ejecuta de nuevo este script")
