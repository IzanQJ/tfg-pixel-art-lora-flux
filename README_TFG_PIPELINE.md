# Documentacion tecnica del pipeline del TFG

Este documento describe el estado final del proyecto **Diseño de un pipeline de
entrenamiento de modelos generativos orientado a la producción de imágenes en estilo
pixel-art**. Su finalidad es explicar el flujo operativo real del repositorio y separar
las aportaciones del TFG de la base heredada de `ostris/ai-toolkit`.

Los datasets, los LoRAs y los checkpoints utilizados durante el desarrollo no se
distribuyen. El repositorio publico conserva el codigo, las configuraciones que pueden
servir como referencia y las muestras visuales de los entrenamientos.

## 1. Alcance del sistema

El pipeline integra en una misma aplicacion las fases necesarias para preparar,
entrenar y evaluar una adaptacion LoRA de FLUX orientada al pixel art:

1. Recopilacion de imagenes mediante el scraper de Pixilart.
2. Filtrado automatico y revision manual.
3. Generacion y revision de captions con Qwen2.5-VL.
4. Preparacion del dataset de entrenamiento.
5. Configuracion y ejecucion de jobs locales o en Modal.
6. Consulta de samples y artefactos del entrenamiento.
7. Generacion de imagenes con FLUX base o con un LoRA.
8. Evaluacion tecnica de las imagenes generadas.

```text
Pixilart
   -> scraper y filtros
   -> revision manual
   -> grupo de captions
   -> Qwen2.5-VL y revision
   -> dataset 512x512 con pares PNG/TXT
   -> entrenamiento FLUX + LoRA
   -> samples y LoRA
   -> generacion
   -> evaluacion tecnica
```

La reproducibilidad se apoya en configuraciones, nombres de datasets, logs, samples,
seeds y estructura de carpetas. No significa que el repositorio incluya datos o pesos
de terceros, ni que todas las ejecuciones produzcan bits identicos en hardware y
versiones diferentes.

## 2. Base heredada y aportaciones del TFG

| Area | Procedencia principal | Uso en el proyecto |
|---|---|---|
| Motor de entrenamiento, jobs y configuracion LoRA | `ostris/ai-toolkit` | Entrenamiento de FLUX y gestion de artefactos. |
| UI base, cola, Prisma y SQLite | `ostris/ai-toolkit`, posteriormente adaptado | Creacion y ejecucion de jobs y persistencia local. |
| Scraper y revision de Pixilart | TFG | Recopilacion, filtros, carpetas por ejecucion y revision manual. |
| Captioning con Qwen2.5-VL | TFG | Creacion, generacion, edicion y exportacion de captions. |
| Preparacion de datasets | TFG | Conversion a PNG, ajuste a 512x512 y generacion de TXT/CSV. |
| Ejecucion mediante Modal | TFG | GPU remota, volumen persistente y transferencia de LoRAs previos. |
| Generacion y galerias por modelo | TFG | Comparacion de FLUX base y los LoRAs entrenados. |
| Evaluacion tecnica | TFG | Analisis de construccion pixel art, lectura visual y paleta. |

El README original del proyecto upstream se conserva en
`README_ORIGINAL_AI_TOOLKIT.md` y su licencia en `LICENSE`.

## 3. Arquitectura y persistencia

La interfaz esta implementada con Next.js, React y TypeScript en `ui/`. Las rutas API
y los servicios de servidor coordinan scripts Python, SQLite y el sistema de archivos.

```text
UI Next.js
   -> API Routes y servicios TypeScript
      -> Prisma + SQLite: settings, jobs y colas
      -> sistema de archivos: datasets, captions, logs y outputs
      -> scripts Python: scraper, Qwen, generacion y evaluacion
      -> ai-toolkit: entrenamiento local
      -> Modal: entrenamiento remoto
```

`aitk_db.db` se crea localmente mediante Prisma. Guarda las entidades `Settings`,
`Queue` y `Job`, incluida la configuracion JSON de cada trabajo. No almacena imagenes,
captions ni pesos y no forma parte de la distribucion publica.

Las carpetas locales principales son:

