# TFG Pipeline Real de Entrenamiento LoRA y Dataset Pixel-Art

## 1. Objetivo de este documento

Este documento describe el pipeline tecnico real del TFG: como esta organizado el proyecto, que scripts intervienen, como se preparan los datasets, como se ejecuta el scraper de Pixilart, como se generan captions automaticos, como se lanza el entrenamiento LoRA en la nube (Modal) desde la UI, que resultados se generan en cada iteracion y como se evaluan las imagenes generadas.

No es una memoria academica ni una descripcion general del repositorio base. Es la referencia operativa del flujo de trabajo real.

---

## 2. Resumen del pipeline actual

```
scraper Pixilart
      |
      v
datasets/pixilart/raw/        (imagenes y metadatos brutos)
      |
      v
datasets/pixilart/filtered/   (imagenes aceptadas + metadata JSONL)
      |
      v  (seleccion manual + escalar con scale_pixelart.py)
caption_groups/<id>/images/   (imagenes para captionar)
      |
      v  (UI: Crear grupo → Generar captions → Revisar → Mover al dataset)
      |   generate_captions.py (Qwen2.5-VL-7B-Instruct, 4-bit)
      |
      v
datasets/iter_XX/images/      (imagenes 512x512 + captions .txt)
      |
      v  (sync_captions.py + cleanup_orphan_txt.py)
captions.csv  <->  *.txt      (sincronizacion fuente de verdad)
      |
      v
UI: Jobs → Nuevo job → configurar hiperparametros → Start (GPU: A100-40GB)
      |   run_modal.py  →  Modal cloud GPU  →  FLUX.1-dev + LoRA training
      |   (pretrained_lora_path: LoRA de la iteracion anterior, si existe)
      v
output/<nombre_lora>/         (resultados locales descargados automaticamente)
      |- pixel_art_lora_vX.safetensors     (LoRA final, inferencia)
      |- pixel_art_lora_vX_000000NNN.safetensors  (checkpoints)
      |- optimizer.pt                       (solo resume)
      |- config.yaml
      |- log.txt                            (log completo del entrenamiento)
      |- .modal_config.json                 (config enviada a Modal, sin b64)
      |- samples/                           (muestras automaticas)
outputs/iter_XX/              (alias / copia local para inferencia)
      |
      v  (generate_api.py / interfaz web)
generacion de imagenes con LoRA entrenado
      |
      v  (Galeria → Evaluar imagen, Iteracion 3)
evaluate_style.py             (metricas tecnicas en bruto)
      |
      v
API de evaluacion             (construccion pixel art + lectura visual)
      |
      v
outputs/.image-evaluations.json  (cache local versionada)
```

---

## 3. Estructura actual del proyecto

Solo se muestran las carpetas y archivos que participan directamente en el TFG:

