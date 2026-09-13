"""
Script para escalar imágenes pixel-art a 512x512 sin interpolación
Uso: python scripts/scale_pixelart.py <carpeta_entrada> <carpeta_salida>

Ejemplo:
    python scripts/scale_pixelart.py imagenes_originales datasets/pixel_art
"""

import os
import sys
from pathlib import Path
from PIL import Image


def scale_pixelart(input_folder: str, output_folder: str, target_size: int = 512):
    """
    Escala imágenes pixel-art usando nearest neighbor (sin blur).
    
    Args:
        input_folder: Carpeta con imágenes originales (16x16, 32x32, etc.)
        output_folder: Carpeta donde guardar imágenes escaladas a 512x512
        target_size: Tamaño objetivo (default: 512)
    """
    input_path = Path(input_folder)
    output_path = Path(output_folder)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Extensiones de imagen soportadas
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}
    
    processed = 0
    skipped = 0
    
    print(f"🎨 Escalando imágenes pixel-art de {input_folder} → {output_folder}")
    print(f"   Tamaño objetivo: {target_size}x{target_size}")
    print(f"   Método: Nearest Neighbor (sin interpolación)\n")
    
    for img_file in input_path.iterdir():
        if img_file.suffix.lower() not in image_extensions:
            continue
        
        try:
            # Cargar imagen
            img = Image.open(img_file).convert('RGB')
            original_size = img.size

            # Escalar manteniendo proporción (NEAREST) para que los píxeles
            # del artwork sigan siendo cuadrados, luego rellenar con blanco
            # hasta 512x512 (equivalent a sharp fit:'contain')
            img.thumbnail((target_size, target_size), Image.NEAREST)
            canvas = Image.new('RGB', (target_size, target_size), (255, 255, 255))
            offset_x = (target_size - img.width) // 2
            offset_y = (target_size - img.height) // 2
            canvas.paste(img, (offset_x, offset_y))

            # Guardar con nombre original
            output_file = output_path / f"{img_file.stem}.png"
            canvas.save(output_file, format='PNG')
            
            print(f"✓ {img_file.name} ({original_size[0]}x{original_size[1]}) → {output_file.name} ({target_size}x{target_size})")
            processed += 1
            
        except Exception as e:
            print(f"✗ Error procesando {img_file.name}: {e}")
            skipped += 1
    
    print(f"\n{'='*60}")
    print(f"Resumen:")
    print(f"  ✓ Procesadas: {processed}")
    print(f"  ✗ Omitidas:   {skipped}")
    print(f"{'='*60}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python scripts/scale_pixelart.py <carpeta_entrada> <carpeta_salida>")
        print("\nEjemplo:")
        print("  python scripts/scale_pixelart.py imagenes_16x16 datasets/pixel_art")
        sys.exit(1)
    
    input_folder = sys.argv[1]
    output_folder = sys.argv[2]
    
    if not os.path.exists(input_folder):
        print(f"❌ Error: La carpeta '{input_folder}' no existe")
        sys.exit(1)
    
    scale_pixelart(input_folder, output_folder)