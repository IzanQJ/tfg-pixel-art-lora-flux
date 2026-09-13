# Interfaz web del TFG

Esta aplicacion parte de la interfaz incluida en `ostris/ai-toolkit` y la amplia para
centralizar el pipeline desarrollado en el TFG. Esta construida con Next.js 15,
React, TypeScript, Tailwind CSS, Prisma y SQLite.

## Funcionalidades

- crear, iniciar, detener y consultar jobs de entrenamiento;
- ejecutar entrenamientos locales o remotos mediante Modal;
- lanzar recopilaciones del scraper y revisar imagenes aceptadas o rechazadas;
- crear grupos de captions desde distintas ejecuciones del scraper;
- generar captions con Qwen2.5-VL, editarlos y exportarlos a datasets;
- explorar datasets y muestras de cada entrenamiento;
- generar imagenes con FLUX base o con LoRAs disponibles localmente;
- evaluar tecnicamente las imagenes generadas.

La interfaz coordina estas operaciones mediante Route Handlers de Next.js y servicios
en `src/server/`. Los procesos intensivos siguen ejecutandose en Python.

## Instalacion e inicio

Desde `ai-toolkit/ui`:

```powershell
npm install
npm run update_db
npm run dev
```

La aplicacion queda disponible normalmente en
[http://localhost:3000](http://localhost:3000). Si el puerto esta ocupado, Next.js
selecciona otro disponible.

`npm run dev` inicia conjuntamente la UI y el worker que procesa la cola de jobs. El
entorno Python del repositorio y sus dependencias deben estar instalados porque las
rutas de scraping, captions, generacion y evaluacion lanzan scripts de `scripts/`.

Para una compilacion de produccion:

```powershell
npm run build
npm run start
```

## Persistencia

Prisma y SQLite almacenan datos estructurados de la aplicacion: ajustes, colas y jobs.
Los artefactos grandes o inspeccionables se mantienen en el sistema de archivos:

```text
datasets/         datasets de entrenamiento
caption_groups/   grupos y captions revisables
output/           configuraciones y logs operativos de jobs
outputs/          LoRAs, samples y generaciones organizadas
```

La base de datos, los datasets, los grupos de captions y los pesos entrenados son
locales y estan excluidos de la version publica.

## Scraper y captions

Cada ejecucion del scraper puede crear una carpeta independiente bajo
`datasets/pixilart/scrapes/`. Desde la UI se consultan sus imagenes aceptadas,
rechazadas y revisadas manualmente.

En **Captions** se selecciona una carpeta del scraper y se crea un grupo con las
imagenes elegidas. Qwen2.5-VL se ejecuta localmente y la UI consulta el progreso del
proceso. Tras la revision, la exportacion convierte las imagenes a PNG de 512x512 con
Sharp y nearest-neighbor, crea un TXT por imagen y actualiza `captions.csv`.

## Entrenamiento

La pantalla **New Job** procede de la base de ai-toolkit y se ha adaptado para incluir
la seleccion del entorno de ejecucion y de un LoRA previo. Los jobs locales ejecutan
`run.py`; los jobs remotos llaman a `run_modal.py` mediante el worker.

Durante la ejecucion, la vista del job muestra el estado, el log, el progreso y los
checkpoints detectados. Para Modal tambien se puede consultar el estado del contenedor,
la GPU y los logs desde su panel externo. Los resultados remotos se descargan a la
carpeta de salida local al finalizar.

## Generacion y galerias

`POST /api/generate` ejecuta `scripts/tfg/generate_api.py`. El usuario selecciona
FLUX base o un LoRA, introduce el prompt y puede indicar una seed. Cuando se omite,
el script genera una seed aleatoria.

El selector contiene los entrenamientos catalogados y anade dinamicamente carpetas
de `outputs/` que contengan un LoRA final. Los checkpoints intermedios con sufijo de
paso no se ofrecen como modelos independientes.

Las imagenes se guardan en la galeria asociada al modelo:

```text
outputs/flux_base/generated/
outputs/<modelId>/generated/
```

## Evaluacion de imagenes

Al abrir una generacion se puede ejecutar la evaluacion tecnica. El flujo es:

```text
GalleryView.tsx
  -> POST /api/generated-images/evaluate
  -> scripts/tfg/evaluate_style.py
  -> metricas en JSON
  -> puntuaciones calculadas por la ruta API
  -> ImageEvaluationPanel.tsx
```

El panel presenta:

- **Construccion pixel art**: cuadricula y tamano base, curvas escalonadas y bordes
  sin suavizado.
- **Lectura visual experimental**: continuidad aproximada de la figura y ruido local.
- **Paleta compacta**: fidelidad informativa al reducir a 16 colores.

La evaluacion no identifica semanticamente el contenido, no comprueba la adecuacion
al prompt y no sustituye la revision visual. La cache local se guarda en
`outputs/.image-evaluations.json` y no se versiona.

## Documentacion relacionada

- `../README.md`: presentacion e instalacion del proyecto.
- `../README_TFG_PIPELINE.md`: arquitectura y flujo tecnico completo.
- `../scripts/tfg/README_captions.md`: funcionamiento detallado del captioning.