```text
ai-toolkit/
|- run.py                          # punto de entrada del entrenamiento local (CLI)
|- run_modal.py                    # lanzador de entrenamiento en Modal cloud GPU
|- requirements.txt
|- prompts_ejemplo.txt             # prompts de referencia para generacion
|- aitk_db.db                      # base de datos SQLite de la UI (jobs, estados)
|
|- caption_groups/                 # grupos de captioning (creados desde la UI)
|  |- <timestamp>-<nombre>/
|     |- images/                   # imagenes del grupo
|     |- captions.csv              # captions revisadas (fuente de verdad editada en UI)
|     |- captions.auto.csv         # captions generadas automaticamente por Qwen VL
|     |- manifest.json             # metadatos del grupo: id, nombre, estado, imagen_count
|     |- progress.json             # progreso de la generacion (polling desde UI)
|     |- titles.json               # titulos/autor/tags de cada imagen (del scraper)
|     |- generate.log              # log de la ultima generacion
|
|- config/
|  |- iter_01_train.yaml           # config de entrenamiento iter_01 (historico)
|  |- iter_02_train.yaml           # config de entrenamiento iter_02 (historico)
|  |- historical/
|     |- iter_03_Arreglo_train.yaml   # referencia historica, requiere adaptar rutas
|     `- train_lora_pixelart_tfg.yaml # config original, requiere adaptar rutas
|
|- datasets/                       # contenido local no distribuido
|  |- README.md                    # estructura esperada y preparacion
|  |- iter_01/
|  |  |- images/                   # imagenes PNG + .txt captions (512x512)
|  |  |- captions.csv
|  |  |- dataset_index.json
|  |  |- notes.md
|  |- iter_02/
|  |  |- images/                   # imagenes PNG + .txt captions
|  |  |- raw/                      # originales sin procesar
|  |  |- captions.csv
|  |  |- notes.md
|  |- iter_03/
|  |  |- images/                   # imagenes PNG + .txt captions
|  |  |- raw/
|  |  |- captions.csv
|  |- iter_03_captions_medios/     # 130 imagenes con captions formato medium (Qwen)
|  |  |- images/                   # imagenes PNG + .txt captions
|  |- pixilart/
|     |- raw/
|     |  |- images/                # imagenes descargadas por el scraper
|     |  |- metadata/
|     |  |  |- pixilart_raw.jsonl  # registro completo de items scrapeados
|     |  |- logs/                  # logs del spider (.log por ejecucion)
|     |     |- httpcache/          # cache HTTP de Scrapy
|     |- filtered/
|     |  |- accepted/              # imagenes que pasaron el filtro automatico
|     |  |- rejected/              # imagenes rechazadas (GIF u otros criterios)
|     |  |- metadata/
|     |     |- pixilart_filtered.jsonl
|     |     |- pixilart_rejected.jsonl
|     |- reports/
|        |- latest.json
|        |- report_YYYYMMDD_HHMMSS.json
|
|- scripts/
|  |- run_pixilart_scraper.py      # runner del scraper (desde raiz repo)
|  |- scrapers/
|  |  |- pixilart_scraper/
|  |     |- run_spider.py          # runner principal (ejecutar desde esta carpeta)
|  |     |- scrapy.cfg
|  |     |- requirements_scraper.txt
|  |     |- pixilart_scraper/
|  |        |- spiders/
|  |        |  |- pixilart_spider.py
|  |        |- items.py
|  |        |- pipelines.py        # 4 pipelines: download, filter, organize, manifest
|  |        |- settings.py
|  |        |- utils.py
|  |        |- middlewares.py
|  |- tfg/
|     |- generate_captions.py      # captions con Qwen2.5-VL-7B-Instruct (4-bit)
|     |- sync_captions.py          # sincroniza captions.csv → .txt por imagen
|     |- cleanup_orphan_txt.py     # elimina .txt sin .png correspondiente
|     |- scale_pixelart.py         # escala imagenes a 512x512 nearest-neighbor
|     |- generate_single.py        # genera una imagen con prompt interactivo
|     |- generate_simple.py        # generacion via toolkit interno
|     |- generate_test.py          # genera set fijo de 5 prompts de prueba
|     |- generate_api.py           # generacion con argumentos CLI
|     |- evaluate_style.py         # metricas para la evaluacion automatica de la iteracion 3
|     |- organize_samples.py       # organiza samples en subcarpetas por step
|     |- capture_api_requests.py   # intercepta trafico de Pixilart.com con Playwright
|     |- inspect_api_response.py   # consulta directa al endpoint API de Pixilart
|     |- README.md
|     |- README_captions.md
|
|- ui/                             # interfaz web Next.js 15 (App Router, TypeScript)
|  |- src/app/
|  |  |- jobs/                     # gestion de trabajos de entrenamiento
|  |  |  |- new/                   # formulario de nuevo job
|  |  |  |  |- jobConfig.ts        # config por defecto del formulario
|  |  |- captions/                 # pipeline de captioning (grupos + revision)
|  |  |- scraper/                  # control del spider Pixilart desde la UI
|  |  |- datasets/                 # exploracion del dataset
|  |  |- generate/                 # generacion de imagenes
|  |  |- trainings/                # historial de entrenamientos con samples
|  |  |  |- [iter]/                # vista de muestras por iteracion
|  |  |- dashboard/                # vista general
|  |- src/app/api/                 # rutas API REST (Next.js Route Handlers)
|  |  |- jobs/                     # CRUD + start/stop de jobs
|  |  |- captions/                 # gestion de grupos y progreso
|  |  |- caption/                  # generacion + guardado de caption individual
|  |  |- scraper/                  # lanzar spider desde UI
|  |  |- datasets/                 # listar/gestionar datasets
|  |  |- iterations/               # listar iteraciones disponibles
|  |  |- loras/                    # listar LoRAs disponibles para encadenamiento
|  |  |- generated-images/
|  |     |- evaluate/              # ejecuta evaluate_style.py y calcula las notas
|  |- src/components/
|  |  |- GalleryView.tsx           # visor de imagenes y boton Evaluar imagen
|  |  |- ImageEvaluationPanel.tsx  # panel de resultados de la evaluacion
|  |- src/server/
|  |  |- imageEvaluations.ts       # cache local de evaluaciones
|  |- src/types/
|     |- imageEvaluation.ts        # contrato del scoring version 3
|
|- output/                         # resultados locales descargados desde Modal
|  |- pixel_art_lora_v3_Arreglo/   # iter_03_Arreglo (exitoso)
|  |  |- pixel_art_lora_v3_Arreglo.safetensors
|  |  |- pixel_art_lora_v3_Arreglo_000000NNN.safetensors  (checkpoints x4)
|  |  |- optimizer.pt
|  |  |- config.yaml
|  |  |- log.txt                   # log del entrenamiento en Modal
|  |  |- .modal_config.json        # config enviada a Modal (sin b64 del LoRA)
|  |  |- samples/
|  |- pixel_art_lora_v4/           # iter_04 (en curso)
|
|- outputs/                        # resultados organizados por iteracion (inferencia)
   |- iter_01/
   |  |- pixel_art_lora_v1/
   |     |- pixel_art_lora_v1.safetensors
   |     |- pixel_art_lora_v1_000000NNN.safetensors  (x4)
   |     |- optimizer.pt / config.yaml / samples/
   |     |- my_pixelart_seed*.png   # generaciones manuales de prueba
   |- iter_02/
   |  |- pixel_art_lora_v2/
   |  |  |- pixel_art_lora_v2.safetensors
   |  |  |- pixel_art_lora_v2_000000NNN.safetensors  (x4)
   |  |  |- optimizer.pt / config.yaml / samples/
   |  |- my_pixelart_seed*.png
   |  |- generated/
   |- iter_03/
   |  |- pixel_art_lora_v3/
   |     |- pixel_art_lora_v3.safetensors  (entrenado con bypass_guidance_embedding:true — invalido)
   |- iter_03_Arreglo/             # iter_03 corregido — entrenamiento exitoso
   |  |- pixel_art_lora_v3_Arreglo/
   |     |- pixel_art_lora_v3_Arreglo.safetensors   # LoRA valido, 500 steps
   |     |- pixel_art_lora_v3_Arreglo_000000NNN.safetensors  (x4)
   |     |- optimizer.pt / config.yaml / samples/
   |- iter_04/                     # en entrenamiento (600 steps, desde iter_03_Arreglo)
   |- .image-evaluations.json      # cache local de evaluaciones, ignorada por Git
