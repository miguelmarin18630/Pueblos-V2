# Licencia de los datos de pueblos y picos

Los archivos `pueblos.js` y `picos.js` de esta carpeta son una **base de datos
derivada** de OpenStreetMap, limitada a España.

## Atribución

© colaboradores de OpenStreetMap.

Descarga de OpenStreetMap: **noviembre de 2026**.

Los datos de OpenStreetMap están disponibles bajo la
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Más información: <https://www.openstreetmap.org/copyright>

## Cambios realizados

- Extracción limitada a España.
- Solo localidades con nombre (`place=city`, `town`, `village`, `hamlet`,
  `isolated_dwelling` o `locality`) y picos con nombre (`natural=peak`).
- Coordenadas redondeadas a 5 decimales (unos 1 m).
- Conversión al formato propio de la app: `lat|lon|nombre|tipo` para localidades
  y `lat|lon|nombre|altura` para picos.

## Cómo obtener esta base de datos

Los archivos completos están publicados en:

- <https://pueblos.marinweb.org/data/pueblos.js>
- <https://pueblos.marinweb.org/data/picos.js>
- Repositorio: <https://github.com/miguelmarin18630/Pueblos-V2/tree/main/data>

Se ofrecen bajo la misma licencia ODbL 1.0. Si redistribuyes estos archivos o una
versión modificada, debes mantener la atribución a OpenStreetMap y la licencia
ODbL.

## Sin garantía

Los datos se ofrecen tal cual, sin garantía de exactitud ni de disponibilidad.
