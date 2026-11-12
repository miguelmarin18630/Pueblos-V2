#!/usr/bin/env node
/* Comprobaciones estáticas del proyecto, sin dependencias.
   Uso:  node tests/estatico.js
   - Valida manifest.json e index.html
   - Comprueba que todas las referencias locales existen
   - Comprueba que el service worker solo precarga archivos reales
   - Valida los datos (número de entradas y formato de cada línea)
   Sale con código 1 si algo falla, para poder usarlo en CI. */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const fallos = [];
const ok = (msg) => console.log('  OK   ' + msg);
const mal = (msg) => { console.log('  FALLO ' + msg); fallos.push(msg); };

function leer(rel) {
  return fs.readFileSync(path.join(raiz, rel), 'utf8');
}
function existe(rel) {
  return fs.existsSync(path.join(raiz, rel));
}

// ---------- manifest.json ----------
console.log('\nmanifest.json');
let man;
try {
  man = JSON.parse(leer('manifest.json'));
  ok('JSON válido');
} catch (e) {
  mal('JSON inválido: ' + e.message);
}
if (man) {
  for (const campo of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color']) {
    if (man[campo]) ok('campo ' + campo + ' = ' + man[campo]);
    else mal('falta el campo ' + campo);
  }
  const iconos = (man.icons || []).concat(man.screenshots || []);
  if (!iconos.length) mal('no hay iconos');
  for (const i of iconos) {
    if (existe(i.src)) ok('recurso ' + i.src + ' (' + i.sizes + ')');
    else mal('no existe ' + i.src);
  }
  if (!(man.icons || []).some((i) => i.purpose === 'maskable')) mal('falta un icono maskable');
}

// ---------- index.html ----------
console.log('\nindex.html');
const html = leer('index.html');
const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)]
  .map((m) => m[1])
  .filter((r) => !r.startsWith('http') && !r.startsWith('//'));
for (const r of refs) {
  // Se quitan la query y el hash: las hojas llevan ?v=19 para cache-bust
  const ruta = r.split(/[?#]/)[0];
  if (existe(ruta)) ok('referencia ' + r);
  else mal('referencia rota: ' + r);
}
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
if (dup.length) mal('ids duplicados: ' + dup.join(', '));
else ok(ids.length + ' ids, sin duplicados');

if (/<style[^>]*>[\s\S]{200,}/.test(html)) mal('hay CSS en línea (debería estar en styles/)');
else ok('sin CSS en línea');
// El vigilante del arranque vive en un <script> inline a propósito (debe estar en el HTML)
const htmlParaScript = html.replace(/<script>[\s\S]*?<\/script>/gi, '');
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]{200,}/i.test(htmlParaScript)) mal('hay JavaScript en línea (debería estar en scripts/)');
else ok('sin JavaScript en línea (el vigilante del arranque está permitido)');