```

---

## 4. Iteraciones del TFG

### 4.1 Iteracion 1 - Entrenamiento 1

- **Dataset**: `datasets/iter_01/images/` — aprox. 20 imagenes PNG curadas manualmente en 512x512
- **Config**: `config/iter_01_train.yaml`
- **Output**: `outputs/iter_01/pixel_art_lora_v1/`
- **Plataforma**: local (GPU del equipo)
- **Modelo base**: `black-forest-labs/FLUX.1-dev`
- **LoRA inicial**: entrenamiento desde cero (sin LoRA previo)
- **Objetivo**: baseline inicial para verificar que el pipeline funciona y que el modelo aprende el estilo pixel-art con el trigger word `pixelart`
- **Hiperparametros principales**:
  - Steps: 500 | Rank: 16 / alpha: 16 | LR: 1e-4 | Optimizer: adamw8bit
  - Batch size: 1 | Resolucion: 512 | Noise scheduler: flowmatch | Dtype: bf16
  - Save every: 100 steps / max checkpoints: 4
- **Samples automaticos**: cada 100 steps, 8 prompts fijos, resolucion 512x512, seed 42
- **Resultados**: LoRA final + 4 checkpoints intermedios + samples + 2 imagenes de prueba manual

### 4.2 Iteracion 2 - Entrenamiento 2

- **Dataset**: `datasets/iter_02/images/` — aprox. 14 imagenes PNG
- **Config**: `config/iter_02_train.yaml`
- **Output**: `outputs/iter_02/pixel_art_lora_v2/`
- **Plataforma**: local (GPU del equipo)
- **Modelo base**: `black-forest-labs/FLUX.1-dev`
- **LoRA inicial**: refinamiento desde `outputs/iter_01/pixel_art_lora_v1/pixel_art_lora_v1.safetensors` (`pretrained_lora_path`)
- **Objetivo**: refinar el LoRA de iter_01 con dataset adicional
- **Hiperparametros**: identicos a iter_01 (500 steps, rank 16, lr 1e-4, adamw8bit, bf16, flowmatch, cuantizacion)
- **Resultados**: LoRA final + 4 checkpoints + samples + ~12 imagenes de prueba manual + carpeta `generated/`

### 4.3 Iteracion 3 - Entrenamiento 3 (resultado no satisfactorio)

- **Dataset**: `datasets/iter_03/images/`
- **Config**: no conservada (generada desde UI)
- **Output**: `outputs/iter_03/pixel_art_lora_v3/`
- **Plataforma**: Modal cloud GPU (A100-40GB)
- **LoRA inicial**: desde iter_02
- **Hiperparametros**: 1500 steps; `bypass_guidance_embedding: true` (ver seccion 4.7)
- **Estado**: ejecucion completada, pero con un resultado visual no satisfactorio
- **Resultado**: el archivo LoRA se genero correctamente, aunque se alejo del estilo pixel-art buscado

### 4.4 Iteracion 3 - Entrenamiento 4 (arreglo exitoso)

- **Dataset**: `datasets/iter_03/images/`
- **Config**: `config/historical/iter_03_Arreglo_train.yaml`
- **Output local**: `output/pixel_art_lora_v3_Arreglo/` (descargado desde Modal)
- **Output de inferencia**: `outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/`
- **Plataforma**: Modal cloud GPU (A100-40GB)
- **Modelo base**: `black-forest-labs/FLUX.1-dev`
- **LoRA inicial**: desde cero (sin pretrained, para evitar contaminacion de iter_03 fallida)
- **Hiperparametros clave**:
  - Steps: 500 | Rank: 16 / alpha: 16 | LR: 1e-4 | Optimizer: adamw8bit
  - `bypass_guidance_embedding: false` | `quantize_te: false` | `content_or_style: balanced`
  - Noise scheduler: flowmatch | Dtype: bf16 | Modelo cuantizado: qfloat8
- **Estado**: **EXITOSA** — LoRA valido, pixel-art reconocible
- **LoRA final**: `outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/pixel_art_lora_v3_Arreglo.safetensors`

### 4.5 Iteracion 3 - Entrenamiento 5 (ID tecnico iter_04)

- **Dataset**: `datasets/iter_03_captions_medios/images/` — 130 imagenes con captions medium (Qwen)
- **Config en BD**: `aitk_db.db → Job: pixel_art_lora_v4`
- **Output local**: `output/pixel_art_lora_v4/`
- **Output de inferencia**: `outputs/iter_04/`
- **Plataforma**: Modal cloud GPU (A100-40GB)
- **Modelo base**: `black-forest-labs/FLUX.1-dev`
- **LoRA inicial**: refinamiento desde `outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/pixel_art_lora_v3_Arreglo.safetensors`
- **Hiperparametros clave**:
  - Steps: 600 | Rank: 16 / alpha: 16 | LR: 1e-4 | Optimizer: adamw8bit
  - `bypass_guidance_embedding: false` | `quantize_te: false` | `content_or_style: balanced`
  - Conv LoRA: rank 16 / alpha 16 (cubre tambien capas Conv2d 3x3)
- **Objetivo**: refinar iter_03_Arreglo con el dataset ampliado de 130 imagenes (iter_03_captions_medios)
- **Nota de nomenclatura**: la carpeta conserva el ID historico `iter_04`, pero funcionalmente se presenta como el quinto entrenamiento de la Iteracion 3.

### 4.6 Evaluacion automatica de imagenes generadas (Iteracion 3)

La Iteracion 3 incorpora una evaluacion automatica accesible desde la galeria de imagenes generadas. Al abrir una imagen aparece el boton **Evaluar imagen**, que lanza el analisis sin necesidad de ejecutar comandos en una terminal.

El sistema no produce una unica nota global. Separa dos dimensiones para evitar que una paleta reducida o unos bordes duros oculten problemas de forma y legibilidad:

| Seccion | Criterio | Metricas base | Que busca |
|---|---|---|---|
| Construccion pixel art | Tamano y cuadricula | `pixel_grid`, `pixel_size` | Un bloque base repetido y cambios de color alineados con la misma cuadricula |
| Construccion pixel art | Curvas escalonadas | `pixel_grid`, `edge_hardness`, `flatness` | Diagonales y curvas construidas mediante escalones regulares |
| Construccion pixel art | Bordes sin suavizado | `edge_hardness` | Transiciones bruscas con poco antialias |
| Lectura visual experimental | Coherencia de la figura | `subject_coherence` | Que la mayor parte del primer plano forme una figura conectada |
| Lectura visual experimental | Ruido que dificulta la lectura | `local_variation` | Que el detalle local no fragmente ni oculte la forma principal |
| Dato adicional | Paleta compacta | `palette_score_16`, `unique_colors` | Cuanta informacion se conserva al reducir la imagen a 16 colores |

La nota de **construccion pixel art** combina cuadrícula, curvas escalonadas y bordes. La nota de **lectura visual experimental** combina coherencia de la figura y ausencia de ruido local. La paleta se muestra de forma independiente y no altera ninguna de las dos.

**Formulas del scoring version 3**:

Todas las medidas se normalizan primero a una escala de 0 a 10 y se limitan a ese intervalo.

```text
grid         = normalizar(pixel_grid, 0.02, 0.40)
hard_edges   = normalizar(edge_hardness, 0.05, 0.50)
stable_areas = normalizar(flatness, 0.55, 0.92)

stair_steps     = 0.55 * grid + 0.30 * hard_edges + 0.15 * stable_areas
pixel_structure = 0.45 * grid + 0.35 * stair_steps + 0.20 * hard_edges

silhouette      = normalizar(subject_coherence, 0.25, 0.95)
low_clutter     = normalizar_inverso(local_variation, 0.12, 0.42)
visual_reading  = 0.70 * silhouette + 0.30 * low_clutter
```

La paleta parte de `palette_score_16`, normalizado entre 17 y 32 dB, y recibe un ajuste pequeno segun `unique_colors`. Los estados visuales son: **bueno** desde 7.5, **aviso** desde 5 y **bajo** por debajo de 5.

`hue_entropy` se conserva en el JSON y en la comparacion por CLI, pero no interviene en las notas actuales de la UI. `flatness` interviene solo como apoyo para detectar curvas escalonadas y zonas estables.

**Limitaciones conocidas**:

- No identifica semanticamente el objeto representado.
- No compara la imagen con el prompt utilizado para generarla.
- No puntua belleza, composicion, anatomia ni preferencia estetica.
- La lectura visual funciona mejor cuando existe un sujeto principal separado de un fondo relativamente uniforme.
- Una escena intencionadamente compleja o con varios sujetos puede obtener una nota de lectura menor aunque sea valida artisticamente.

**Cadena de ejecucion**:

```text
GalleryView.tsx
  -> POST /api/generated-images/evaluate
  -> scripts/tfg/evaluate_style.py --output <temporal>.json
  -> buildPipelineEvaluation()
  -> outputs/.image-evaluations.json
  -> ImageEvaluationPanel.tsx
