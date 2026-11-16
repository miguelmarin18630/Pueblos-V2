# Informe: relieve incluido en la app (v50)

Fecha: 16 de noviembre de 2026 · Web v50.

## 1. Por qué

Hasta la v49 el relieve se pedía a **Open-Meteo** al arrancar. Si la red tardaba, la
cuota de peticiones estaba agotada o el móvil no tenía conexión, el primer panorama
fallaba y los pueblos se mostraban sin comprobar montañas («Sin datos de relieve»).

Igual que los pueblos (`data/pueblos.js`) y los picos (`data/picos.js`), el relieve
pasa a ser **un archivo más de la app**, descargado una vez y guardado en el móvil.

## 2. Qué se ha hecho

- **Archivo nuevo:** `data/relieve.bin` (3,63 MB).
- **Generador reproducible:** `tools/generar-relieve.py`.
- **Carga en segundo plano:** se pide 1,2 s después de arrancar, sin bloquear el
  primer dibujo. Mientras no llega, se sigue usando Open-Meteo como hasta ahora.
- **Sin cupo:** cuando el archivo está cargado, `altitudes()` lo usa primero y el
  panorama se construye con los **144 rayos cada 2,5°** (antes bajaba a 5° o 7,5°
  según el cupo disponible).
- **Recarga automática:** al terminar la descarga se borra el panorama calculado
  con la red y se rehace con el archivo (`pan=null`).
- **Limpieza única:** se borran las celdas `dem3:*` de IndexedDB que hubieran dejado
  las versiones anteriores (hasta 72 MB), con la marca `localStorage["relieveArchivo"]`.

## 3. Formato del archivo

```
4 bytes   largo de la cabecera (uint32 little-endian)
cabecera  JSON {"s":0.005,"b":[{"n":45,"w":-10,"r":2000,"c":3000}, ...]}
bytes     diferencias por filas en int16: primero los bytes bajos
bytes     y después los altos
todo      comprimido con zlib (en el móvil se abre con DecompressionStream)
```

Las alturas van en **metros** y cada bloque se lee sumando las diferencias de su
fila. Separar los bytes bajos y altos mejora la compresión (el archivo baja al 27 %
del tamaño sin comprimir).

## 4. Malla y cobertura

| Concepto | Valor |
|---|---|
| Paso de malla | 0,005° (~500 m de norte a sur) |
| Altura por celda | **máxima** (conserva crestas; no aplana cumbres) |
| Península y Baleares | 35–45° N, 10° O–5° E (2.000 × 3.000 celdas) |
| Canarias | 27–30° N, 19–13° O (600 × 1.200 celdas) |
| Celdas totales | 6.720.000 |
| Sin comprimir | 13,44 MB (lo que ocupa en memoria al abrirlo) |
| Archivo comprimido | 3,63 MB (27 %) |
| Pico de memoria al descomprimir | ~27 MB durante la carga |

Fuente: **Copernicus DEM GLO-90** (90 m), 122 teselas para la península y Baleares
y 12 para Canarias. Licencia y atribución en `data/LICENCIA-DATOS.md`.

## 5. Precisión medida

Comparación contra las alturas de los **42.920 picos** de `data/picos.js`:

| Medida | Celda | Bilineal (lo que ve la app) |
|---|---|---|
| Error medio | −2 m | −2 m |
| Error absoluto medio | 18 m | 20 m |
| p50 | 10 m | 15 m |
| p90 | 39 m | 43 m |
| p99 | 126 m | 105 m |
| Dentro de ±50 m | 93 % | 93 % |
| Dentro de ±100 m | 98 % | 98 % |
| Picos fuera de la malla | 0 | 0 |

Cumbres de control (celda): Teide 3.697 m (real 3.715), Mulhacén 3.460 (3.479),
Aneto 3.356 (3.404), Torre Cerredo 2.525 (2.648), Almanzor 2.244 (2.591), Madrid 684
(~650), mar 0.

Las diferencias grandes son de **resolución**, no de datum: una celda de ~500 m
suaviza la punta de una cresta o mezcla una ladera. Para decidir si una montaña tapa
un pueblo (distancias de kilómetros) el error es mucho menor que el tamaño angular
de la etiqueta.

## 6. Integración en el motor

- `cargarRelieve()` descarga y decodifica el archivo en segundo plano.
- `relieveListo()` rehace el panorama cuando termina y sube un contador de
  generación: un panorama empezado con la red no puede pisar después al calculado
  con el archivo, aunque termine más tarde.
- `altitudes()` consulta `DEMLOC` (el archivo) y solo cae a Open-Meteo si el punto
  está fuera de la malla (por ejemplo, fuera de España).
- `construirPano()` usa `libre=DEMLOC?1e9:...`: con archivo no hay límite de cupo.
- El service worker guarda `data/relieve.bin` en la caché **permanente** de datos.
  En la primera visita el SW puede estar instalándose todavía; el motor le pide
  «guardar-datos» en cuanto activa para que el archivo quede también sin conexión.
- `?v=50` en el HTML y `VERSION='v50'` en `sw.js`.

## 7. Pruebas

- `node tests/relieve.js`: formato, cobertura (11 puntos), cumbres, nivel del mar,
  comparación con los 42.920 picos e integración en el motor.
- `node tests/estatico.js`, `rumbo.js`, `vista.js`, `declinacion.js`,
  `calibracion.js`: siguen en verde.
- Prueba en Chrome real (servidor local): el archivo llega con HTTP 200 (3,63 MB),
  el panorama muestra «Relieve comprobado (relieve incluido, panorama)» y **no se
  hace ni una petición de altitud a Open-Meteo**. Sin errores de consola.

## 8. Cómo regenerarlo

```bat
pip install numpy rasterio
python tools/generar-relieve.py --validar
```

Las teselas de Copernicus se guardan en `tools/teselas_dem` (~450 MB, ignoradas por
git). Solo se sube `data/relieve.bin`. Si se quiere repetir la descarga desde cero,
basta con borrar esa carpeta.
