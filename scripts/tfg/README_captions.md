# README — Pipeline de Captions con Qwen2.5-VL

## Descripción

La sección **Captions** del UI permite generar descripciones (captions) automáticas para las imágenes del dataset usando el modelo `Qwen/Qwen2.5-VL-7B-Instruct` con cuantización 4-bit (bitsandbytes), y revisar/editar las captions antes de enviarlas a un dataset de entrenamiento.

---

## Flujo completo

```
manual_accepted/     →   Crear grupo   →   caption_groups/<id>/
                              ↓
                      [Generar captions]
                         (Qwen VL local)
                              ↓
                      [Revisar en UI]
                              ↓
                      [Mover al dataset]
                              ↓
                    datasets/iter_XX/images/
                    + captions.csv + .txt por imagen
```

---

## Estructura de archivos

```
caption_groups/
  <timestamp>-<nombre>/
    images/               ← Imágenes copiadas de manual_accepted
    captions.csv          ← Captions revisadas (editadas en el UI)
    captions.auto.csv     ← Captions generadas automáticamente (fuente)
    manifest.json         ← Metadatos del grupo y estado
    progress.json         ← Progreso de la generación (polling)
```

### `manifest.json`
```json
{
  "id": "1717000000000-pixel-art-batch-01",
  "name": "pixel art batch 01",
  "status": "review",
  "created_at": "2025-05-29T12:00:00.000Z",
  "image_count": 45,
  "moved_to": "iter_03",
  "moved_at": "2025-05-29T14:00:00.000Z"
}
```

**Estados del grupo:**
| Estado         | Descripción                                      |
|----------------|--------------------------------------------------|
| `draft`        | Grupo creado, sin captions generadas             |
| `generating`   | Script Python en ejecución                       |
| `review`       | Captions disponibles para revisar/editar         |
| `ready_to_move`| Captions marcadas como listas (reservado)        |
| `moved`        | Imágenes copiadas al dataset de entrenamiento    |

---

## Uso desde el UI

### 1. Crear un grupo
- Ve a **Captions** en el sidebar
- Pulsa **Crear grupo**
- Escribe un nombre y selecciona imágenes de `manual_accepted`
- Pulsa **Crear grupo (N)**

Las imágenes se copian físicamente a `caption_groups/<id>/images/`.

### 2. Generar captions automáticos
- Abre el grupo
- Pulsa **Generar captions** (icono rayo ⚡)
- Configura:
  - **Trigger word** (por defecto: `pixelart`)
  - **Nivel de detalle**: Corto / Medio / Detallado
  - **Modelo**: `Qwen/Qwen2.5-VL-7B-Instruct` (solo lectura)
  - **Modo**: Solo vacíos / Sobrescribir todos
- Pulsa **Generar captions**

El UI muestra una barra de progreso en tiempo real (polling cada 2 segundos).

### 3. Revisar y editar
- Cada imagen muestra su caption en un textarea editable
- **Enter** (sin Shift) guarda el caption
- **Blur** también guarda
- **Guardar todo** guarda todas las ediciones pendientes

### 4. Mover al dataset
- Pulsa **Mover al dataset** (icono →)
- Selecciona el dataset destino (`iter_01`, `iter_02`, etc.)
- Confirma el trigger word
- Las imágenes se copian a `datasets/<iter>/images/`
- Se actualiza `datasets/<iter>/images/captions.csv`
- Se generan archivos `.txt` por imagen (formato esperado por FLUX LoRA training)

---

## Script Python

### Instalación de dependencias

```bash
# Activar el venv del proyecto
venv\Scripts\Activate.ps1

# Instalar dependencias de captioning
pip install transformers accelerate bitsandbytes qwen-vl-utils pillow
```

> **Nota:** `torch` y `torchvision` ya deben estar instalados en el venv del ai-toolkit.

### Ejecución manual

```bash
python scripts/tfg/generate_captions.py \
  --images caption_groups/1717000000000-mi-grupo/images \
  --output caption_groups/1717000000000-mi-grupo/captions.auto.csv \
  --progress-file caption_groups/1717000000000-mi-grupo/progress.json \
  --trigger-word pixelart \
  --detail-level medium \
  --model-name Qwen/Qwen2.5-VL-7B-Instruct \
  --overwrite-mode empty_only
```

### Argumentos

| Argumento           | Valores posibles                         | Por defecto                        |
|---------------------|------------------------------------------|------------------------------------|
| `--images`          | ruta a directorio de imágenes            | (requerido)                        |
| `--output`          | ruta al CSV de salida                    | (requerido)                        |
| `--progress-file`   | ruta al JSON de progreso                 | (requerido)                        |
| `--trigger-word`    | cualquier texto                          | `pixelart`                         |
| `--detail-level`    | `short`, `medium`, `detailed`            | `medium`                           |
| `--model-name`      | nombre del modelo HuggingFace            | `Qwen/Qwen2.5-VL-7B-Instruct`      |
| `--overwrite-mode`  | `empty_only`, `overwrite_all`            | `empty_only`                       |

---

## Prompts por nivel de detalle

| Nivel      | Resultado esperado                                   | Tokens aprox. |
|------------|------------------------------------------------------|---------------|
| `short`    | Frase corta, sujeto principal                        | 10-15 palabras |
| `medium`   | 1-2 frases, sujeto + escena + colores                | 20-40 palabras |
| `detailed` | Descripción completa con paleta, mood, detalles      | 50-80 palabras |

---

## Configuración del modelo

Por defecto se usa `Qwen/Qwen2.5-VL-7B-Instruct` con cuantización 4-bit NF4.

Para usar un modelo diferente, establece la variable de entorno antes de arrancar el UI:

```bash
$env:QWEN_CAPTION_MODEL = "Qwen/Qwen2.5-VL-3B-Instruct"
npm run dev
```

### Requisitos de VRAM
| Modelo                          | VRAM estimada (4-bit) |
|---------------------------------|-----------------------|
| `Qwen2.5-VL-3B-Instruct`        | ~6 GB                 |
| `Qwen2.5-VL-7B-Instruct`        | ~10 GB                |
| `Qwen2.5-VL-72B-Instruct`       | ~40 GB                |

---

## Integración con el pipeline de entrenamiento

Cuando se mueve un grupo a un dataset (`iter_XX`):
1. Las imágenes se copian a `datasets/iter_XX/images/`
2. Se actualiza `datasets/iter_XX/images/captions.csv`
3. Se generan archivos `<nombre_imagen>.txt` con el trigger word normalizado

Esto es compatible con `sync_captions.py` y con el formato esperado por el FLUX LoRA trainer.

---

## Notas técnicas

- El progreso se escribe en `progress.json` cada imagen procesada
- Las captions se guardan incrementalmente cada 5 imágenes (protección ante fallo)
- Si el script muere, al reiniciarlo con `--overwrite-mode empty_only` se reanudan solo las imágenes sin caption
- El grupo guarda su historial aunque sea movido a un dataset (no se borra)
- Colisiones de nombres al mover: se añade sufijo `_1`, `_2`, etc.