```

La API acepta solo imagenes generadas dentro de `outputs/`. La cache usa el esquema `version: 3` y cada resultado incluye `scoringVersion: 3`; las versiones anteriores se invalidan para no mezclar formulas distintas.

### 4.7 Bug critico: bypass_guidance_embedding

**Causa raiz de iter_03 fallida y de iter_03_2 fallida.**

FLUX.1-dev es un modelo guidance-distilled. Durante la inferencia procesa el valor `guidance_scale` (~3.5) a traves del modulo `time_text_embed`. Cuando `bypass_guidance_embedding: true` esta activo, el toolkit parchea `time_text_embed.forward` con `bypass_flux_guidance()`, que sustituye el valor de guidance por 0 durante el entrenamiento.

El resultado es que el LoRA queda optimizado para operar SIN guidance (equivalente a FLUX.1-schnell), pero la inferencia siempre aplica guidance con normalidad. Esta desalineacion total entre entrenamiento e inferencia hace que el estilo pixel-art no se aprenda correctamente.

**La correccion**: `bypass_guidance_embedding: false` (o simplemente omitir el campo, ya que el valor por defecto es `false`). Este campo se corrgio permanentemente en el formulario de la UI (`ui/src/app/jobs/new/jobConfig.ts`).

**Problema secundario en iter_03/iter_03_2**: `quantize_te: true` con `qtype_te: qfloat8` degradaba las embeddings del text encoder, contribuyendo a resultados pobres. Corregido a `quantize_te: false`.

### 4.8 Encadenamiento de LoRAs (pretrained_lora_path)

Cada iteracion puede arrancar desde el LoRA de la iteracion anterior usando el campo `pretrained_lora_path` en la seccion `network` de la config. El toolkit usa ese LoRA como punto de partida solo si no existe ya un checkpoint del entrenamiento actual en el destino.

**Mecanismo en Modal**: el archivo LoRA (hasta ~164 MB) se codifica en base64 por `run_modal.py` y se incluye en el payload JSON enviado a la funcion remota. El contenedor de Modal lo escribe al filesystem antes de iniciar el entrenamiento. El campo `_pretrained_lora_b64` se elimina del config antes de escribirlo en disco para no contaminar el `.modal_config.json`.

**Precaucion de resume**: si el Modal Volume ya contiene un checkpoint de un entrenamiento anterior con el mismo nombre, el toolkit reanuda desde ese checkpoint e ignora `pretrained_lora_path`. Para empezar desde el LoRA pretrained es necesario borrar previamente la entrada del volume:

```powershell
.\venv\Scripts\python.exe -m modal volume rm -r flux-lora-models /pixel_art_lora_vX
```

---

## 5. Pipeline de dataset

### 5.1 Estructura de un dataset de iteracion

Cada dataset curado para entrenamiento sigue esta estructura:

```text
datasets/iter_XX/
|- images/
|  |- imagen_01.png    # imagen escalada a 512x512
|  |- imagen_01.txt    # caption generado desde captions.csv
|  |- imagen_02.png
|  |- imagen_02.txt
|  |- ...
|  |- _latent_cache/   # cache de latentes (generado automaticamente al entrenar)
|- raw/                # (iter_02 y posteriores) originales sin escalar
|- captions.csv        # fuente de verdad: columnas file,caption
|- notes.md            # notas manuales de la iteracion
|- dataset_index.json  # (iter_01) indice del dataset
```

### 5.2 Flujo de preparacion del dataset

1. Colocar imagenes en `datasets/iter_XX/raw/` (o directamente en `images/` si ya estan en 512x512)
2. Escalar con nearest-neighbor a 512x512:

```powershell
.\venv\Scripts\Activate.ps1
python scripts/tfg/scale_pixelart.py datasets/iter_XX/raw datasets/iter_XX/images
```

3. Editar captions en `datasets/iter_XX/captions.csv` (columnas: `file`, `caption`)
4. Sincronizar captions al formato `.txt` por imagen:

```powershell
python scripts/tfg/sync_captions.py --images datasets/iter_XX/images
```

   El script antepone automaticamente el trigger word `pixelart,` si falta en la caption.

5. Limpiar captions `.txt` huerfanos sin imagen correspondiente:

```powershell
python scripts/tfg/cleanup_orphan_txt.py --images datasets/iter_XX/images
```

### 5.3 Fuente de verdad de captions

El archivo `captions.csv` es la unica fuente que se edita manualmente. Los archivos `.txt` se regeneran a partir de el con `sync_captions.py`. No editar los `.txt` directamente.

---

## 6. Pipeline de scraping Pixilart

### 6.1 Finalidad

El scraper descarga imagenes de pixel-art de Pixilart.com para construir un dataset de mayor volumen destinado a iter_03 y siguientes. El flujo scraped→filtrado→curado reemplaza la recoleccion manual de imagenes.

### 6.2 Implementacion

- **Runner principal**: `scripts/scrapers/pixilart_scraper/run_spider.py` (ejecutar desde esa carpeta)
- **Runner legacy**: `scripts/run_pixilart_scraper.py` (ejecutar desde la raiz del repo, parametros distintos)
- **Spider**: `scripts/scrapers/pixilart_scraper/pixilart_scraper/spiders/pixilart_spider.py`
- **Framework**: Scrapy 2.x
- **API usada**: endpoint interno de Pixilart descubierto via interceptacion de trafico con Playwright:

```
GET https://www.pixilart.com/api/w/gallery/{page_id}/{last_id}/tags
    ?user=true&liked=true&comments=true&sub={TAG}&sub_sec=new
```

### 6.3 Ejecucion

```powershell
.\venv\Scripts\Activate.ps1
cd scripts\scrapers\pixilart_scraper

# Scrapear por topicos (recomendado)
python run_spider.py --topics dogs cats buildings --items-per-topic 50 --min-likes 10

# Scrapear sin usar la cache HTTP (para forzar descarga fresca)
python run_spider.py --topics fantasy --items-per-topic 100 --no-cache

