# Informe: comportamiento de las etiquetas y correcciones (v39)

Fecha: 14 nov 2026 · App: ¿Qué pueblo es? · Web/PWA `pueblos.marinweb.org`
Dispositivo observado: Samsung SM-A536B (Galaxy A53 5G), app instalada en Chrome.

---

## 1. Qué se ha hecho

- Se ha conectado el móvil por **ADB** y se ha enganchado el navegador interno por **Chrome DevTools**, de modo que además de la pantalla se leían las etiquetas reales (texto, posición, selección, botones y avisos).
- Se grabó una sesión de **20 minutos** de uso real y una segunda sesión de pruebas con picos.
- Se han corregido los fallos de etiquetas en `scripts/app.js` y `styles/camera.css`.
- Se ha subido la versión a **v39** (`index.html` y `sw.js`).
- Se ha probado la corrección en Chrome de escritorio con viewport de móvil (384×774), la posición real del móvil (37,0890, −3,6255, 843 m), cámara simulada y orientación simulada.

---

## 2. Qué se vio en la sesión real

### 2.1. Pueblos (15:19–15:22)

- Apuntando al norte desde el sur de Granada: la mira pasó por **Granada → Pulianillas → Urbanización La Joya → Maracena → Pulianas → Jun**.
- La etiqueta seleccionada cambiaba con el temblor de la brújula y el margen ± oscilaba entre **0,0° y 3,0°**.
- La **leyenda lateral** se montaba encima de etiquetas que caían en el borde izquierdo (Maracena, Peligros).
- Varias etiquetas quedaban pegadas al borde sin línea al punto cuando el punto se salía de pantalla.

![Pueblos: etiqueta seleccionada y leyenda encima](capturas/01-pueblos.jpg)

![Pueblos: giro y etiquetas apiladas](capturas/02-pueblos-giro.jpg)

### 2.2. Picos (16:17–16:22)

- A las **16:17:30** se pulsa **⛰ Picos**: se cargan **2.477 picos** y se apaga «Solo pueblos» (los filtros son excluyentes).
- La mira salta entre picos casi alineados: **112 cambios de pico en 2,5 min** y **44 cambios en 45 s**.
- El pico que nombre el panel grande **no tiene etiqueta visible**: le pasó a *Cerro del Chapa*, *Loma del Juncarón*, *Cerro de la Cruz*, *Cerro de las Pedrizas*, *Cerro de los Prados*…
- Al tocar una etiqueta de pico, el **bocadillo amarillo duplica** la etiqueta que ya está dibujada y tapa las de al lado.
- El **botón de plegar (▲)** se dibuja encima de etiquetas (p. ej. «Cerro de las Caracolas» y «Cerro de la Cobertera»).
- Las etiquetas de pico son muy anchas: *Cerro del Calar del Marchante* llegó a **333 px de 384**.

![Picos: el panel nombra Cerro del Chapa, pero no hay etiqueta seleccionada; el botón ▲ tapa una etiqueta](capturas/03-picos-sin-etiqueta-seleccionada.jpg)

![Bocadillo que duplica la etiqueta y tapa las vecinas](capturas/04-picos-bocadillo-duplicado.jpg)

![Bocadillo encima de varias etiquetas](capturas/05-picos-bocadillo-solapa.jpg)

### 2.3. Otras observaciones

- La calibración se quedó en **«Calibración…»** todo el tiempo, aunque la brújula marcaba ✓. No se ha tocado: depende de la precisión real del sensor y del entorno; conviene revisarlo aparte.
- Entre las 15:22 y las 16:13 el móvil estuvo boca arriba (inclinación −89°); la app mostró correctamente «Apunta hacia el horizonte…» y no dibujó etiquetas.

---

## 3. Correcciones aplicadas

### 3.1. El pico de la mira se dibuja y se resalta

`picoMira()` calcula el pico; ahora `pintar()` se lo pasa a `etiquetas(pe, hdc, pm)`. En el bucle de picos:

- el pico seleccionado se ordena **primero** y se dibuja **aunque no quepa** en el reparto normal;
- si su proyección cae detrás del panel o fuera por abajo, **su nombre se recoloca** para que se vea;
- se marca con `sel`: la etiqueta se rellena de verde y el triángulo se resalta (`.pk.sel`).

### 3.2. Histéresis de la selección

`picoMira()` guarda el pico elegido. Si otro pico está algo más centrado, **no cambia** hasta que pasen **2,5 s** o hasta que la diferencia sea mayor de **0,8°**. Así el panel y la etiqueta dejan de parpadear con el temblor normal de la brújula.

