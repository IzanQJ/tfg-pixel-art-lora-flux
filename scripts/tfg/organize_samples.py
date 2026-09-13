"""
Organiza las imágenes generadas durante el entrenamiento
en carpetas por paso para fácil comparación
"""

import os
import shutil
from pathlib import Path

samples_dir = Path("outputs/iter_01/pixel_art_lora_v1/samples")
organized_dir = Path("outputs/iter_01/organized_samples")

# Limpiar directorio organizado si existe
if organized_dir.exists():
    shutil.rmtree(organized_dir)

organized_dir.mkdir(parents=True, exist_ok=True)

# Mapeo de pasos
step_mapping = {
    "000000000": "0_baseline_sin_entrenar",
    "000000100": "1_paso_100",
    "000000200": "2_paso_200",
    "000000300": "3_paso_300",
    "000000400": "4_paso_400",
    "000000500": "5_paso_500_FINAL"
}

# Prompts usados (de tu config)
prompts = [
    "knight_sword_shield",
    "treasure_chest_dungeon",
    "forest_scene_path",
    "spaceship_asteroid_field",
    "slime_monster_green",
    "castle_hill_sunset",
    "robot_futuristic",
    "potion_bottles_shelf"
]

print("=" * 70)
print("📁 ORGANIZANDO IMÁGENES GENERADAS DURANTE EL ENTRENAMIENTO")
print("=" * 70)
print(f"\nOrigen: {samples_dir}")
print(f"Destino: {organized_dir}\n")

total = 0

for step_code, step_name in step_mapping.items():
    step_folder = organized_dir / step_name
    step_folder.mkdir(exist_ok=True)
    
    # Buscar imágenes de este paso
    images = sorted(samples_dir.glob(f"*__{step_code}_*.jpg"))
    
    if images:
        print(f"📂 {step_name:<30} {len(images)} imágenes")
        
        for i, img in enumerate(images):
            # Nuevo nombre descriptivo
            prompt_name = prompts[i] if i < len(prompts) else f"prompt_{i}"
            new_name = f"{i+1}_{prompt_name}.jpg"
            
            # Copiar con nuevo nombre
            shutil.copy2(img, step_folder / new_name)
            total += 1

print(f"\n✅ {total} imágenes organizadas en: {organized_dir}/")
print("\n📋 Estructura creada:")
print("   organized_samples/")
print("   ├── 0_baseline_sin_entrenar/    (8 imágenes - ANTES del entrenamiento)")
print("   ├── 1_paso_100/                 (8 imágenes)")
print("   ├── 2_paso_200/                 (8 imágenes)")
print("   ├── 3_paso_300/                 (8 imágenes)")
print("   ├── 4_paso_400/                 (8 imágenes)")
print("   └── 5_paso_500_FINAL/           (8 imágenes - RESULTADO FINAL)")
print("\n💡 Compara las carpetas para ver la evolución del aprendizaje!")
print("=" * 70)