```text
caption_groups/                  # grupos intermedios de captioning
datasets/                        # datos locales, no distribuidos
output/<job>/                    # configuracion y log gestionados por la UI
outputs/<iteracion>/<lora>/      # modelos, checkpoints y samples
outputs/<modelId>/generated/     # generaciones guardadas por modelo
```

En la version publica se conservan las imagenes utiles de `outputs/`, pero se ignoran
`.safetensors`, checkpoints, `optimizer.pt`, bases de datos, logs y configuraciones
internas generadas.

## 4. Instalacion

Requisitos principales:

- Python 3.11.
- Node.js 18 o posterior.
- PyTorch y torchvision compatibles con la version de CUDA del equipo.
- CUDA y una GPU compatible para ejecucion local de las tareas de IA.
- Acceso aceptado a `black-forest-labs/FLUX.1-dev` en Hugging Face.
- Una cuenta de Modal para el entrenamiento remoto.

Preparacion basica en Windows:

```powershell
git submodule update --init --recursive
python -m venv venv
.\venv\Scripts\Activate.ps1
# Instalar primero PyTorch/torchvision para la version de CUDA del equipo
pip install -r requirements.txt
pip install -r scripts/scrapers/pixilart_scraper/requirements_scraper.txt
pip install qwen-vl-utils
pip install modal

cd ui
npm install
npm run update_db
```

El token de Hugging Face se configura localmente mediante `HF_TOKEN`, el login de
Hugging Face o la pantalla de ajustes de la UI. Nunca debe versionarse. Modal requiere:

```powershell
modal setup
modal secret create huggingface-secret HF_TOKEN=<token_de_lectura>
```

El nombre `huggingface-secret` es obligatorio porque es el que utiliza `run_modal.py`.

## 5. Recopilacion y revision de imagenes

### 5.1 Ejecuciones del scraper

La pantalla **Scraper** permite indicar un nombre, uno o varios topics, el numero de
items por topic, un limite global y un minimo de likes. Solo puede existir una ejecucion
activa a la vez. Cada ejecucion creada desde la UI se guarda por separado:

```text
datasets/pixilart/scrapes/<timestamp>_<nombre>/
|-- scrape_run.json
|-- raw/
|   |-- images/
|   |-- metadata/pixilart_raw.jsonl
|   `-- logs/run.log
|-- filtered/
|   |-- accepted/
|   |-- rejected/
|   |-- manual_accepted/
|   `-- metadata/
|       |-- pixilart_filtered.jsonl
|       |-- pixilart_rejected.jsonl
|       `-- pixilart_manual_removed.jsonl
`-- reports/
```

La carpeta `datasets/pixilart/` sin `scrapes/<id>` se mantiene como compatibilidad con
la ejecucion principal anterior.

La UI lanza `scripts/scrapers/pixilart_scraper/run_spider.py` desde
`ui/src/server/scraper.ts`. El runner admite `--topics`, `--tags`, `--items-per-topic`,
`--max-items`, `--min-likes`, `--overwrite`, `--no-cache` y `--output-root`.

Ejemplo manual:

```powershell
cd scripts\scrapers\pixilart_scraper
python run_spider.py --topics animals nature --items-per-topic 50 --min-likes 10
```

### 5.2 Filtros

| Criterio | Tratamiento |
|---|---|
| Menos likes que `--min-likes` | Se omite antes de descargar el item. |
| GIF | Se registra como rechazado con `is_gif`. |
| Imagen corrupta | Se registra como rechazada con `corrupt_image`. |
| Canvas superior a 128 px | Se descarta para limitar el dataset a pixel art de baja resolucion. |
| `notmine`, `stolen`, `repost`, `traced` | Rechazo automatico por tag. |
| `base`, `collab`, `collaboration`, `wip`, `template`, `free2use` | Pasa a revision manual. |

El filtro de likes se introdujo tras observar baja consistencia en recopilaciones sin
umbral. Mejora la seleccion inicial, pero tambien introduce un sesgo hacia obras mas
populares o antiguas. Por eso se conserva la revision humana.

La vista manual se sincroniza como `manual_accepted = accepted - manual_removed`.
Cuando se descarta una imagen desde la UI, se retira de `manual_accepted`, se copia a
`rejected` y se registra el motivo `manual_deleted`.

