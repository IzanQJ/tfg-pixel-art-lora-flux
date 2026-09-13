# Captioning automatico con Qwen2.5-VL

La seccion **Captions** de la interfaz permite seleccionar imagenes aceptadas por el
scraper, reunirlas en grupos, generar descripciones automaticas y revisarlas antes de
exportarlas a un dataset de entrenamiento.

## Flujo

```text
ejecucion del scraper
  -> imagenes aceptadas y revisadas
  -> crear grupo de captions
  -> generar con Qwen2.5-VL
  -> revisar o editar en la UI
  -> exportar al dataset
  -> imagen PNG 512x512 + caption TXT + captions.csv
```

Al crear un grupo se elige primero una de las carpetas producidas por el scraper y,
dentro de ella, las imagenes que se quieren procesar. Esto permite trabajar con varias
recopilaciones independientes y conservar su procedencia.

## Estructura de un grupo

```text
caption_groups/<id>/
|-- images/
|-- captions.auto.csv
|-- captions.csv
|-- manifest.json
|-- progress.json
|-- titles.json
`-- generate.log
```

- `images/`: copia de las imagenes seleccionadas.
- `captions.auto.csv`: recibe la salida de Qwen y se sincroniza al guardar ediciones.
- `captions.csv`: version revisada que se utiliza para exportar al dataset.
- `manifest.json`: nombre, estado, origen y destino del grupo.
- `progress.json`: numero de imagenes procesadas y archivo actual.
- `titles.json`: titulo, tags y otros metadatos disponibles del scraper.
- `generate.log`: salida de la ultima ejecucion del modelo.

Los estados principales son `draft`, `generating`, `review` y `moved`.

## Modelo y ejecucion

El script `generate_captions.py` utiliza por defecto
`Qwen/Qwen2.5-VL-7B-Instruct`. Es un modelo multimodal: recibe conjuntamente la
imagen y una instruccion textual, procesa ambas entradas y genera el caption como
respuesta.

El modelo se ejecuta localmente en el entorno Python del proyecto. Se carga mediante
Transformers con:

- cuantizacion NF4 de 4 bits con bitsandbytes;
- calculo en `bfloat16`;
- asignacion automatica de dispositivo con `device_map="auto"`;
- generacion determinista con `do_sample=False`;
- limite de 200 tokens nuevos.

La cuantizacion reduce el uso de memoria respecto a cargar todos los pesos a precision
completa. La primera ejecucion descarga el modelo desde Hugging Face si no existe en
la cache local.

Cuando hay metadatos en `titles.json`, el titulo y las tags se anaden a la instruccion
como pistas para interpretar la imagen. No se copian automaticamente como caption: el
modelo sigue generando una descripcion nueva a partir de la imagen y esas referencias.

## Niveles de detalle

| Nivel | Instruccion aplicada | Salida esperada |
|---|---|---|
| `short` | 8-12 palabras; trigger, sujeto y una o dos etiquetas de estilo | Etiqueta breve, sin describir fondo, color o composicion |
| `medium` | Lista estructurada de categoria, perspectiva, sujeto, colores y rasgos | Tags separados por comas y cierre con rasgos fijos de pixel art |
| `detailed` | Una o dos frases de 20-35 palabras | Sujeto, escenario breve y tecnicas concretas de pixel art |

La interfaz permite procesar solo captions vacios (`empty_only`) o regenerar todos
los del grupo (`overwrite_all`). El resultado automatico se puede modificar y guardar
antes de exportarlo.

## Exportacion al dataset

La exportacion no llama a un script externo. La funcion `moveToDataset` de
`ui/src/server/captions.ts` realiza el proceso:

1. Lee los captions revisados del grupo.
2. Convierte cada imagen a PNG.
3. La redimensiona a 512x512 con Sharp y `sharp.kernel.nearest`.
4. Mantiene la proporcion con `fit: contain` y completa el lienzo con fondo blanco.
5. Evita colisiones de nombres mediante sufijos numericos.
6. Actualiza `datasets/<dataset>/images/captions.csv`.
7. Crea un `.txt` con el mismo nombre base que cada imagen.
8. Anade el trigger word si el caption todavia no lo incluye.

`sharp.kernel.nearest` es la implementacion de Sharp de la interpolacion
nearest-neighbor. Ambos nombres describen el mismo criterio: cada pixel nuevo toma el
valor del pixel original mas cercano, sin mezclar colores, lo que ayuda a conservar
los bordes del pixel art.

## Ejecucion manual

Desde la raiz del repositorio:

```powershell
.\venv\Scripts\Activate.ps1
python scripts/tfg/generate_captions.py `
  --images caption_groups/<id>/images `
  --output caption_groups/<id>/captions.auto.csv `
  --progress-file caption_groups/<id>/progress.json `
  --titles-file caption_groups/<id>/titles.json `
  --trigger-word pixelart `
  --detail-level medium `
  --model-name Qwen/Qwen2.5-VL-7B-Instruct `
  --overwrite-mode empty_only
```

Dependencias especificas:

```powershell
pip install transformers accelerate bitsandbytes qwen-vl-utils pillow
```

PyTorch y torchvision tambien deben estar instalados. En el uso normal, la UI busca
primero `venv/Scripts/python.exe`, lanza el proceso en segundo plano y consulta
`progress.json` para mostrar su avance.

Los grupos, datasets y modelos descargados son datos locales y no se distribuyen con
la version publica del repositorio.
