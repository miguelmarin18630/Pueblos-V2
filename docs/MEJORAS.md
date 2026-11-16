# Análisis del `index.html` original y mejoras aplicadas

Este documento resume el trabajo hecho sobre la app **¿Qué pueblo es?** (repositorio
`Pueblos-V2`). Se parte del `index.html` que estaba en la carpeta `Pueblos/` y se compara
con la versión modular de `Quepuebloes/`.

---

## 1. Estado del archivo analizado

`Pueblos/index.html` era la **versión autocontenida** de la app:

| Aspecto | Situación |
|---|---|
| Tamaño | 707 líneas en un solo archivo |
| CSS | ~235 líneas dentro de `<style>` |
| JavaScript | Todo el motor dentro de `<script>` |
| Datos | Bloque `#datosPueblos` embebido en el HTML (texto plano) |
| PWA | Referenciaba `manifest.json` **que no existía** |
| Service worker | **No había** (`sw.js` inexistente) |
| Iconos | Solo `icon.png` |
| Proveedores de relieve | Open-Meteo **y** OpenTopoData (sin CORS) |

### Problemas detectados

1. **Referencias rotas**: el manifiesto PWA apuntaba a `manifest.json`, que no existía en
   esa carpeta, así que la app no se podía instalar.
2. **Sin funcionamiento offline**: no había service worker.
3. **Un solo archivo gigante**: cualquier cambio obligaba a editar 707 líneas mezclando
   estilos, datos y lógica. Sin caché selectiva: el navegador revalidaba todo.
4. **Datos y código acoplados**: los pueblos iban dentro del HTML, imposible de regenerar
   o de actualizar sin tocar la lógica.
5. **Respaldo de relieve inválido**: se intentaba usar OpenTopoData, cuya API no envía
   cabeceras CORS; el navegador bloqueaba la petición y solo quedaba Open-Meteo.
6. **CSS duplicado y con erratas** en la versión previa de la refactorización.
7. **Arranque sin feedback**: la portada no explicaba el estado de carga ni los permisos.

---

## 2. Mejoras aplicadas

### 2.1 Arquitectura modular

| Antes | Después |
|---|---|
| 1 archivo (707 líneas) | `index.html` + 4 hojas CSS + `app.js` + 2 archivos de datos |
| CSS y JS en línea | Archivos separados, cacheables por el navegador |
| Datos embebidos en el HTML | `data/pueblos.js` y `data/picos.js` |

Ventajas reales: el navegador cachea `pueblos.js` (4,2 MB) y `picos.js` (1,8 MB) por
separado del HTML; al cambiar solo la interfaz no se vuelven a descargar los datos.

### 2.2 PWA completa

- `manifest.json` con iconos 180/192/512 y versión *maskable*.
- `sw.js` que precarga la app y sirve **caché primero** para los recursos propios,
  **red primero** para la navegación y deja pasar las APIs externas a la red.
- `.nojekyll` para que GitHub Pages no procese los archivos con Jekyll.

Con esto la app es **instalable** y abre **sin conexión** tras la primera visita.

### 2.3 Carga diferida de picos

`data/picos.js` (1,8 MB) **no se descarga** hasta que se pulsa **Picos**. La portada carga
solo lo imprescindible.

### 2.4 Relieve más robusto

- OpenTopoData eliminado; **Open-Meteo es el único proveedor remoto**.
- Presupuesto local de **520 puntos/minuto** con ventana deslizante de 60 s.
- Panorama **adaptativo** (2,5° → 5° → 7,5°) según el cupo disponible.
- Reserva de puntos para las altitudes de las etiquetas.
- Caché de relieve en **IndexedDB** por celdas, para no repetir peticiones.
- Reintentos automáticos y aviso claro cuando se agota el cupo.

### 2.5 Accesibilidad y arranque

- Etiquetas `aria-*`, `role` y `aria-live` en estados y diálogos.
- Botón de inicio con `aria-busy` mientras se cargan los datos.
- Avisos legibles antes de pedir los permisos de cámara, GPS y brújula.

### 2.6 Precisión de la mira

Cuatro cambios, medidos con `tests/rumbo.js` (extrae el código real de `app.js` y lo
ejecuta con un sensor simulado):

| Pieza | Antes | Ahora | Medición |
|---|---|---|---|
| Suavizado del rumbo | EMA fija α 0,2 | One-Euro (1,5 Hz, β 0,10) | temblor parado 0,68° → **0,11°**; retraso a 90°/s 5,8° → **1,5°** |
| Saltos del sensor | se aceptaban | se descarta el salto aislado de más de 15° salvo que la muestra siguiente lo confirme | +25° aislado: **0,00°** de desvío |
| Margen de la mira | 3° fijos | 1,5–3° según el error que declara la brújula | ±2° → 1,5°; ±6° → 2,5°; sin dato → 3° |
| Orden de candidatos | `d + 0,04·km` | `cmpMira`: manda el ángulo, la distancia desempata dentro de 0,25° | a 0,2° y 39 km gana a 0,4° y 1,5 km |
| Picos | ±3° en horizontal, gana el más alto | campo vertical real y gana el más centrado en pantalla | una cumbre a 30° de altura ya no gana a la que está en la mira |

