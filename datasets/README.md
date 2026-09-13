# Datasets

Los datasets utilizados durante este Trabajo de Fin de Grado no se distribuyen con
el repositorio porque contienen imagenes para las que no se ha documentado una
licencia que permita su redistribucion publica. El usuario debe obtener o crear sus
propias imagenes y asegurarse de que dispone de los permisos necesarios para usarlas.

La estructura minima esperada para cada dataset de entrenamiento es:

```text
datasets/
`-- <nombre_dataset>/
    `-- images/
        |-- imagen_001.png
        |-- imagen_001.txt
        |-- imagen_002.png
        |-- imagen_002.txt
        `-- captions.csv
```

Cada imagen debe tener un archivo `.txt` con el mismo nombre base y el caption que
se utilizara durante el entrenamiento. Cuando el dataset se exporta desde el flujo de
captioning de la interfaz, las imagenes se convierten a PNG, se preparan a 512x512 y
se genera tambien `captions.csv` como indice del conjunto.

La exportacion conserva la proporcion de la imagen mediante `fit: contain`, utiliza
nearest-neighbor para no mezclar los colores de los pixeles y completa el lienzo con
fondo blanco cuando es necesario.

## Datos recopilados por el scraper

El scraper puede crear varias recopilaciones independientes con esta estructura:

```text
datasets/pixilart/scrapes/<id>/
|-- scrape_run.json
|-- raw/
|   |-- images/
|   |-- metadata/
|   `-- logs/
|-- filtered/
|   |-- accepted/
|   |-- rejected/
|   |-- manual_accepted/
|   `-- metadata/
`-- reports/
```

Estas carpetas son material de trabajo previo, no datasets listos para entrenar. Las
imagenes aceptadas se seleccionan desde la seccion de captions y solo pasan al dataset
final despues de generar y revisar sus descripciones.

Los scripts para recopilar y preparar datos se conservan en `scripts/scrapers/` y
`scripts/tfg/`. La interfaz tambien permite crear datasets y exportar hacia ellos los
grupos de captions revisados.

Los nombres `iter_01`, `iter_02` o `iter_03` documentados en otros archivos pertenecen
a los experimentos originales del TFG. Un usuario puede emplear cualquier nombre de
dataset siempre que actualice la configuracion del entrenamiento.