## 6. Captions y preparacion del dataset

### 6.1 Grupos de captions

La pantalla **Captions** permite elegir cualquiera de las carpetas generadas por el
scraper, seleccionar sus imagenes aceptadas y crear un grupo:

```text
caption_groups/<timestamp>-<nombre>/
|-- images/
|-- captions.auto.csv
|-- captions.csv
|-- manifest.json
|-- progress.json
|-- titles.json
`-- generate.log
```

`captions.auto.csv` recibe inicialmente la salida automatica y `captions.csv` es la
version utilizada para la revision y la exportacion. Al guardar cambios desde la UI,
ambos archivos se mantienen sincronizados. El manifiesto conserva tambien la carpeta
de scraper de origen para mantener la trazabilidad.

### 6.2 Qwen2.5-VL

`scripts/tfg/generate_captions.py` carga localmente
`Qwen/Qwen2.5-VL-7B-Instruct`. El modelo recibe la imagen y un prompt adaptado al nivel
de detalle. Si existen, el titulo y los tags se pasan como pistas de comprension. La
generacion es determinista (`do_sample=False`).

El modelo se cuantiza en 4 bits NF4 mediante bitsandbytes, usa `bfloat16` para el
calculo y `device_map=auto` para distribuirlo segun los recursos disponibles.

| Nivel | Formato solicitado |
|---|---|
| `short` | Etiqueta de 8-12 palabras: trigger, sujeto y uno o dos rasgos de estilo. |
| `medium` | Lista estructurada de tags: categoria, vista, sujeto, detalles y rasgos pixel art. |
| `detailed` | Una o dos frases de 20-35 palabras sobre sujeto, escena y tecnica. |

Los captions pueden generarse solo para campos vacios o sobrescribirse por completo.
`progress.json` permite que la UI muestre el progreso y los errores del proceso.

### 6.3 Exportacion al dataset

`moveToDataset` en `ui/src/server/captions.ts` realiza la preparacion estandar:

1. Copia cada imagen seleccionada.
2. La convierte a PNG.
3. La ajusta a 512x512 con Sharp y `kernel.nearest`.
4. Usa `fit: contain` y fondo blanco para mantener la proporcion.
5. Actualiza `captions.csv`.
6. Genera un `.txt` por imagen y normaliza el trigger `pixelart`.

La estructura esperada se documenta en `datasets/README.md`:

```text
datasets/<nombre>/images/
|-- imagen_001.png
|-- imagen_001.txt
`-- captions.csv
```

Los scripts `scale_pixelart.py` y `sync_captions.py` permiten realizar manualmente las
operaciones principales. Cuando `captions.csv` esta dentro de `images/`, debe indicarse
su ruta mediante `sync_captions.py --csv <ruta>`. `cleanup_orphan_txt.py` es una
utilidad opcional para revisar TXT sin una imagen correspondiente; no forma parte del
recorrido normal de exportacion desde la UI.

## 7. Entrenamiento

### 7.1 Experimentos realizados

| Iteracion | Entrenamiento | Dataset utilizado | Captions | Pasos | Entorno | Punto de partida |
|---|---:|---|---|---:|---|---|
| 1 | 1, LoRA v1 | `iter_01` | Manuales | 500 | Local | FLUX.1-dev |
| 2 | 2, LoRA v2 | `iter_02` | Manuales | 500 | Local | LoRA v1 |
| 3 | 3, LoRA v3 | `iter_03`, 130 imagenes | Detallados | 1500 | Modal A100-40GB | LoRA v2 |
| 3 | 4, LoRA corregido | `iter_03_2`, 130 imagenes | Revisados | 500 | Modal A100-40GB | LoRA v2 |
| 3 | 5, LoRA v4 | `iter_03_captions_medios`, 130 imagenes | Medios | 600 | Modal A100-40GB | LoRA corregido |

Los nombres de dataset describen los datos locales usados durante el desarrollo. Esos
datos no se distribuyen en el repositorio publico.

Las configuraciones manuales de las dos primeras iteraciones se conservan en `config/`.
Las configuraciones experimentales que contienen rutas ya no disponibles estan en
`config/historical/` y deben adaptarse antes de reutilizarlas. Las configuraciones
creadas desde la UI se almacenan en SQLite y en archivos locales del job.

