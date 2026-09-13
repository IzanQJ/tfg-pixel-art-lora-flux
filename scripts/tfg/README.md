# Scripts TFG (Unificados)

Esta carpeta contiene los scripts que usas en tu flujo real del TFG.

## Scripts actuales

### Dataset y captions

- `sync_captions.py`
  - Sincroniza `captions.csv` -> archivos `.txt` por imagen.
  - Añade automáticamente el trigger `pixelart,` si falta.

- `cleanup_orphan_txt.py`
  - Elimina `.txt` huérfanos (sin `.png` con el mismo nombre base).

- `scale_pixelart.py`
  - Reescala imágenes pixel-art con nearest-neighbor.

### Generación y análisis

- `generate_single.py`
  - Genera una imagen de forma interactiva con prompt manual.

- `generate_simple.py`
  - Genera usando el mismo sistema interno de `ai-toolkit` (job config en dict).

- `generate_test.py`
  - Genera un conjunto fijo de imágenes de prueba.

- `organize_samples.py`
  - Organiza los samples por paso de entrenamiento para comparar evolución.

- `evaluate_style.py`
  - Calcula las métricas técnicas usadas por la evaluación de imágenes de la Iteración 3.
  - Analiza cuadrícula y tamaño base del píxel, dureza de bordes, zonas planas, coherencia del primer plano, ruido local y compactación de paleta.
  - La UI transforma estas métricas en dos notas independientes: **construcción pixel art** y **lectura visual experimental**. La paleta se muestra como dato adicional.
  - No reconoce semánticamente el objeto, no comprueba el prompt y no puntúa belleza o composición.

## Comandos recomendados

Desde la raíz del repositorio (`ai-toolkit`):

```powershell
.\venv\Scripts\Activate.ps1
python scripts/tfg/sync_captions.py --images datasets/iter_01/images
python scripts/tfg/cleanup_orphan_txt.py --images datasets/iter_01/images
python run.py config/iter_01_train.yaml
```

Generar una imagen de prueba:

```powershell
.\venv\Scripts\Activate.ps1
python scripts/tfg/generate_single.py
```

Evaluar una imagen o comparar carpetas:

```powershell
python scripts/tfg/evaluate_style.py --images outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/samples --detail

python scripts/tfg/evaluate_style.py `
  --images outputs/iter_01/pixel_art_lora_v1/samples outputs/iter_02/pixel_art_lora_v2/samples `
  --labels entrenamiento_1 entrenamiento_2 `
  --output results/style_comparison.json
```

En el uso normal no es necesario ejecutar este comando: al pulsar **Evaluar imagen** en la galería, la API de la UI lanza el script y conserva el resultado en `outputs/.image-evaluations.json`.
