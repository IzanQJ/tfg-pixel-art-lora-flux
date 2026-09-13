# Datasets

Los datasets utilizados durante este Trabajo de Fin de Grado no se distribuyen con
el repositorio porque contienen imagenes para las que no se ha documentado una
licencia que permita su redistribucion publica. El usuario debe obtener o crear sus
propias imagenes y asegurarse de que dispone de los permisos necesarios para usarlas.

La estructura recomendada para cada dataset es:

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

Los scripts para recopilar y preparar datos se conservan en `scripts/scrapers/` y
`scripts/tfg/`. La interfaz tambien permite crear datasets y exportar hacia ellos los
grupos de captions revisados.
