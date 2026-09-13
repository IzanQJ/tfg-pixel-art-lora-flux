# Scripts del TFG

Esta carpeta contiene los scripts Python desarrollados o adaptados para conectar la
preparacion de datos, el captioning, la generacion y la evaluacion con la interfaz.
El uso habitual se realiza desde la UI; la ejecucion manual resulta util para pruebas
y diagnostico.

## Scripts integrados en el flujo principal

### `generate_captions.py`

Genera captions para un grupo de imagenes con
`Qwen/Qwen2.5-VL-7B-Instruct`. El modelo se ejecuta localmente, se carga con
cuantizacion NF4 de 4 bits y utiliza tres niveles de detalle: `short`, `medium` y
`detailed`. Escribe el CSV de captions y un archivo JSON con el progreso.

La UI lo lanza desde `ui/src/server/captions.ts`. La revision y la exportacion al
dataset se realizan despues desde la propia interfaz.

### `generate_api.py`

Genera imagenes con `black-forest-labs/FLUX.1-dev` y, opcionalmente, un LoRA
seleccionado. Acepta el prompt, el identificador del modelo, la seed, el numero de
pasos y el guidance. Si no recibe una seed, crea una aleatoria.

La ruta `POST /api/generate` de la UI ejecuta este script. Las generaciones se guardan
por modelo:

```text
outputs/flux_base/generated/
outputs/<modelId>/generated/
```

### `evaluate_style.py`

Calcula las metricas tecnicas empleadas por la evaluacion de imagenes:

- deteccion del tamano base y alineacion de la cuadricula;
- dureza de bordes y presencia de transiciones suavizadas;
- zonas planas y construccion de curvas escalonadas;
- continuidad aproximada de la figura principal;
- variacion local que puede dificultar la lectura;
- fidelidad al reducir la paleta a 16 colores.

La UI transforma estas medidas en dos notas independientes, **construccion pixel
art** y **lectura visual experimental**, y muestra la paleta como dato adicional. Es
una heuristica de apoyo: no reconoce el objeto, no comprueba el prompt y no sustituye
la revision humana.

## Utilidades de preparacion

### `sync_captions.py`

Sincroniza `captions.csv` con un archivo `.txt` por imagen y normaliza el trigger
`pixelart` cuando falta.

### `scale_pixelart.py`

Prepara imagenes a 512x512 mediante interpolacion nearest-neighbor, adecuada para
conservar bordes duros y bloques de color del pixel art.

### `cleanup_orphan_txt.py`

Elimina archivos `.txt` que no tienen una imagen PNG con el mismo nombre base. Se
conserva como utilidad opcional para mantenimiento manual, pero no forma parte del
flujo estandar de exportacion desde la UI.

## Scripts auxiliares e historicos

- `generate_single.py`: prueba interactiva con un LoRA configurado en el script.
- `generate_simple.py`: ejemplo de generacion mediante una configuracion interna de
  ai-toolkit.
- `generate_test.py`: genera un conjunto fijo de prompts de prueba.
- `organize_samples.py`: reorganiza samples para facilitar comparaciones por paso.
- `capture_api_requests.py`: apoyo durante el analisis del trafico de Pixilart.
- `inspect_api_response.py`: inspeccion manual de respuestas de la API de Pixilart.

Estos scripts pueden contener rutas o modelos de las pruebas originales y deben
revisarse antes de ejecutarlos en otro equipo.

## Ejemplos de ejecucion

Desde la raiz del repositorio:

```powershell
.\venv\Scripts\Activate.ps1

python scripts/tfg/sync_captions.py `
  --images datasets/mi_dataset/images `
  --csv datasets/mi_dataset/images/captions.csv
python scripts/tfg/scale_pixelart.py datasets/mi_dataset/raw datasets/mi_dataset/images
```

Generacion desde CLI:

```powershell
python scripts/tfg/generate_api.py `
  --prompt "pixelart, a cat sitting beside a window" `
  --model base `
  --seed 42
```

Evaluacion de una imagen o comparacion de carpetas:

```powershell
python scripts/tfg/evaluate_style.py `
  --images outputs/flux_base/generated `
  --detail

python scripts/tfg/evaluate_style.py `
  --images outputs/iter_01/generated outputs/iter_02/generated `
  --labels entrenamiento_1 entrenamiento_2 `
  --output results/style_comparison.json
```

Las rutas exactas dependen de los datasets y LoRAs disponibles localmente. Estos
datos y pesos no se distribuyen en la version publica del repositorio.

La documentacion especifica del captioning esta en `README_captions.md` y la vision
completa del sistema en `../../README_TFG_PIPELINE.md`.