### 3.3. El toque sobre un pico ya dibujado no duplica el bocadillo

- Si la etiqueta del pico tocado ya está en pantalla, se **resalta** (nuevo `tapPico`) y se oculta el bocadillo.
- Si la etiqueta no estaba dibujada, se mantiene el bocadillo como respaldo.
- El resaltado se apaga solo a los 6 s.

### 3.4. Las etiquetas ya no se meten debajo de la interfaz

Antes de repartir etiquetas se añaden como zonas ocupadas:

- la pestaña **▲ de plegar**, que sobresale del panel;
- la **leyenda lateral** (`#leyenda`), que además crece cuando hay ciudad + pueblo.

### 3.5. Separación entre etiquetas

El apilado vertical pasa de **34 a 36 px**, de modo que dos etiquetas consecutivas de 32 px de alto dejan 4 px de aire y no se tocan.

### 3.6. Etiqueta de pico seleccionada sin desbordar

La etiqueta de pico conserva 15 px también cuando está seleccionada (`.et.pico`), para que un nombre largo no se salga de la pantalla al crecer a 18 px como las de pueblo.

### 3.7. Pruebas

- `tests/rumbo.js` y `tests/vista.js` no arrancaban: les faltaban `pitF`, `pkSel`, `pkSelT` y un `estabilizar()` simulado. Se han completado.
- Se ha añadido una prueba de la histéresis y otra del cambio a los 3 s.
- `tests/estatico.js` valida ahora la versión **v39** y el cache-bust unificado.

---

## 4. Verificación

| Comprobación | Antes (v38 real) | Después (v39) |
|---|---|---|
| Pico de la mira con etiqueta visible | No (solo en el panel) | **Sí, resaltado** |
| Cambios de pico con temblor | 112 en 2,5 min | **0 en 4,8 s con ±0,3°** |
| Etiquetas bajo el botón ▲ | Sí | **0 solapes** |
| Etiquetas bajo la leyenda | Sí | **0 solapes** |
| Etiquetas entre sí | Se tocaban | **0 solapes** (paso 36 px) |
| Toque en pico ya dibujado | Duplicaba bocadillo | **Resalta, sin bocadillo** |
| Pruebas `estatico`, `rumbo`, `vista` | — | **Todo correcto** |

La verificación visual se hizo con el código corregido en Chrome, a 384×774, con la posición real del móvil, cámara simulada y orientación simulada. Las capturas «después» son de esa prueba.

![Después: el pico seleccionado (Cerro de los Prados) tiene etiqueta verde visible y no hay solapes](capturas/07-despues-pico-seleccionado-visible.png)

![Después: pueblos, etiqueta seleccionada visible y sin solapes](capturas/08-despues-pueblos.png)

### Comparativa del solape corregido

Antes, la etiqueta seleccionada y la siguiente se tocaban:

![Antes: la etiqueta seleccionada y Cerro Moreno se tocan](capturas/06-antes-solape-etiquetas.png)

---

## 5. Archivos tocados

- `scripts/app.js`
  - `picoMira()`: histéresis.
  - `etiquetas(pe, hdc, pm)`: pico seleccionado, obstáculos, paso 36, `sel` en picos.
  - `identificarToque()` / `finToque()`: resaltado del pico tocado sin bocadillo duplicado.
  - `pintar()`: pasa `pm` a `etiquetas`.
- `styles/camera.css`
  - `.et.pico`, `.et.pico.sel`: tamaño estable.
  - `.pk.sel`: triángulo resaltado.
- `tests/rumbo.js`, `tests/vista.js`: stubs y prueba de histéresis.
- `index.html`, `sw.js`: versión **v39**.

---

## 6. Cómo probarlo

1. Publicar la v39 (GitHub Pages) o abrir la copia local servida por HTTP.
2. En el móvil, entrar y activar **Picos**.
3. Comprobar que el pico del panel grande tiene su etiqueta verde rellena en pantalla.
4. Mover el móvil despacio: el panel debe mantenerse estable y no saltar entre picos casi alineados.
5. Tocar una etiqueta de pico: debe resaltarse, sin abrir un bocadillo que la duplique.
6. Comprobar que ninguna etiqueta queda debajo del botón ▲ ni de la leyenda.

## 7. Pendiente

- **Publicar** la v39 (commit + push a GitHub) para que llegue al móvil.
- Revisar por separado por qué la calibración se queda en «Calibración…» en interiores.
- Valorar acortar nombres de pico muy largos (o partir altura/distancia en dos líneas) para que no ocupen casi todo el ancho.