# Volver a scrapear items ya descargados
python run_spider.py --topics pixelart --overwrite
```

Opciones disponibles:

| Opcion | Tipo | Defecto | Descripcion |
|---|---|---|---|
| `--topics` | lista | (obligatorio si no hay --tags) | Topicos de Pixilart a rastrear |
| `--tags` | lista | (legacy) | Tags de Pixilart (API anterior) |
| `--items-per-topic` | int | 20 | Maximo de items por topico |
| `--max-items` | int | 0 | Limite global total (0 = sin limite) |
| `--min-likes` | int | 0 | Descartar arte con menos de N likes |
| `--overwrite` | flag | false | Re-scrapear items ya presentes en el manifest |
| `--no-cache` | flag | false | Deshabilitar cache HTTP de Scrapy (descarga fresca) |

**Nota sobre la cache HTTP**: Scrapy usa una cache de disco con expiracion de 2 horas (`HTTPCACHE_EXPIRATION_SECS=7200`). Si se ejecuta el spider dos veces en menos de 2 horas sin `--no-cache`, las respuestas se sirven desde la cache y no se hacen peticiones reales. Usar `--no-cache` para forzar descarga fresca. La cache se guarda en `datasets/pixilart/raw/logs/httpcache/`.

**Nota sobre `--min-likes`**: La API de Pixilart devuelve los resultados de mas reciente a mas antiguo. Las obras recientes suelen tener pocos likes aunque sean de calidad. Se recomienda usar `--min-likes 10` a `--min-likes 30` para filtrar ruido sin ser demasiado restrictivo.

### 6.4 Datos recogidos por item

El spider recopila los siguientes campos en cada `PixilartItem`:

| Campo | Descripcion |
|---|---|
| `id` | ID secuencial del item |
| `art_url` | URL de la pagina de la obra en Pixilart |
| `image_url` | URL directa de la imagen en CDN |
| `title` | Titulo de la obra |
| `author` | Autor |
| `tags` | Lista de tags |
| `likes_count` | Numero de likes de la obra |
| `views` | Numero de vistas |
| `published_at` | Fecha de publicacion |
| `width_px`, `height_px` | Dimensiones en pixeles (via Pillow) |
| `canvas_size_label` | Etiqueta de dimension del canvas (ej: `32x32`) |
| `pixel_count` | Numero total de pixeles |
| `aspect_ratio` | Relacion de aspecto |
| `is_square` | Booleano |
| `file_size_bytes` | Tamano del archivo en bytes |
| `is_gif` | Booleano |
| `filter_status` | `accepted` / `rejected` / `review` |
| `reject_reason` | Motivo de rechazo si aplica |

### 6.5 Pipelines de procesamiento

Los pipelines se ejecutan en orden despues de cada item descargado:

| Orden | Pipeline | Funcion |
|---|---|---|
| 100 | `ImageDownloadPipeline` | Descarga la imagen, calcula metricas con Pillow (dimensiones, aspect ratio, file size) |
| 200 | `FilterPipeline` | Decide si el item es `accepted`, `rejected` o `review`. Rechaza GIFs automaticamente. |
| 300 | `OrganizePipeline` | Copia la imagen a `filtered/accepted/` o `filtered/rejected/` segun resultado del filtro |
| 400 | `ManifestPipeline` | Registra el item en los JSONL de metadata y genera el informe de ejecucion |

### 6.6 Estructura generada en datasets/pixilart/

```text
datasets/pixilart/
|- raw/
|  |- images/               # imagenes originales descargadas (pixilart_000001.png, ...)
|  |- metadata/
|  |  |- pixilart_raw.jsonl # registro completo de todos los items scrapeados
|  |- logs/                 # logs del spider (.log por ejecucion)
|     |- httpcache/         # cache HTTP de Scrapy
|- filtered/
|  |- accepted/             # imagenes que pasaron el filtro (aptas para dataset)
|  |- rejected/             # imagenes rechazadas (GIFs u otros criterios)
|  |- metadata/
|     |- pixilart_filtered.jsonl  # metadata de imagenes aceptadas
|     |- pixilart_rejected.jsonl  # metadata de imagenes rechazadas
|- reports/
   |- latest.json                       # informe de la ultima ejecucion
   |- report_YYYYMMDD_HHMMSS.json       # informes historicos por ejecucion
```

### 6.7 Dataset scrapeado vs dataset curado para entrenamiento

- `datasets/pixilart/filtered/accepted/` contiene las imagenes que pasaron el filtro automatico, pero **no estan listas para entrenamiento**. Pueden tener resoluciones variables y sin captions.
- Para usar en entrenamiento hay que: seleccionar manualmente, crear un grupo de captions en la UI, generar y revisar los captions, mover al dataset destino, y verificar con `sync_captions.py`.
- El dataset de iter_03 esta previsto para construirse a partir de este material.

---

## 7. Pipeline de captions automaticos

### 7.1 Descripcion

Para escalar la creacion de captions sin depender de la edicion manual imagen a imagen, el proyecto incluye un sistema de generacion automatica con el modelo `Qwen/Qwen2.5-VL-7B-Instruct` (multimodal, 7B parametros, cuantizacion 4-bit via bitsandbytes). El modelo analiza cada imagen y genera una descripcion en lenguaje natural adaptada a los tres niveles de detalle disponibles.

La UI integra este sistema en la seccion **Captions**, que centraliza todo el flujo: crear grupo → generar → revisar → mover al dataset.

### 7.2 Flujo completo

```
datasets/pixilart/filtered/accepted/   (imagenes scrapeadas y filtradas)
      |
      v  (UI: Captions → Crear grupo)
caption_groups/<id>/images/            (copia de las imagenes del grupo)
      |
      v  (UI: Generar captions → configure → Lanzar)
      |   scripts/tfg/generate_captions.py
      |   modelo: Qwen/Qwen2.5-VL-7B-Instruct (4-bit)
      v
caption_groups/<id>/captions.auto.csv  (captions generados automaticamente)
      |
      v  (UI: revisar + editar en textareas)
caption_groups/<id>/captions.csv       (fuente de verdad revisada)
      |
      v  (UI: Mover al dataset → seleccionar iter_XX)
datasets/iter_XX/images/
   |- imagen.png
   |- imagen.txt      (caption con trigger word antepuesto)
   |- captions.csv    (actualizado)
```

### 7.3 Script generate_captions.py

**Ubicacion**: `scripts/tfg/generate_captions.py`

**Uso manual**:

```powershell
.\venv\Scripts\Activate.ps1

python scripts/tfg/generate_captions.py `
  --images caption_groups/<id>/images `
  --output caption_groups/<id>/captions.auto.csv `
  --progress-file caption_groups/<id>/progress.json `
  --trigger-word pixelart `
  --detail-level medium `
  --model-name Qwen/Qwen2.5-VL-7B-Instruct `
  --overwrite-mode empty_only
```

**Argumentos**:

| Argumento | Valores | Descripcion |
|---|---|---|
| `--images` | ruta carpeta | Carpeta con las imagenes a captionar |
| `--output` | ruta CSV | Archivo CSV de salida |
| `--progress-file` | ruta JSON | Archivo de progreso para polling desde la UI |
| `--trigger-word` | string | Trigger word a anteponer (por defecto: `pixelart`) |
| `--detail-level` | `short` / `medium` / `detailed` | Nivel de detalle del caption |
| `--model-name` | string | Nombre del modelo en HuggingFace |
| `--overwrite-mode` | `empty_only` / `all` | Sobrescribir solo vacios o todos |

**Niveles de detalle**:

| Nivel | Longitud | Descripcion |
|---|---|---|
| `short` | 10-15 palabras | Frase unica: sujeto + resolucion del canvas |
| `medium` | 20-40 palabras | 1-2 frases: sujeto, escenario, colores, estilo, resolucion |
| `detailed` | 50-80 palabras | Descripcion completa con paleta, estado de animo, caracteristicas pixel-art |

**Uso del titulo y tags del scraper**: El script lee `titles.json` si existe en la carpeta del grupo. Los datos (titulo, tags, resolucion del canvas) se inyectan como **contexto de comprension** para el modelo con la instruccion explicita de no copiarlos literalmente en el caption. El canvas se pasa como dato explicito para que el modelo lo mencione en la descripcion. El autor no se usa.