### 7.2 Creacion y seguimiento de jobs

Desde **Jobs -> Nuevo job** se seleccionan nombre, GPU, carpeta de salida, dataset,
LoRA previo, pasos, frecuencia de guardado y prompts de sampling. El job se guarda en
SQLite y la cola lo asigna a la GPU indicada.

Durante la ejecucion, la vista del job presenta estado, paso actual y log. Para trabajos
remotos, Modal ofrece ademas el estado del contenedor, la GPU asignada, consumo y logs.
Los samples y checkpoints se consultan posteriormente desde la carpeta del
entrenamiento y desde la pantalla **Trainings**.

### 7.3 Ejecucion local

Los jobs locales pasan por `ui/cron/actions/startJob.ts`, que crea `.job_config.json`,
prepara `log.txt` y ejecuta `run.py` con la GPU local seleccionada.

Tambien pueden iniciarse por CLI:

```powershell
python run.py config/iter_01_train.yaml
python run.py config/iter_02_train.yaml
```

Estas configuraciones requieren que el usuario reconstruya sus datasets y, para la
segunda iteracion, proporcione el LoRA previo indicado.

### 7.4 Ejecucion mediante Modal

La UI ofrece L4, A10G, A100-40GB y H100. Los entrenamientos documentados de la tercera
iteracion utilizaron A100-40GB.

```text
Job en SQLite
   -> worker crea .modal_config.json
   -> python -m modal run run_modal.py
   -> run_modal.py adapta rutas Windows/Linux
   -> dataset incluido en la imagen/entorno remoto
   -> entrenamiento en GPU Modal
   -> volumen flux-lora-models
   -> descarga automatica a la carpeta local configurada
```

Si existe `pretrained_lora_path`, `run_modal.py` lee el LoRA local, lo codifica en
Base64 dentro del payload, reconstruye el archivo en el contenedor y sustituye la ruta
por su equivalente bajo `/root/ai-toolkit`. El Base64 se elimina antes de guardar la
configuracion efectiva para evitar que se replique en los artefactos.

Modal utiliza dos volumenes persistentes:

- `flux-lora-models`: resultados de entrenamiento.
- `flux-lora-hf-cache`: cache del modelo base de Hugging Face.

La funcion remota tiene un limite de dos horas. Si ya existe un checkpoint compatible
para el mismo trabajo, ai-toolkit puede reanudar desde el ultimo guardado.

### 7.5 Diagnostico del entrenamiento 3

El tercer entrenamiento termino y genero LoRA, checkpoints y samples, pero su resultado
visual se alejo del pixel art buscado. La comparacion de configuraciones identifico tres
cambios relevantes: `bypass_guidance_embedding: true`, cuantizacion del text encoder
con `quantize_te: true` y `qtype_te: qfloat8`, y `timestep_type: sigmoid`.

El entrenamiento corregido desactivo el bypass y la cuantizacion del text encoder,
retiro el timestep explicito, mantuvo una configuracion equilibrada y partio de LoRA
v2 en lugar de continuar desde el resultado no satisfactorio. Se redujo a 500 pasos
para comprobar primero la correccion. El resultado recupero una construccion pixel art
mucho mas clara. El quinto entrenamiento partio de ese LoRA y empleo captions medios.

La comparacion demuestra que una ejecucion puede completarse tecnicamente sin alcanzar
el objetivo visual y que conservar configuraciones, logs y samples resulta esencial
para diagnosticarla.

## 8. Generacion y galerias

La ruta `POST /api/generate` ejecuta `scripts/tfg/generate_api.py`. Acepta un prompt,
un modelo y una seed opcional. El script anade el trigger `pixelart` cuando falta,
carga FLUX.1-dev y aplica el LoRA elegido.

El selector incluye FLUX base, los cinco entrenamientos catalogados y nuevos LoRAs
descubiertos dinamicamente en `outputs/`. Los checkpoints con sufijo de paso se excluyen
de esa deteccion.

Si no se proporciona seed, se genera un entero aleatorio. Si se reutilizan modelo,
prompt, seed y parametros de inferencia, se parte del mismo ruido inicial y la salida
es comparable. Para comparar LoRAs de forma controlada debe mantenerse todo lo demas
constante y variar solo el modelo.

