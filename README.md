# TFG - Generacion de Pixel Art mediante LoRA sobre FLUX

Este repositorio contiene el desarrollo practico de mi Trabajo de Fin de Grado, centrado en un pipeline reproducible para adaptar el modelo de difusion FLUX al estilo pixel art mediante LoRA.

El proyecto parte del repositorio base [`ostris/ai-toolkit`](https://github.com/ostris/ai-toolkit), sobre el que se han anadido configuraciones de entrenamiento, scripts de preparacion de datos, resultados visuales por iteracion, un scraper para construir datasets de pixel art a partir de Pixilart.com y un sistema de evaluacion automatica de las imagenes generadas. El README original del repositorio base se conserva en `README_ORIGINAL_AI_TOOLKIT.md`. Los datasets utilizados y los pesos entrenados no se distribuyen en esta version publica.

---

## 1. Descripcion

El objetivo practico de este TFG es construir un flujo completo de entrenamiento de modelos LoRA orientado al estilo pixel art, trabajando de forma iterativa y documentando cada fase.

El modelo base utilizado es `black-forest-labs/FLUX.1-dev`, un modelo de difusion de alta calidad. Sobre el se entrena una red LoRA de rango 16 que aprende el estilo visual del pixel art a partir de un dataset curado manualmente e incrementado progresivamente con datos scrapeados.

El entrenamiento se ejecuta en la nube mediante **Modal** (GPU A100-40GB) lanzado desde una **UI web** (Next.js 15) desarrollada en el TFG. Esto permite configurar, lanzar y monitorizar entrenamientos desde el navegador, sin necesidad de acceso directo a la GPU.

---

## 2. Objetivo del proyecto

Construir y documentar un pipeline completo de fine-tuning mediante LoRA para generacion de imagenes estilo pixel art, cubriendo todas las fases del proceso:

- Construccion y curacion manual de datasets de imagenes pixel art.
- Generacion y sincronizacion de captions descriptivos para cada imagen.
- Entrenamiento iterativo de LoRAs sobre FLUX.1-dev en la nube (Modal).
- Evaluacion tecnica de las imagenes generadas desde la galeria de la UI.
- Mejora progresiva del dataset con nuevas imagenes y captions.
- Automatizacion parcial de la expansion del dataset mediante scraping de Pixilart.com.
- Generacion de imagenes con los LoRAs entrenados para evaluacion y comparativa entre entrenamientos.

---

## 3. Que se ha desarrollado en este TFG

Sobre el repositorio base `ostris/ai-toolkit` se han anadido las siguientes aportaciones:

- **UI web completa** (Next.js 15, TypeScript, SQLite): interfaz para gestionar datasets, captions, entrenamientos y generacion de imagenes. Accesible en `http://localhost:3000` arrancando con `cd ui && npm run dev`.
- **Integracion con Modal cloud GPU**: `run_modal.py` lanza entrenamientos en A100-40GB, sube el dataset y el LoRA pretrained automaticamente, y descarga los resultados al terminar. Sin necesidad de GPU local.
- **Pipeline de encadenamiento de LoRAs**: cada iteracion puede arrancar desde el LoRA de la anterior mediante `pretrained_lora_path`, subiendo el fichero como base64 en el payload de Modal.
- **Configuraciones de entrenamiento por iteracion**: archivos YAML en `config/` y jobs guardados durante la ejecucion en la base de datos local `aitk_db.db`, que no se distribuye.
- **Preparacion de datasets**: flujo para escalar imagenes a 512x512 y sincronizar captions en CSV y archivos `.txt`. Los datos utilizados en el TFG no se incluyen en el repositorio publico.
- **Scripts auxiliares de dataset**: sincronizacion de captions (`sync_captions.py`), limpieza de huerfanos (`cleanup_orphan_txt.py`) y escalado nearest-neighbor (`scale_pixelart.py`).
- **Scraper de Pixilart**: spider Scrapy completo con pipelines de descarga, filtrado, organizacion y registro de metadatos. Implementado en `scripts/scrapers/pixilart_scraper/`.
- **Generacion automatica de captions**: `scripts/tfg/generate_captions.py` con Qwen2.5-VL-7B-Instruct (4-bit), integrado en la UI con flujo crear → generar → revisar → mover.
- **Scripts de generacion de imagenes**: generacion interactiva, por CLI, con prompts de prueba fijos. En `scripts/tfg/`.
- **Evaluacion automatica de imagenes (Iteracion 3)**: desde la galeria se puede analizar cada generacion con dos notas independientes, construccion pixel art y lectura visual experimental, ademas de una medida informativa de paleta compacta. El analisis usa `scripts/tfg/evaluate_style.py` y guarda una cache local por imagen.
- **Documentacion tecnica del pipeline**: `README_TFG_PIPELINE.md` con descripcion detallada de cada componente.

---

## 4. Estado de los entrenamientos

Los identificadores tecnicos de carpetas se conservan por compatibilidad, pero la presentacion funcional agrupa los cinco entrenamientos en tres iteraciones:

| Iteracion | Entrenamiento | ID tecnico | Dataset | Steps | Plataforma | Estado |
|---|---:|---|---|---:|---|---|
| 1 | 1 | `iter_01` | `datasets/iter_01` (~20 imgs) | 500 | Local | Completado |
| 2 | 2 | `iter_02` | `datasets/iter_02` (~14 imgs) | 500 | Local | Completado |
| 3 | 3 | `iter_03` | `datasets/iter_03` | 1500 | Modal A100 | Completado; resultado visual no satisfactorio |
| 3 | 4 | `iter_03_Arreglo` | `datasets/iter_03` | 500 | Modal A100 | **Completado** |
| 3 | 5 | `iter_04` | `datasets/iter_03_captions_medios` (130 imgs) | 600 | Modal A100 | Completado |

La **Iteracion 3** incluye tambien la automatizacion del scraper, el trabajo con captions y la evaluacion tecnica de las imagenes generadas desde la UI.

### Evaluacion de imagenes de la Iteracion 3

Al abrir una imagen generada en la galeria aparece el boton **Evaluar imagen**. El panel separa el resultado en:

- **Construccion pixel art**: tamano y alineacion de la cuadricula, curvas escalonadas y bordes sin suavizado.
- **Lectura visual experimental**: coherencia de la figura principal y ruido local que dificulta interpretarla.
- **Paleta compacta**: dato adicional sobre la perdida al reducir la imagen a 16 colores. No modifica las otras dos notas.

La evaluacion es una heuristica tecnica. No identifica semanticamente el objeto, no comprueba el prompt y no sustituye una valoracion artistica humana.

Las muestras visuales incluidas en `outputs/` documentan la evolucion de los
entrenamientos. Los archivos `.safetensors`, checkpoints y estados internos asociados
no forman parte del repositorio publico.

---

## 5. Inicio rapido

### Requisitos

- Python 3.11 y un entorno virtual con las dependencias de `requirements.txt`
- Node.js 18+ para la UI
- Acceso autorizado a `black-forest-labs/FLUX.1-dev` y un token de lectura de Hugging Face
- Cuenta Modal para los entrenamientos remotos

### Instalacion

```powershell
git submodule update --init --recursive
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install modal
cd ui
npm install
npm run update_db
```

El token de Hugging Face debe configurarse localmente mediante `HF_TOKEN` en un
archivo `.env` no versionado o mediante `huggingface-cli login`. Para utilizar Modal,
hay que instalar su cliente si no esta disponible y ejecutar `modal setup`.

### Preparar un dataset

Los datasets no se incluyen en el repositorio. Cada usuario debe proporcionar imagenes
propias o con permisos de uso y seguir la estructura descrita en `datasets/README.md`.
La interfaz permite crear un dataset y exportar hacia el sus grupos de captions ya
revisados. Tambien se conservan los scripts de scraping y preparacion en `scripts/`.

### Activar entorno e iniciar UI

```powershell
.\venv\Scripts\Activate.ps1
cd ui
npm run dev
# Abrir http://localhost:3000
```

### Lanzar un nuevo entrenamiento

1. **UI → Jobs → Nuevo job**: configurar nombre, dataset, GPU
2. Si es refinamiento: seleccionar LoRA previo en "Pretrained LoRA"
3. Verificar: `bypass_guidance_embedding: false`, `quantize_te: false`
4. Pulsar **Start** → los logs aparecen en tiempo real

Los modelos, checkpoints, estados del optimizador y bases de datos producidos durante
el entrenamiento se guardan localmente, pero estan excluidos de la version publica.

### Generar una imagen

1. Abrir **Generate** en la interfaz.
2. Seleccionar FLUX base o un LoRA disponible localmente.
3. Introducir el prompt y los parametros de generacion.
4. Generar la imagen y consultar el resultado en la galeria asociada al modelo.

### Evaluar una imagen generada

1. Abrir **Generate** y seleccionar una galeria.
2. Abrir una imagen generada.
3. Pulsar **Evaluar imagen**.
4. Consultar por separado la construccion pixel art, la lectura visual experimental y la paleta.

### Keymaps heredados de ai-toolkit

Los archivos `toolkit/keymaps/*_ldm_base.safetensors` proceden del proyecto upstream
`ostris/ai-toolkit` y se utilizan al convertir determinados modelos Stable Diffusion
desde Diffusers al formato LDM. No intervienen en el pipeline FLUX + LoRA de este TFG
y no se distribuyen en este repositorio. Quien necesite esas conversiones debe obtener
los keymaps desde una revision compatible del repositorio upstream.

---

## 6. Documentacion tecnica

La documentacion tecnica detallada del pipeline — estructura de datasets, scraper, entrenamiento LoRA, Modal, scripts, configuraciones, iteraciones y flujo operativo — esta en:

**`README_TFG_PIPELINE.md`**