**Vocabulario pixel-art en los prompts**: Los prompts guian al modelo a usar terminologia especifica del medio: `sprite`, `limited palette`, `retro`, `8-bit`, `16-bit`, `isometric`, `dithering`, `tile-based`, `pixel shading`, `chunky pixels`, `outlined sprites`, `scanline effect`, `indexed color`.

### 7.4 Estructura de un grupo de captions

```text
caption_groups/
  <timestamp>-<nombre>/
    images/               <- imagenes del grupo (PNG/JPG/WEBP)
    captions.csv          <- captions revisadas (editadas en UI, fuente final)
    captions.auto.csv     <- captions generados por Qwen (no editar directamente)
    manifest.json         <- {id, name, status, created_at, image_count}
    progress.json         <- {status, total, completed, current_file, updated_at}
    titles.json           <- {filename: {title, author, tags, canvas_size_label}}
    generate.log          <- log de la ultima generacion
```

**Estados del grupo** (`manifest.json → status`):

| Estado | Descripcion |
|---|---|
| `draft` | Grupo creado, sin captions generadas |
| `generating` | Script Python en ejecucion |
| `review` | Captions disponibles para revisar |
| `moved` | Imagenes copiadas al dataset de entrenamiento |

### 7.5 Dependencias adicionales para captions

```powershell
.\venv\Scripts\Activate.ps1
pip install transformers accelerate bitsandbytes qwen-vl-utils
```

> `torch` y `torchvision` ya estan instalados en el venv del ai-toolkit.

---

## 8. Pipeline de entrenamiento LoRA

### 8.1 Metodo principal: UI + Modal cloud GPU

El flujo de entrenamiento del TFG utiliza la UI web (Next.js) para configurar y lanzar jobs que se ejecutan en la nube mediante Modal (GPU A100-40GB). Este es el metodo recomendado y el unico que soporta la cadena completa de funcionalidades (encadenamiento de LoRAs, logs en tiempo real, historial de entrenamientos con samples).

**Plataforma Modal**:
- Perfil: `izanqj`
- App: `flux-lora-training`
- Volume: `flux-lora-models` (persistente entre ejecuciones)
- GPU por defecto en la UI: `A100-40GB`

**Inicio de la UI**:

```powershell
cd ui
npm run dev
# Abrir http://localhost:3000
```

**Flujo desde la UI**:

1. **Jobs → Nuevo job**: rellenar nombre, dataset, hiperparametros, GPU
2. Si es refinamiento: seleccionar LoRA previo en el campo "Pretrained LoRA" (selector de `outputs/`)
3. Pulsar **Start** → la UI llama a `run_modal.py` con el config JSON
4. Los logs aparecen en tiempo real en la UI
5. Al finalizar, los resultados se descargan automaticamente al `output/` local

### 8.2 Cadena de ejecucion (UI → Modal)

```
UI (Next.js)  →  /api/jobs/[id]/start  →  run_modal.py
   run_modal.py:
     1. Lee config JSON del job desde aitk_db.db
     2. Resuelve rutas de datasets (Windows → /root/ai-toolkit/...)
     3. Si pretrained_lora_path existe localmente:
        - Lee el .safetensors y lo codifica en base64
        - Inserta _pretrained_lora_b64 y _pretrained_lora_remote_path en el config
     4. Llama a train.with_options(gpu=...).remote(config_json) en Modal
   Modal (contenedor remoto):
     5. Extrae _pretrained_lora_b64 del config y escribe el archivo .safetensors
     6. Llama a get_job(config_path) → job.run()  (DiffusionTrainer)
     7. Al terminar, llama a model_volume.commit()
   run_modal.py (local, post-ejecucion):
     8. Descarga resultados con: modal volume get flux-lora-models <nombre> output/
```

### 8.3 Cadena interna del toolkit (DiffusionTrainer)

```
run.py / DiffusionTrainer  →  toolkit/config.py  →  toolkit/job.py
  →  jobs/ExtensionJob.py  →  extensions_built_in/sd_trainer/
  →  jobs/process/BaseSDTrainProcess.py
  →  toolkit/stable_diffusion_model.py
```

`DiffusionTrainer` es una subclase de `SDTrainer` que anade integracion con SQLite/UI. La logica de entrenamiento es identica a `SDTrainer`.

**Carga del pretrained LoRA** (`BaseSDTrainProcess.get_latest_save_path`):
- Si hay un checkpoint existente del mismo job en el volumen → reanuda desde ese checkpoint (RESUME). `pretrained_lora_path` se ignora.
- Si NO hay checkpoint → usa `pretrained_lora_path` como punto de partida.
- **Implicacion**: para iniciar desde un LoRA pretrained en un nuevo entrenamiento con el mismo nombre, hay que borrar primero el checkpoint del volume (ver seccion 4.8).

### 8.4 Sampling automatico

Durante el entrenamiento, cada `sample_every` pasos se generan imagenes con los prompts definidos y se guardan en `output/<nombre>/samples/`. Formato: `<timestamp>__<step>_<idx>.jpg`.

La vista **Trainings** de la UI permite explorar las muestras de cada iteracion en una grid visual.

### 8.5 Resume de entrenamiento

Si se interrumpe un entrenamiento en Modal, al relanzar con el mismo nombre de job el sistema detecta el ultimo checkpoint en el volume y continua desde ese paso. No hace falta intervenir manualmente.

### 8.6 Entrenamiento local (CLI, metodo alternativo)

```powershell
.\venv\Scripts\Activate.ps1
python run.py config/iter_01_train.yaml
python run.py config/iter_02_train.yaml
```

Se usa solo para iter_01 e iter_02 (entrenados en la GPU local antes de migrar a Modal). Para iter_03 en adelante el metodo es UI + Modal.

---

## 9. Configuraciones de entrenamiento

| Archivo | Descripcion | Estado |
|---|---|---|
| `config/iter_01_train.yaml` | Config de iter_01. Dataset: `datasets/iter_01/images`. LoRA desde cero. Output: `outputs/iter_01`. 500 steps. | Historico (local) |
| `config/iter_02_train.yaml` | Config de iter_02. Dataset: `datasets/iter_02/images`. LoRA desde iter_01. Output: `outputs/iter_02`. 500 steps. | Historico (local) |
| `config/historical/iter_03_Arreglo_train.yaml` | Config de referencia de iter_03_Arreglo. Conserva una ruta historica de dataset que debe adaptarse antes de ejecutarla. Output: `outputs/iter_03_Arreglo`. 500 steps. Corrige el bug de bypass_guidance. | Referencia historica |
| `config/historical/train_lora_pixelart_tfg.yaml` | Config original del TFG antes de la reorganizacion. Sus rutas deben adaptarse al entorno actual. | Historico |