Las imagenes se guardan como:

```text
outputs/flux_base/generated/flux_base_seed<seed>_<timestamp>.png
outputs/<modelId>/generated/pixelart_seed<seed>_<timestamp>.png
```

## 9. Evaluacion tecnica

Desde la galeria, `POST /api/generated-images/evaluate` ejecuta
`scripts/tfg/evaluate_style.py`. Las metricas brutas se convierten en tres bloques:

| Bloque | Aspectos |
|---|---|
| Construccion pixel art | Tamano y cuadricula, curvas escalonadas y bordes sin suavizado. |
| Lectura visual experimental | Coherencia de la figura y ruido que compite con ella. |
| Paleta compacta | Fidelidad aproximada al reducir la imagen a 16 colores. |

La cache local se guarda en `outputs/.image-evaluations.json` con version de esquema y
de puntuacion. El archivo esta ignorado por Git.

La evaluacion es heuristica: no reconoce el objeto, no comprueba el prompt y no mide
calidad artistica. Sirve como apoyo a la revision visual, no como criterio unico para
declarar que un modelo es mejor.

## 10. Scripts principales

| Archivo | Funcion |
|---|---|
| `scripts/scrapers/pixilart_scraper/run_spider.py` | Ejecuta el scraper y sus filtros. |
| `scripts/tfg/generate_captions.py` | Genera captions locales con Qwen2.5-VL. |
| `scripts/tfg/scale_pixelart.py` | Prepara imagenes mediante nearest-neighbor. |
| `scripts/tfg/sync_captions.py` | Sincroniza `captions.csv` y archivos TXT. |
| `scripts/tfg/cleanup_orphan_txt.py` | Utilidad opcional para detectar/eliminar TXT huerfanos. |
| `scripts/tfg/generate_api.py` | Generacion usada por la interfaz. |
| `scripts/tfg/evaluate_style.py` | Calcula las metricas tecnicas. |
| `run_modal.py` | Construye y ejecuta el trabajo remoto en Modal. |

`generate_single.py`, `generate_simple.py`, `generate_test.py`,
`organize_samples.py`, `capture_api_requests.py` e `inspect_api_response.py` se
conservan como utilidades de prueba, diagnostico o experimentacion. No forman parte del
recorrido principal de la interfaz.

## 11. Uso operativo resumido

```powershell
# Activar Python
.\venv\Scripts\Activate.ps1

# Iniciar interfaz y worker
cd ui
npm run dev
```

Desde la interfaz:

1. Crear una ejecucion en **Scraper** y revisar aceptadas/rechazadas.
2. Crear un grupo en **Captions**, generar, revisar y exportar.
3. Crear un trabajo en **Jobs**, seleccionar dataset y GPU y pulsar **Start**.
4. Revisar logs y samples en el trabajo y en **Trainings**.
5. Seleccionar el modelo en **Generate** y generar una imagen.
6. Abrir la imagen y ejecutar **Evaluar imagen**.

Generacion equivalente por CLI:

```powershell
python scripts/tfg/generate_api.py `
  --prompt "a cat sitting beside a window" `
  --model iter_03_Arreglo `
  --seed 42
```

## 12. Distribucion publica y limitaciones

No se distribuyen:

- Imagenes ni captions de los datasets del TFG.
- Grupos de captions generados durante las pruebas.
- LoRAs, checkpoints, `optimizer.pt` o bases de datos de perdida.
- `aitk_db.db`, tokens, caches, logs o configuraciones internas generadas.
- Keymaps binarios de conversion heredados de ai-toolkit.

Si se clona la version publica, el usuario debe aportar un dataset compatible, obtener
acceso a FLUX.1-dev y entrenar o copiar sus propios LoRAs. Las configuraciones de
`config/historical/` documentan pruebas anteriores, pero sus rutas deben adaptarse.

Las muestras visuales de `outputs/` se conservan como evidencia de la evolucion del
proyecto. El README principal contiene la guia de entrada y `scripts/tfg/README.md` y
`scripts/tfg/README_captions.md` amplian el uso de los scripts.
