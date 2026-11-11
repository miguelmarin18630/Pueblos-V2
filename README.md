# ¿Qué pueblo es?

Apunta con el móvil al horizonte y la app te dice **qué pueblo o pico tienes delante**,
poniendo los nombres sobre la imagen de la cámara. Funciona en el navegador y se puede
instalar como aplicación (PWA) en Android e iPhone.

**Demo:** https://pueblos.marinweb.org/

---

## Aplicación Android (APK)

**[Descargar Pueblos-V2-1.6.1.apk](https://github.com/miguelmarin18630/Pueblos-V2/releases/download/v1.6.1/Pueblos-V2-1.6.1.apk)**
(2,08 MB · Android 7.0 o superior)

El APK es una **Trusted Web Activity**: abre la misma PWA con Chrome a pantalla
completa, así que la cámara, el GPS y la brújula se comportan igual que en el navegador.
Para instalar, descarga el archivo en el móvil y permite la instalación desde esa fuente
cuando Android lo pregunte.

- Paquete: `io.github.laotra18630cmd.pueblos` · versión 1.6.1 (código 8)
- La ubicación va **delegada a la app**: el permiso se pide con el diálogo de Android
  (como en la app antigua), no con el permiso por sitio de Chrome. El aviso de ubicación
  incluye un botón que abre los ajustes del móvil (`pueblos://ajustes`).
- Se compila con Bubblewrap a partir del manifest de la PWA. El proyecto Android
  (keystore incluido) está en `C:\apppueblos\03_PROYECTO_ANDROID\Pueblos-Android`.
- Chrome comprueba la firma con
  <https://pueblos.marinweb.org/.well-known/assetlinks.json>, que se publica desde
  el repositorio raíz `miguelmarin18630.github.io`. Sin ese archivo la app abriría con la
  barra de direcciones del navegador.

---

## Cómo abrirla en local

La cámara, el GPS, la brújula y el service worker **solo funcionan en `https://` o en
`http://localhost`**. Abrir el archivo con doble clic (`file://`) carga los pueblos, pero
no podrás activar la cámara ni el GPS.

Desde esta carpeta:

```powershell
python -m http.server 8765
```

Y abre <http://localhost:8765/> en el ordenador, o en el móvil usando la IP del PC en la
misma wifi:

```powershell
ipconfig
# luego, en el móvil: http://192.168.x.x:8765/
```

No hay que compilar nada: son HTML, CSS y JavaScript normales.

---

## Estructura

```
index.html                 Portada, panel, cámara, diálogos y controles
manifest.json              Datos de instalación de la PWA
sw.js                      Service worker: app y datos disponibles sin conexión
og-image.png               Tarjeta 1200×630 para previsualizar el enlace al compartirlo
robots.txt, sitemap.xml    Indexación
.nojekyll                  Evita el procesado Jekyll de GitHub Pages
icon.png                   Icono suelto
icons/                     Iconos 180/192/512 y maskable
styles/base.css            Variables, tipografía, botones y utilidades
styles/portada.css         Portada y pantalla de carga
styles/layout.css          Panel, barra de controles, menús y diálogos
styles/camera.css          Vídeo, etiquetas, mira, silueta y leyenda
scripts/app.js             Motor completo (geometría, cámara, brújula, relieve…)
data/pueblos.js            Localidades de España (window.DATOS_PUEBLOS)
data/picos.js              Picos de España (window.DATOS_PICOS, se carga al activar Picos)
```

Los datos se cargan como scripts (`window.DATOS_PUEBLOS`) y no con `fetch`, para que la
app funcione también desde disco. `data/picos.js` no se descarga hasta que se pulsa
**Picos**, así la primera carga es más ligera.

---

## Cómo se usa

1. Pulsa **Iniciar identificación** y acepta cámara, ubicación y brújula.
2. Pon el móvil en vertical y apunta al horizonte. El nombre grande es el pueblo bajo la
   mira; las etiquetas indican distancia y margen de error.
3. **Calibrar** abre cinco métodos (lugar conocido, andando, dibujar un 8, horizonte y
   ajustes automáticos).
4. **Solo pueblos / Con aldeas**, **Picos**, **Más lejos** (40/80 km) y **Relieve**
   cambian lo que se muestra. Los tres filtros son excluyentes, y al activar una
   búsqueda se ajustan solos al tipo de lo buscado.
5. **Terminar** apaga cámara, GPS y brújula.

En iPhone, el botón de instalar es *Compartir → Añadir a pantalla de inicio*. La app
necesita HTTPS para la cámara y para que el service worker funcione.

---

## Publicación (GitHub Pages)

El repositorio ya está preparado para servirse desde la **raíz** de la rama `main`:

1. **Settings → Pages**
2. *Source*: **Deploy from a branch**
3. *Branch*: `main` · carpeta `/` (root)
4. Guardar y esperar 1–2 minutos.

La app queda en `https://pueblos.marinweb.org/` (lo indica el archivo `CNAME`).

El archivo `.nojekyll` está incluido para que GitHub no procese los archivos con Jekyll.

> Para probar en el móvil con cámara hace falta HTTPS (o `localhost`), por eso GitHub
> Pages es la forma más sencilla.

---

## Rendimiento

GitHub Pages sirve todo con gzip, así que la primera carga es de **~1,23 MB**:

| Recurso | gzip |
|---|---|
| `data/pueblos.js` | 1.181 KB |
| `scripts/app.js` | 36 KB |
| CSS (4 hojas) | 8 KB |
| `index.html` | 6 KB |

Las coordenadas de `data/` van redondeadas a 5 decimales (~1 m de error máximo, medido
0,6 m), lo que ahorra ~340 KB sin cambiar ninguna entrada ni ningún nombre. `picos.js`
(656 KB gzip) solo se descarga al pulsar **Picos**. Desde la segunda visita todo sale de
la caché del service worker, sin red.

---

## Precisión

Tres cosas deciden qué sale bajo la mira, y las tres se pueden medir:

| Pieza | Antes | Ahora |
|---|---|---|
| Suavizado del rumbo | media móvil fija (α 0,2): 0,68° de temblor parado y **5,8° de retraso a 90°/s** | filtro One-Euro (1,5 Hz + 0,10·velocidad): **0,11°** y **1,5°** |
| Margen de la mira | 3° fijos | **1,5–3°** según el error que declara la brújula (`webkitCompassAccuracy`) |
| Orden de candidatos | ángulo + 0,04° por km (podía ganar el de al lado) | **solo ángulo**; la distancia desempata dentro de 0,25° |
| Picos | ±3° en horizontal, gana el más alto | **campo vertical real** (altura aparente con curvatura) y gana el más centrado en pantalla |

El filtro One-Euro sube su frecuencia de corte cuando detecta giro de verdad y la baja
cuando estás parado; además descarta un salto aislado de más de 15° salvo que la muestra
siguiente lo confirme, así una interferencia magnética no arrastra el rumbo. Los valores
están medidos con `tests/rumbo.js`, que extrae el `setH()` y el `picoMira()` reales de
`scripts/app.js` y los ejecuta con un sensor simulado.

Lo que **no** se puede arreglar solo con el rumbo: dos pueblos exactamente en la misma
línea de visión (uno a 20 km y otro a 40 km) son indistinguibles por ángulo. Para eso hace
falta la vertical (altura aparente) o que el relieve ocluya uno de los dos.

---

## Relieve y límites de Open-Meteo

El relieve se consulta a **Open-Meteo** (`api.open-meteo.com/v1/elevation`), el único
proveedor remoto: OpenTopoData se descartó porque su API no envía cabeceras CORS.

- Presupuesto local de **520 puntos/minuto** (el servicio permite 600) con ventana
  deslizante de 60 s.
- El panorama es **adaptativo**: elige la resolución angular más fina que quepa en el cupo
  (2,5° → 5° → 7,5°).
- Se reservan puntos para las altitudes de las etiquetas.
- El relieve descargado se guarda por celdas en **IndexedDB**, así al volver a la misma
  zona no se piden puntos otra vez.
- Si se agota el cupo, la app lo avisa y sigue funcionando **sin relieve**; se recupera sola.

Open-Meteo es gratuito para uso no comercial. Límites por IP: 600 peticiones/minuto y
5.000/hora (cada coordenada cuenta como una petición).

---

## Pruebas

Tres niveles. Los dos primeros no necesitan instalar nada:

```powershell
node tests/estatico.js
node tests/rumbo.js
```

`estatico.js` comprueba el manifiesto, que todas las referencias locales existan, que no
haya ids duplicados ni CSS/JS en línea, que el service worker solo precargue archivos
reales y que los datos conserven el formato y el número de entradas.

`rumbo.js` extrae `setH()`, `tolMira()`, `cmpMira()` y `picoMira()` del propio
`scripts/app.js` y los ejecuta con un sensor simulado: ruido, giros, picos de
interferencia, huecos de eventos, cruce del norte, tolerancias y el caso de una cumbre
cercana muy alta frente a otra lejana en la mira.

Los dos se ejecutan en cada push (`.github/workflows/validar.yml`).

```powershell
npm install puppeteer-core
python -m http.server 8765
node tests/humo.js http://localhost:8765/
```

Abre la app en Chrome/Edge con una pantalla de 390×844 y verifica que arranca **sin
errores de consola**, que carga las 86.359 localidades, que el botón de inicio se habilita
y que no hay desbordamiento horizontal.

---

## Créditos

- Pueblos y picos: © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright),
  bajo licencia ODbL.
- Relieve: [Open-Meteo](https://open-meteo.com/).
- Autor: Miguel Marín.