A partir de iter_03, las configs no se crean como YAML manuales sino que se generan desde la UI y se almacenan en `aitk_db.db`. Esta base de datos es local y no se distribuye. El YAML de iter_03_Arreglo se conserva en `config/historical/` como referencia y requiere revisar sus rutas antes de reutilizarlo.

**Stack comun a todos los entrenamientos del TFG**:

| Campo | Valor |
|---|---|
| `model.name_or_path` | `black-forest-labs/FLUX.1-dev` |
| `model.arch` | `flux` |
| `model.quantize` | `true` (qfloat8 para el transformer) |
| `model.quantize_te` | `false` (text encoder NO cuantizado) |
| `network.type` | `lora` |
| `network.linear` / `linear_alpha` | `16` |
| `network.conv` / `conv_alpha` | `16` |
| `train.bypass_guidance_embedding` | `false` (critico para FLUX.1-dev) |
| `train.noise_scheduler` | `flowmatch` |
| `train.optimizer` | `adamw8bit` |
| `train.dtype` | `bf16` |
| `train.content_or_style` | `balanced` |
| `trigger_word` | `pixelart` |

---

## 10. Scripts auxiliares activos

Todos los scripts se ejecutan desde la raiz del repo con el entorno virtual activado (salvo el spider, que se ejecuta desde su carpeta).

| Script | Funcion | Entrada | Salida | Cuando usarlo |
|---|---|---|---|---|
| `scripts/tfg/generate_captions.py` | Genera captions automaticos para imagenes de un grupo usando Qwen2.5-VL-7B-Instruct (4-bit). La UI lo lanza internamente. | `--images`, `--output`, `--detail-level`, `--trigger-word`, `--overwrite-mode` | `captions.auto.csv` + `progress.json` | Al generar captions automaticos (normalmente via UI) |
| `scripts/tfg/sync_captions.py` | Sincroniza `captions.csv` a archivos `.txt` por imagen. Antepone trigger `pixelart,` si falta. | `--images datasets/iter_XX/images` | Archivos `.txt` en la misma carpeta | Antes de cada entrenamiento o al modificar captions |
| `scripts/tfg/cleanup_orphan_txt.py` | Elimina `.txt` huerfanos sin `.png` correspondiente. Soporta `--dry-run`. | `--images datasets/iter_XX/images` | Elimina `.txt` sobrantes | Despues de borrar imagenes del dataset |
| `scripts/tfg/scale_pixelart.py` | Escala imagenes a 512x512 con nearest-neighbor (sin interpolacion). | Carpeta entrada, carpeta salida | Imagenes PNG 512x512 | Al incorporar nuevas imagenes al dataset |
| `scripts/tfg/evaluate_style.py` | Extrae las metricas de la evaluacion de la Iteracion 3: paleta, bordes, zonas planas, cuadricula, tamano base del pixel, coherencia del primer plano y variacion local. La UI construye con ellas las notas de estructura y lectura visual. | `--images ARCHIVO_O_CARPETA [...]`, `--reference`, `--labels`, `--output JSON`, `--detail` | Tabla en consola + JSON; desde la UI, evaluacion cacheada por imagen | Desde el boton Evaluar imagen o para comparar carpetas por CLI |
| `scripts/tfg/organize_samples.py` | Copia samples de entrenamiento en subcarpetas por step para comparativa visual. Hardcodeado para iter_01 (pendiente de generalizar). | `outputs/iter_01/pixel_art_lora_v1/samples/` | `outputs/iter_01/organized_samples/` | Despues de completar un entrenamiento |
| `scripts/tfg/generate_single.py` | Genera una sola imagen con prompt interactivo via diffusers. Carga LoRA de iter_02 por defecto. | Prompt por stdin | Imagen PNG en directorio de trabajo | Prueba rapida de un prompt concreto |
| `scripts/tfg/generate_test.py` | Genera un conjunto fijo de 5 prompts de prueba. Usa LoRA de iter_01 por defecto. | Ninguna | Imagenes en `outputs/iter_01/test_generations/` | Evaluacion rapida del LoRA con prompts estandar |
| `scripts/tfg/generate_simple.py` | Genera imagenes usando el sistema interno de ai-toolkit (job config en dict). | Ninguna | Imagenes via toolkit interno | Cuando se quiere usar el mismo sistema que el entrenamiento |
| `scripts/tfg/generate_api.py` | Generacion no interactiva con argumentos CLI. Permite seleccionar modelo, seed, steps y guidance. | `--prompt`, `--model`, opcionales: `--seed`, `--steps`, `--guidance` | Imagen PNG + JSON con metadatos | Uso programatico o desde interfaz web |
| `scripts/tfg/capture_api_requests.py` | Intercepta trafico de red de Pixilart.com usando Playwright para identificar endpoints de API. | Ninguna (lanza navegador headless) | Logs de requests JSON en consola | Diagnostico o re-descubrimiento del endpoint API |
| `scripts/tfg/inspect_api_response.py` | Realiza una peticion directa al endpoint de la API de Pixilart y muestra la estructura de la respuesta. | Ninguna | Salida JSON en consola | Diagnostico del API del scraper |
| `scripts/scrapers/pixilart_scraper/run_spider.py` | Runner principal del scraper. Admite `--topics`, `--min-likes`, `--no-cache`, `--overwrite`. Ejecutar desde esa carpeta. | Ver seccion 6.3 | `datasets/pixilart/` completo | Ampliar dataset con imagenes de Pixilart |

---

## 11. Resultados y outputs

### 11.1 Iter_01

Carpeta: `outputs/iter_01/pixel_art_lora_v1/`

| Archivo | Tipo | Para que sirve |
|---|---|---|
| `pixel_art_lora_v1.safetensors` | LoRA final | Inferencia. Baseline del proyecto. |
| `pixel_art_lora_v1_000000NNN.safetensors` (x4) | Checkpoints | Comparativa por step. Resume si se interrumpe. |
| `optimizer.pt` | Estado del optimizador | Solo para resume. |
| `config.yaml` | Copia de la config | Trazabilidad de hiperparametros. |
| `samples/` | Imagenes JPG por step | Evolucion visual durante el entrenamiento. |
| `my_pixelart_seed*.png` | Generaciones manuales | Pruebas post-entrenamiento. |

### 11.2 Iter_02

Carpeta: `outputs/iter_02/pixel_art_lora_v2/`

| Archivo | Tipo | Para que sirve |
|---|---|---|
| `pixel_art_lora_v2.safetensors` | LoRA final | Inferencia. Refinamiento de iter_01. |
| `pixel_art_lora_v2_000000NNN.safetensors` (x4) | Checkpoints | Comparativa y resume. |
| `optimizer.pt` / `config.yaml` / `samples/` | — | Igual que iter_01. |
| `my_pixelart_seed*.png` (raiz iter_02) | Generaciones manuales | 12 imagenes de prueba. |
| `generated/` | Generaciones organizadas | Evaluacion de resultados. |

### 11.3 Iteracion 3 - Entrenamiento 3 (`iter_03`, resultado no satisfactorio)

