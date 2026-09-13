# Configuraciones historicas

Esta carpeta conserva configuraciones utilizadas durante el desarrollo experimental
del TFG. Se incluyen para documentar decisiones y cambios entre iteraciones, pero no
representan necesariamente la configuracion activa del proyecto.

Las rutas de datasets, modelos previos y carpetas de salida pueden corresponder al
entorno original de las pruebas. Deben revisarse y adaptarse antes de ejecutar estas
configuraciones en otro equipo.

- `train_lora_pixelart_tfg.yaml` conserva una configuracion inicial que esperaba el
  antiguo dataset `datasets/pixel_art`.
- `iter_03_Arreglo_train.yaml` documenta la configuracion corregida de la tercera
  iteracion y hace referencia a `datasets/iter_03_2`, que no se distribuye.

Las configuraciones activas de las dos primeras iteraciones permanecen en el directorio
`config/`. Los jobs creados desde la interfaz se conservan localmente en SQLite y en
los archivos operativos de su carpeta de salida.
