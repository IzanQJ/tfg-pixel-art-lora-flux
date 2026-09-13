# UI del TFG

Interfaz web del pipeline de generacion de pixel art con FLUX y LoRA. Esta construida con Next.js 15, TypeScript y App Router, y permite trabajar con el proyecto sin lanzar manualmente la mayoria de scripts.

## Funciones principales

- Crear, lanzar y monitorizar entrenamientos locales o en Modal.
- Explorar datasets y grupos de captions.
- Ejecutar y revisar procesos del scraper de Pixilart.
- Generar imagenes con FLUX base o con cualquiera de los LoRAs entrenados.
- Consultar galerias agrupadas por iteracion y entrenamiento.
- Evaluar tecnicamente las imagenes generadas desde su visor.

## Inicio

Desde `ai-toolkit/ui`:

```powershell
npm install
npm run dev
```

La aplicacion queda disponible normalmente en [http://localhost:3000](http://localhost:3000). Si ese puerto esta ocupado, Next.js selecciona el siguiente disponible.

La UI necesita que el entorno Python del proyecto y sus dependencias esten instalados, porque algunas rutas API ejecutan scripts de `scripts/tfg/`.

## Evaluacion de imagenes: Iteracion 3

La evaluacion automatica forma parte de la **Iteracion 3**. Solo se aplica a imagenes generadas guardadas en `outputs/`; no procesa samples internos del entrenamiento ni imagenes de datasets.

Flujo de uso:

1. Abrir **Generate**.
2. Seleccionar la galeria del modelo base o de un entrenamiento.
3. Abrir una imagen.
4. Pulsar **Evaluar imagen**.

El panel muestra dos notas separadas:

- **Construccion pixel art**: tamano y cuadricula del pixel aparente, curvas escalonadas y bordes sin suavizado.
- **Lectura visual experimental**: continuidad de la figura principal y ruido local que compite con ella.

La **paleta compacta** se presenta como dato adicional y no modifica ninguna de las notas anteriores.

La evaluacion no reconoce semanticamente el contenido, no comprueba si la imagen coincide con el prompt y no mide belleza o composicion. La lectura visual es una heuristica experimental pensada principalmente para imagenes con un sujeto claro sobre un fondo diferenciable.

## Implementacion de la evaluacion

```text
GalleryView.tsx
  -> POST /api/generated-images/evaluate
  -> scripts/tfg/evaluate_style.py
  -> metricas en JSON
  -> calculo de notas en la ruta API
  -> ImageEvaluationPanel.tsx
```

Archivos principales:

- `src/components/GalleryView.tsx`: visor y boton de evaluacion.
- `src/components/ImageEvaluationPanel.tsx`: presentacion de notas, criterios y limitaciones.
- `src/app/api/generated-images/evaluate/route.ts`: ejecucion del script y transformacion de metricas.
- `src/server/imageEvaluations.ts`: lectura y escritura de la cache.
- `src/types/imageEvaluation.ts`: contrato de tipos de la version de puntuacion.

Los resultados se guardan localmente en `outputs/.image-evaluations.json`. El archivo esta ignorado por Git y la version actual del esquema y de las formulas es la **3**. Una version incompatible se descarta para evitar mostrar notas calculadas con formulas antiguas.

## Verificacion

```powershell
npm run build
```

La documentacion tecnica completa del proyecto se encuentra en `../README_TFG_PIPELINE.md`.