Carpeta: `outputs/iter_03/pixel_art_lora_v3/`

LoRA generado tras 1500 pasos con `bypass_guidance_embedding: true`. La ejecucion termino y produjo sus artefactos, pero el resultado visual se alejo del objetivo. Se conserva localmente por trazabilidad historica y no se utilizo como punto de partida del entrenamiento corregido.

### 11.4 Iteracion 3 - Entrenamiento 4 (`iter_03_Arreglo`, exitoso)

Carpeta: `outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/`
Copia en: `output/pixel_art_lora_v3_Arreglo/`

| Archivo | Tipo | Para que sirve |
|---|---|---|
| `pixel_art_lora_v3_Arreglo.safetensors` | LoRA final | **LoRA de referencia actual.** Pixel-art reconocible. 500 steps. |
| `pixel_art_lora_v3_Arreglo_000000NNN.safetensors` (x4) | Checkpoints | Steps 100, 200, 300, 400. |
| `optimizer.pt` | Optimizador | Resume (no necesario para inferencia). |
| `config.yaml` | Config | Hiperparametros del entrenamiento. |
| `samples/` | Imagenes JPG | Evolucion visual: step 0 debe verse como iter_02 final. |
| `log.txt` | Log del entrenamiento | Log completo de la ejecucion en Modal. |
| `.modal_config.json` | Config enviada a Modal | Sin el blob base64 del LoRA pretrained. |

### 11.5 Iteracion 3 - Entrenamiento 5 (ID tecnico `iter_04`)

Carpeta: `output/pixel_art_lora_v4/`
Carpeta de inferencia: `outputs/iter_04/`

Entrenamiento de 600 steps desde iter_03_Arreglo sobre el dataset `iter_03_captions_medios` (130 imagenes, captions medium).

### 11.6 Cache de evaluaciones

Archivo: `outputs/.image-evaluations.json`

Almacena los resultados calculados desde la galeria para no repetir el script cada vez que se abre el panel. Es un artefacto local ignorado por Git. El esquema actual es `version: 3` y cada analisis usa `scoringVersion: 3`.

---

## 12. Flujo operativo actual

### Activar entorno

```powershell
.\venv\Scripts\Activate.ps1
```

### Iniciar la UI

```powershell
cd ui
npm run dev
# Abrir http://localhost:3000
```

### Scrapear imagenes de Pixilart

```powershell
cd scripts\scrapers\pixilart_scraper

# Scrapear topicos con filtro de likes y sin cache
python run_spider.py --topics dogs cats buildings --items-per-topic 50 --min-likes 10 --no-cache

# Revisar informe: datasets/pixilart/reports/latest.json
```

Las imagenes aceptadas quedan en `datasets/pixilart/filtered/accepted/`.

### Preparar captions (via UI)

1. Abrir la UI: **Captions** en el sidebar
2. **Crear grupo** → nombre → seleccionar imagenes de `filtered/accepted/`
3. **Generar captions** → nivel de detalle `medium` → trigger `pixelart` → Lanzar
4. Revisar y editar captions en los textareas
5. **Mover al dataset** → seleccionar `iter_XX`

### Preparar dataset (scripts manuales)

```powershell
# Escalar imagenes a 512x512 (si no se hizo desde la UI)
python scripts/tfg/scale_pixelart.py datasets/iter_XX/raw datasets/iter_XX/images

# Sincronizar captions (captions.csv → .txt por imagen)
python scripts/tfg/sync_captions.py --images datasets/iter_XX/images

# Limpiar huerfanos
python scripts/tfg/cleanup_orphan_txt.py --images datasets/iter_XX/images
```

### Lanzar entrenamiento desde la UI

1. **Jobs → Nuevo job**
2. Nombre: `pixel_art_lora_vX` | Dataset: seleccionar
3. Si es refinamiento: seleccionar LoRA previo en "Pretrained LoRA"
4. Hiperparametros: verificar `bypass_guidance_embedding: false`, `quantize_te: false`
5. GPU: `A100-40GB` | Pulsar **Start**
6. Seguir logs en tiempo real en la UI

> **Importante antes de relanzar un job con el mismo nombre**: borrar el checkpoint del volume de Modal si se quiere empezar desde el LoRA pretrained, no desde un checkpoint anterior:
> ```powershell
> .\venv\Scripts\python.exe -m modal volume rm -r flux-lora-models /pixel_art_lora_vX
> ```

### Verificar contenido del Modal Volume

```powershell
.\venv\Scripts\python.exe -m modal volume ls flux-lora-models
```

### Lanzar entrenamiento via CLI (metodo alternativo — solo iter_01/02)

```powershell
python run.py config/iter_01_train.yaml
python run.py config/iter_02_train.yaml
```

### Organizar samples tras entrenamiento

```powershell
python scripts/tfg/organize_samples.py
```

### Generar imagenes con el LoRA entrenado

```powershell
# Generacion interactiva (prompt manual)
python scripts/tfg/generate_single.py

# Generacion con argumentos CLI
python scripts/tfg/generate_api.py --prompt "pixelart, dragon sprite" --model iter_03_Arreglo

# Generacion con set de prueba fijo
python scripts/tfg/generate_test.py
```

### Evaluar una imagen generada desde la UI

1. Abrir **Generate**.
2. Seleccionar la galeria del modelo base o de un entrenamiento.
3. Abrir una imagen generada.
4. Pulsar **Evaluar imagen**.
5. Revisar por separado **Construccion pixel art**, **Lectura visual experimental** y **Paleta compacta**.

El boton de recarga del panel vuelve a ejecutar el analisis y reemplaza la entrada cacheada. No existe evaluacion manual ni boton para guardar una valoracion del usuario.

Uso equivalente por CLI para inspeccion tecnica:

```powershell
python scripts/tfg/evaluate_style.py `
  --images outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/my_pixelart_seed.png `
  --labels imagen `
  --detail `
  --output results/image_evaluation.json
```



## 13. Estado actual del documento

Documento actualizado a la estructura real del proyecto con:
- Tres iteraciones funcionales y cinco entrenamientos: uno en la Iteracion 1, uno en la Iteracion 2 y tres en la Iteracion 3
- Scraper Pixilart operativo con soporte para `--topics`, `--min-likes`, `--no-cache`, `--overwrite`
- Pipeline de captions automaticos con Qwen2.5-VL-7B-Instruct integrado en la UI
- Grupos de captioning en `caption_groups/` con flujo crear → generar → revisar → mover
- UI Next.js 15 con secciones: Jobs, Captions, Scraper, Datasets, Generate, Trainings y Dashboard
- Evaluacion automatica de la Iteracion 3 documentada con construccion pixel art, lectura visual experimental, paleta independiente, cache y limitaciones
- Scripts unificados en `scripts/tfg/` y pipeline de entrenamiento LoRA sobre FLUX.1-dev documentado de extremo a extremo