El One-Euro sube la frecuencia de corte con la velocidad del giro, así que no hay que
elegir entre temblor y retraso. La elección de picos usa la altura aparente con la misma
corrección de curvatura que las etiquetas (`e − H0 − d²/14,6·10⁶`), de modo que gana el
pico más cercano al centro de la pantalla, no el que menos se desvía en horizontal. En
modo picos se puede apuntar hasta 55° por encima del horizonte (antes 30°), porque una
cumbre cercana se sale de ese límite.

---

## 3. Qué se ha modificado en este repositorio

- `index.html`: versión limpia y modular (sin CSS ni JS en línea), con metadatos de
  compartida (`og:*`, `twitter:*`), `canonical`, `robots`, `preconnect` a Open-Meteo y
  `preload` de `data/pueblos.js`.
- `styles/`: cuatro hojas coherentes (`base`, `portada`, `layout`, `camera`).
- `scripts/app.js`: motor completo como script clásico (compatible con `file://`).
- `data/`: localidades y picos extraídos del bloque embebido, con las coordenadas
  redondeadas a 5 decimales (ver 3.1).
- `manifest.json`, `sw.js`, `icons/`, `icon.png`: PWA e instalación.
- `og-image.png`: tarjeta 1200×630 para previsualizaciones al compartir el enlace.
- `robots.txt`, `sitemap.xml`, `.nojekyll`: publicación e indexación.
- `README.md` y este documento.

El `index.html` original de 707 líneas se conserva **fuera del repositorio**, en la
carpeta de copia de seguridad `Pueblos_backup/`, por si hay que comparar o revertir.

### 3.1 Peso de la primera carga (medido sobre GitHub Pages, gzip)

GitHub Pages ya sirve los archivos con gzip, así que minificar «a mano» apenas aporta:
lo que cuesta son los dígitos de las coordenadas, que no se comprimen.

| Recurso | Antes | Ahora | gzip ahora |
|---|---|---|---|
| `data/pueblos.js` | 4.141 KB | 3.740 KB | **1.181 KB** (antes 1.414 KB) |
| `data/picos.js` (bajo demanda) | 1.818 KB | 1.641 KB | **656 KB** (antes 760 KB) |
| `scripts/app.js` | 102 KB | 102 KB | 36 KB |
| CSS (4 hojas) | 33 KB | 33 KB | 8 KB |
| `index.html` | 22 KB | 23 KB | 6 KB |

Redondear las coordenadas a 5 decimales son ~1,1 m de error máximo real (medido:
0,56 m en latitud y 0,41 m en longitud), muy por debajo del error de la brújula
(grados, cientos de metros a varios km). Se verificó que **no se pierde ninguna
entrada**: 97.129 localidades y 42.920 picos antes y después, con los mismos nombres.

Primera carga total: **~1,23 MB gzip** (antes ~1,46 MB).

---

## 4. Pendiente / posibles mejoras futuras

Resuelto en la **v43**:

- **Declinación magnética**: se aplica el modelo **WMM2025** de la NOAA sin conexión
  (`tests/declinacion.js` lo compara con valores de referencia). Las calibraciones
  guardadas por versiones anteriores se migran una vez para no contarla dos veces.
- **Campo de visión**: ajustable en **Calibrar → Campo de visión** (45–95°, guardado en
  el móvil). El valor por defecto sigue siendo 69,4°.
- **Pruebas de visibilidad con relieve**: `tests/vista.js` construye un panorama
  sintético y comprueba crestas que tapan o dejan ver un pueblo, y el caso sin altura.
- **Nombres largos de pico**: se cortan por palabra completa en la etiqueta; el nombre
  entero sigue en el panel y en el toque.
- **Chip de calibración en Android**: ya no se queda en «Calibración …»; pasa a
  «Sin calibrar» en ámbar en cuanto hay datos de brújula.

Resuelto en la **v50**:

- **Relieve empaquetado en un archivo** (`data/relieve.bin`, 3,63 MB): malla de todo
  el país a 0,005° (~500 m), generada con `tools/generar-relieve.py` a partir del
  Copernicus DEM GLO-90 y comprimida con `DecompressionStream`. Se descarga en
  segundo plano, no bloquea el primer dibujo y sustituye a las consultas a
  Open-Meteo (que quedan solo como apoyo si el archivo no está). Con el archivo, el
  panorama usa los 144 rayos cada 2,5° sin depender del cupo de Open-Meteo.

Sigue pendiente:

- Codificar los pueblos por delta de coordenadas en rejilla (más ganancia que minificar).
- Relieve más fino cerca: bajar de un rayo cada 2,5° a uno cada 1° en los primeros
  kilómetros, ahora que las alturas salen del archivo y no de la red.