const og = /og:image" content="([^"]+)"/.exec(html);
if (og) ok('og:image = ' + og[1]);
else mal('falta og:image');
if (/rel="canonical"/.test(html)) ok('canonical presente');
else mal('falta canonical');

// ---------- sw.js ----------
console.log('\nsw.js');
const sw = leer('sw.js');
const version = /VERSION = '([^']+)'/.exec(sw);
if (version) ok('VERSION = ' + version[1]);
else mal('no se encuentra VERSION');
const core = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
for (const r of core) {
  const ruta = r.split(/[?#]/)[0];
  if (existe(ruta)) ok('CORE ' + r);
  else mal('CORE apunta a un archivo inexistente: ' + r);
}

// ---------- datos ----------
for (const [archivo, variable, minimo] of [
  ['data/pueblos.js', 'DATOS_PUEBLOS', 80000],
  ['data/picos.js', 'DATOS_PICOS', 30000],
]) {
  console.log('\n' + archivo);
  const w = {};
  try {
    new Function('window', leer(archivo))(w);
  } catch (e) {
    mal('no se puede evaluar: ' + e.message);
    continue;
  }
  const txt = w[variable];
  if (typeof txt !== 'string' || !txt) { mal('no define window.' + variable); continue; }
  const lineas = txt.split('\n');
  let malas = 0;
  for (const l of lineas) {
    const c = l.split('|');
    if (c.length < 4 || !isFinite(parseFloat(c[0])) || !isFinite(parseFloat(c[1]))) malas++;
  }
  if (lineas.length < minimo) mal('solo ' + lineas.length + ' entradas (se esperaban más de ' + minimo + ')');
  else ok(lineas.length + ' entradas');
  if (malas) mal(malas + ' líneas con formato inválido');
  else ok('todas las líneas tienen formato lat|lon|nombre|tipo');
}

// ---------- ubicación y salidas de emergencia ----------
console.log('\nubicación');
const app = leer('scripts/app.js');
for (const id of ['ubicaReintentar', 'ubicaRecargar', 'ubicaAjustes', 'ubicaUltima', 'ubicaPueblo', 'ubicaCerrar']) {
  if (!new RegExp('id="' + id + '"').test(html)) mal('falta el botón #' + id + ' en index.html');
  else ok('botón #' + id);
  if (!app.includes('$("' + id + '").onclick')) mal('sin manejador para #' + id);
  else ok('manejador #' + id);
}
const guardados = (app.match(/guardarPosUbic\(/g) || []).length;
if (guardados >= 6) ok('la posición se guarda en ' + (guardados - 1) + ' puntos');
else mal('guardarPosUbic solo aparece ' + guardados + ' veces (se esperan definición + 5 usos)');
const asigna = (app.match(/ultimaPos\s*=\s*(?:pos|P0)/g) || []).length;
if (asigna >= 5) ok(asigna + ' asignaciones de ultimaPos');
else mal('solo ' + asigna + ' asignaciones de ultimaPos (se esperaban 5)');
if (/function posGuardada\(/.test(app) && /function usarPuebloComoUbic\(/.test(app) && /buscarModoUbic/.test(app)) {
  ok('última ubicación y «elegir mi pueblo» disponibles');
} else mal('faltan las salidas de emergencia de ubicación');

// ---------- filtros: Picos / Solo pueblos / Con aldeas ----------
console.log('\nfiltros');
for (const id of ['picosb', 'soloPueblos', 'conAldeas']) {
  if (!new RegExp('id="' + id + '"').test(html)) mal('falta el botón #' + id + ' en index.html');
  else ok('botón #' + id);
}
if (/function fijarPicos\(/.test(app)) ok('función fijarPicos');
else mal('falta fijarPicos: el estado de «Picos» no se puede coordinar');
if (/function filtroSegunTipo\(/.test(app)) ok('función filtroSegunTipo');
else mal('falta filtroSegunTipo: la búsqueda no ajusta los filtros');
const soloM = /\.onclick\s*=\s*function\s*\(\)\s*\{\s*fijarPicos\(false\)/.test(app);
const aldeaM = /fijarPicos\(false\);[\s\S]{0,120}verAldeas=true/.test(app);
if (soloM && aldeaM) ok('«Solo pueblos» y «Con aldeas» apagan «Picos»');
else mal('los botones de pueblo no apagan «Picos» directamente');
if (/if\s*\(\s*verPicos\s*\)\s*return/.test(app)) mal('los filtros de pueblo siguen bloqueados con «Picos» encendido');
else ok('los filtros de pueblo nunca se bloquean');
if (/disabled\s*=\s*verPicos/.test(app)) mal('«Solo pueblos»/«Con aldeas» se deshabilitan con «Picos»');
else ok('los botones de pueblo no se deshabilitan');
if (/\$\(\s*["']picosb["']\s*\)\.onclick\s*=\s*function\s*\(\)\s*\{\s*fijarPicos\(!verPicos\)/.test(app)) ok('el botón «Picos» usa fijarPicos');
else mal('el botón «Picos» no usa fijarPicos');
const filtroSegunTipoUsos = (app.match(/filtroSegunTipo\(buscarSel\.t\)/g) || []).length;
if (/filtroSegunTipo\(buscarSel\.t\)/.test(app)) ok('al elegir y activar la búsqueda se ajustan los filtros al tipo buscado');
else mal('la búsqueda no ajusta los filtros al tipo buscado');
if (/t==="hamlet"\|\|t==="isolated_dwelling"/.test(app)) ok('una aldea pone «Con aldeas»');
else mal('no se reconoce una aldea en la búsqueda');

if (filtroSegunTipoUsos >= 2) ok('los filtros siguen al tipo al elegir y al activar (' + filtroSegunTipoUsos + ' usos)');
else mal('filtroSegunTipo solo se usa ' + filtroSegunTipoUsos + ' vez');

// ---------- elegir el pueblo como ubicación ----------
console.log('\nelegir pueblo como ubicación');
if (/function usarPuebloComoUbic\(/.test(app)) ok('función usarPuebloComoUbic');
else mal('falta usarPuebloComoUbic');
if (/if\s*\(\s*buscarModoUbic\s*\)\s*tipos\s*=\s*"pueblo"/.test(app)) ok('en modo ubicación solo se listan pueblos y aldeas');
else mal('el modo ubicación no restringe a pueblos: aparecerían picos');
if (/var\s+P0\s*=\s*buscarModoUbic\s*\?\s*null\s*:/.test(app)) ok('en modo ubicación no se filtra por distancia');
else mal('el modo ubicación sigue filtrando por distancia: puede ocultar el pueblo buscado');
if (/buscarClave/.test(app)) ok('la lista no se repinta si no ha cambiado (no se pierde el toque)');
else mal('falta la clave de repintado de la lista');
if (/buscarTapPend/.test(app) && /pointerdown/.test(app)) ok('el resultado se apunta en pointerdown (toque a prueba de repintado)');
else mal('el toque puede perderse si el teclado repinta la lista');
if (/posElegida/.test(app) && /posElegida\.t\s*<\s*120000/.test(app)) ok('al elegir el pueblo se entra con esa posición sin volver a pedir el GPS');
else mal('elegir el pueblo no arranca la identificación');
if (/buscarTipoFila/.test(html) && /buscarTipoFila/.test(app)) ok('el filtro de tipo se oculta al elegir el pueblo');
else mal('no se oculta el filtro de tipo en modo ubicación');

// ---------- limpieza de datos de versiones anteriores ----------
console.log('\ncaché y datos viejos');
if (/function limpiarDatosViejos\(/.test(app)) ok('función limpiarDatosViejos');
else mal('falta limpiarDatosViejos: no se limpian los datos de otras versiones');
if (/VERSION_DATOS\s*=\s*["'][^"']+["']/.test(app)) ok('marca de versión de datos');
else mal('falta VERSION_DATOS');
if (/versionDatos/.test(app)) ok('guarda la versión de datos aplicada');
else mal('no se guarda la versión de datos');
for (const k of ['pueblosParseados', 'picos', 'elevP', 'demIdx3']) {
  if (new RegExp('bdDel\\(\\[[^\\]]*["\']' + k + '["\']').test(app)) ok('borra la copia derivada «' + k + '»');
  else mal('no se borra la copia derivada «' + k + '»');
}
if (app.includes('bdAll("dem3:")')) ok('borra el relieve guardado');
else mal('no se borra el relieve guardado');
if (/misLugares|osmExtra|ubiUltima/.test(app) && !/bdDel\([^)]*misLugares/.test(app)) ok('conserva los pueblos añadidos y la última ubicación');
else mal('la limpieza podría borrar datos del usuario');
if (/limpiarDatosViejos\(\)[\s\S]{0,200}bdGet\("pueblosParseados"\)/.test(app))
  ok('limpia antes de leer la base guardada');
else mal('se lee la base guardada antes de limpiar');
if (/cache:recargarDatos\?"reload":"default"/.test(app)) ok('fuerza la descarga de datos tras limpiar');
else mal('no se fuerza la descarga de datos tras limpiar');

console.log('\napp Android');
if (/AndroidApp\.pedirPermisos/.test(app)) ok('la web puede volver a pedir los permisos de Android sin salir a los ajustes');
else mal('falta la llamada a AndroidApp.pedirPermisos');
if (/__permisosAndroid/.test(app)) ok('al conceder los permisos se reintenta sola');
else mal('falta el gancho __permisosAndroid');
if (/window\.AndroidApp/.test(app) && /posDesdeAndroid/.test(app)) ok('usa la última ubicación del sistema en la app Android');
else mal('no se usa la ubicación nativa de la app Android');

// ---------- permisos a demanda y borrado de datos del usuario ----------
console.log('\npermisos a demanda y datos del usuario');
if (html.includes('id="aborrarmis"')) ok('botón «Borrar todos mis datos añadidos»');
else mal('falta el botón #aborrarmis');
if (!html.includes('aborrarosm') && !app.includes('aborrarosm')) ok('sin botón aparte para borrar solo OpenStreetMap');
else mal('sigue el botón de borrar solo OpenStreetMap');
if (/function pedirPermisosAndroid\(/.test(app)) ok('función pedirPermisosAndroid');
else mal('falta pedirPermisosAndroid');
if (/AndroidApp\.permisosConcedidos/.test(app)) ok('comprueba si ya hay permisos antes de pedirlos');
else mal('no comprueba permisosConcedidos');
if (/esperaPermAndroid/.test(app) && /__permisosAndroid/.test(app)) ok('la identificación espera la respuesta del diálogo de permisos');
else mal('la identificación no espera al diálogo de permisos');
if (/async function iniciar\(\)\{[\s\S]{0,1500}(await )?pedirPermisosAndroid\(\)/.test(app)) ok('al iniciar la identificación se piden los permisos');
else mal('la identificación no pide los permisos');
if (/async function actualizarOSM\([\s\S]{0,500}pedirPermisosAndroid\(\)/.test(app)) ok('al actualizar desde OpenStreetMap se piden los permisos');
else mal('la actualización de OpenStreetMap no pide los permisos');
if (/function liberarPermisosAndroid\(/.test(app) && /AndroidApp\.liberar/.test(app)) ok('la app deja de usar la ubicación al terminar');
else mal('no se liberan los permisos al terminar');
if (/function salir\(\)[\s\S]{0,2500}liberarPermisosAndroid\(\)/.test(app)) ok('terminar la identificación libera ubicación y cámara');
else mal('terminar la identificación no libera los permisos');
if (/\}finally\{\s*if\(B\)B\.disabled=false;[\s\S]{0,200}liberarPermisosAndroid\(\)/.test(app)) ok('al terminar OpenStreetMap se libera y se avisa');
else mal('OpenStreetMap no libera la ubicación al terminar');
if (/\$\("aborrarmis"\)\.onclick/.test(app) && /MIS=\[\];OSMX=\[\];guardarAgregados\(\)/.test(app)) ok('el botón borra solo los lugares añadidos');
else mal('el botón no borra los datos añadidos');
if (!/bdDel\([^)]*misLugares/.test(app) && !/\$\("aborrarmis"\)[\s\S]{0,800}pueblosParseados/.test(app)) ok('no toca la base de pueblos/picos ni el relieve');
else mal('el borrado podría tocar la base o el relieve');

// ---------- datos externos, licencias y atribución ----------
console.log('\ndatos externos y licencias');
if (!app.includes('maps.mail.ru')) ok('Overpass sin el espejo maps.mail.ru');
else mal('sigue el espejo maps.mail.ru');
if (/function pedirOverpass\([\s\S]{0,900}intentar\(i\+1\)/.test(app)) ok('Overpass secuencial (un espejo cada vez)');
else mal('Overpass no usa reintento secuencial');
if (html.includes('openstreetmap.org/copyright') && html.includes('creativecommons.org/licenses/by/4.0')) ok('atribución visible de OpenStreetMap y Open-Meteo');
else mal('faltan enlaces de atribución en la portada');
if (existe('data/LICENCIA-DATOS.md')) ok('licencia de los datos en data/LICENCIA-DATOS.md');
else mal('falta data/LICENCIA-DATOS.md');

// Cache-bust coherente: todos los ?v=N deben ser el mismo número
const vers = [...new Set([
  ...[...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]),
  ...[...sw.matchAll(/\?v=(\d+)/g)].map((m) => m[1]),
])];
if (vers.length === 1) ok('cache-bust unificado: ?v=' + vers[0]);
else mal('cache-bust incoherente: ' + vers.join(', '));
const vSw = /VERSION = 'v(\d+)'/.exec(sw);
if (vSw && vSw[1] === vers[0]) ok('sw.js VERSION = v' + vSw[1]);
else mal('VERSION del sw.js (' + (vSw ? vSw[1] : '?') + ') no coincide con ?v=' + vers.join(','));

// ---------- resultado ----------
console.log('');
if (fallos.length) {
  console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
console.log('RESULTADO: todo correcto');
