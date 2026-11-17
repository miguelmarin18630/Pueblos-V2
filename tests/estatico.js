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

// ---------- añadir a la pantalla de inicio ----------
console.log('\nañadir a la pantalla de inicio');
for (const id of ['a2hs', 'a2hsX', 'a2hsPasos', 'a2hsMenu', 'a2hsOk', 'a2hsNo', 'a2hsBtn']) {
  if (new RegExp('id="' + id + '"').test(html)) ok('#' + id + ' en index.html');
  else mal('falta #' + id + ' en index.html');
}
if (/\$\("a2hsBtn"\)\.onclick/.test(app)) ok('el botón de la portada abre el aviso');
else mal('el botón de la portada no tiene manejador');
if (/hidden=a2hsInstalada\(\)/.test(app)) ok('el botón se oculta si ya está instalada o es la app de Play');
else mal('el botón de la portada no comprueba si ya está instalada');
if (/beforeinstallprompt/.test(app) && /\.prompt\(\)/.test(app)) ok('usa el diálogo nativo de instalación (beforeinstallprompt)');
else mal('no captura beforeinstallprompt');
if (/function a2hsEsIOS/.test(app) && /Añadir a la pantalla de inicio/.test(html)) ok('guía de «Añadir a la pantalla de inicio» en iPhone');
else mal('falta la guía de iPhone');
if (/localStorage\.getItem\("a2hs"\)/.test(app) && /localStorage\.setItem\("a2hs","1"\)/.test(app)) ok('se recuerda que ya se mostró (localStorage a2hs)');
else mal('el aviso no se recuerda entre visitas');
if (/display-mode: standalone/.test(app) && /window\.AndroidApp/.test(app)) ok('no se muestra si ya está instalada o es la app de Play');
else mal('no se comprueba si ya está instalada');
if (/addEventListener\("appinstalled"/.test(app)) ok('se oculta al instalarse (appinstalled)');
else mal('no escucha appinstalled');

// ---------- calibración con un lugar que veo ----------
console.log('\ncalibración con un lugar que veo');
if (/calList=P\.filter[\s\S]{0,900}p\.k<25/.test(app)) ok('la lista de lugares llega hasta 25 km');
else mal('la lista de calibración no llega a 25 km');
if (/calList=P\.filter[\s\S]{0,1200}\.slice\(0,120\)/.test(app)) ok('el tope de 120 no corta la lista antes de 25 km');
else mal('el tope de la lista es demasiado bajo');
if (/\$\("calsel"\)\.innerHTML=calList\.map/.test(app)) ok('la lista se rellena en #calsel');
else mal('la lista de calibración no se rellena');

// ---------- calibración: aviso de corrección grande ----------
console.log('\ncalibración: avisos y lista ordenada');
if (/function llenarCal\(/.test(app) && /calList=P\.filter/.test(app)) ok('la lista se genera en llenarCal()');
else mal('falta llenarCal()');
if (/if\(v===1\)llenarCal\(\)/.test(app)) ok('la lista se refresca al abrir «Con un lugar que veo»');
else mal('la lista no se refresca al abrir el método 1');
if (/var hc=hd\+declinacion\(\)/.test(app) && /Math\.round\(dif\(brg\(pos\.latitude,pos\.longitude,a\.la,a\.lo\),hc\)\/2\)/.test(app)) ok('la lista se ordena por cercanía a la mira con el rumbo bruto');
else mal('la lista no se ordena por cercanía a la mira');
if (/Math\.abs\(o\)>18/.test(app) && /calPend/.test(app)) ok('pide confirmación si la corrección pasa de 18°');
else mal('no se avisa de una corrección enorme');
if (/Math\.abs\(corr\)>18\?\["av","Calibrada "\+fmtOff\(corr\)\]/.test(app)) ok('el chip avisa en ámbar de una calibración sospechosa');
else mal('el chip no distingue una calibración sospechosa');
if (/Corrección guardada muy grande/.test(app)) ok('la nota explica cómo quitar una calibración enorme');
else mal('la nota no avisa de la corrección enorme');

console.log('\nfila del rumbo');
const css = leer('styles/camera.css');
if (/body\.on #fila1\s*\{[^}]*flex-wrap: wrap/.test(css)) ok('la fila del rumbo puede pasar a dos líneas');
else mal('la fila del rumbo no puede pasar a dos líneas');
if (/body\.on #rumbo\s*\{[^}]*min-width: max-content/.test(css)) ok('el rumbo nunca se recorta');
else mal('el rumbo se sigue recortando');
if (/body\.on #buscar2,\s*body\.on #anadircam,\s*body\.on #salir\s*\{[^}]*font-size: 12px[^}]*padding: 2px 4px/.test(css)) ok('los botones de la fila se aprietan para caber en una línea');
else mal('los botones de la fila no se aprietan lo suficiente');
if (/@media \(max-width: 340px\) \{[\s\S]{0,600}?body\.on #buscar2/.test(css)) ok('en móviles muy estrechos los botones se aprietan un poco más');
else mal('falta el ajuste para móviles muy estrechos');

// ---------- aviso de «pon el móvil en vertical» y cámara ----------
console.log('\norientación y cámara');
if (!/@media \(orientation: landscape\)/.test(css)) ok('el aviso ya no depende del tamaño de la ventana (el teclado lo activaba)');
else mal('el aviso sigue dependiendo del tamaño de la ventana: el teclado tapará el buscador');
if (/body\.on\.apaisado #giro/.test(css) && /screen\.orientation/.test(app) && /classList\.toggle\("apaisado"/.test(app)) ok('el aviso usa la orientación real del aparato');
else mal('el aviso no usa la orientación real del aparato');
if (/id="camReintentar"/.test(html) && /\$\("camReintentar"\)\.onclick/.test(app)) ok('hay botón para reintentar la cámara');
else mal('falta el botón para reintentar la cámara');
if (/Reintentar cámara/.test(app) && /candado/.test(app)) ok('el error de cámara explica cómo permitirla y reintentar');
else mal('el error de cámara no explica cómo permitirla');
if (/camErr="";camBusy=false;[\s\S]{0,200}?try\{pintar\(\)\}/.test(app)) ok('al encenderse la cámara se repinta y desaparece el aviso');
else mal('al encenderse la cámara el aviso y el botón se quedan en pantalla');

// ---------- etiquetas ancladas al punto del pueblo ----------
console.log('\netiquetas ancladas');
if (/out\.push\(\{k:"ln",x:Math\.round\(lx\),y:Math\.round\(ty\),h:[\s\S]{0,90}dx:Math\.round\(a?x-lx\)/.test(app)) ok('la línea de unión se dibuja siempre, también al arrimar la etiqueta al borde');
else mal('la línea de unión desaparece cuando la etiqueta se arrima al borde');
if (/out\.push\(\{k:"ln",x:Math\.round\(lpx\),y:Math\.round\(pty\),h:[\s\S]{0,90}dx:Math\.round\(px-lpx\)/.test(app)) ok('los picos usan la misma línea de unión');
else mal('los picos pierden la línea de unión');
if (!/Math\.abs\(lx-x\)<25/.test(app) && !/Math\.abs\(lpx-px\)<25/.test(app)) ok('ya no se descarta la línea por distancia');
else mal('sigue el descarte de la línea por distancia');
if (/transform-origin: 50% 0/.test(css)) ok('la línea gira sobre la etiqueta (no se despega)');
else mal('la línea no tiene origen de giro en la etiqueta');
if (/var rot=\(o\.k==="ln"&&o\.dx\)/.test(app)) ok('la línea puede ir en diagonal hacia el punto');
else mal('la línea no se inclina hacia el punto');
if (/etqNivel\[id\]/.test(app) && /nivel\[id\]=L/.test(app)) ok('cada etiqueta recuerda su altura y no salta al girar');
else mal('las etiquetas pueden saltar de altura al girar');
if (/if\(v===null\|\|v===undefined\)v=\(pan\?true:q\.dk<=10\)/.test(app)) ok('una etiqueta no desaparece cuando el panorama aún no sabe si se ve');
else mal('la etiqueta desaparece al girar por falta de dato del panorama');
// La etiqueta mide 33 px en el móvil real (15 px de letra + 8 de relleno + 4 de borde):
// la reserva debe cubrirlos o los bordes de dos etiquetas se tocan (medido en v48).
if (/c:y2-(\d+),d:y2/.test(app) && Number(app.match(/c:y2-(\d+),d:y2/)[1]) >= 33) ok('la reserva vertical cubre el alto real de la etiqueta (33 px)');
else mal('la reserva vertical no cubre los 33 px de la etiqueta y los bordes se tocarán');
const bloqueEt = /\.et \{[^}]*\}/.exec(css);
if (bloqueEt && /font-size: 15px/.test(bloqueEt[0]) && /border-width: 2px/.test(bloqueEt[0])) ok('el alto de la etiqueta sigue siendo 33 px (letra 15, borde 2)');
else mal('el CSS de la etiqueta cambió: revisa la reserva vertical');

// ---------- picos: no dependen de pedir su altura ----------
console.log('\npicos');
if (/var e=\(typeof p\.e==="number"\)\?p\.e:elevC\[ek\(p\)\]/.test(app)) ok('el pico usa la altura que ya trae el dato (no la pide a Open-Meteo)');
else mal('el pico vuelve a depender de la altura pedida a Open-Meteo');
if (/if\(vv===null\|\|vv===undefined\)vv=\(pan\?true:m\.dk<=10\)/.test(app)) ok('un pico no desaparece mientras el panorama no sabe si se ve');
else mal('el pico desaparece sin dato del panorama');
if (/vv=panVis\(k\);if\(vv===null\|\|vv===undefined\)vv=\(pan\?true:dk<=10\)/.test(app)) ok('la mira también mantiene el pico sin dato del panorama');
else mal('la mira descarta el pico sin dato del panorama');

// ---------- un pueblo grande no es un punto ----------
console.log('\npueblos grandes');
if (/function radPueblo\(/.test(app)) ok('radio aparente según el tipo de lugar');
else mal('falta radPueblo(): una ciudad se trataría como un punto');
if (/var rad=radPueblo\(t,dk\);\s*\n?\s*if\(Math\.abs\(d\)-rad>med\)continue/.test(app)) ok('la etiqueta aguanta mientras se vea parte del pueblo');
else mal('la etiqueta desaparece en cuanto el centro sale del encuadre');
if (/var ax=Math\.max\(4,Math\.min\(W-4,x\)\)/.test(app)) ok('la línea apunta al borde cuando el centro queda fuera');
else mal('la línea se va fuera de la pantalla');

// ---------- estabilizador de cámara ----------
console.log('\nestabilizador de cámara');
if (/function stabEscala\(\)/.test(app) && /function aplicarTransformCam\(\)/.test(app)) ok('estabilizador con sobreencuadre');
else mal('falta el estabilizador');
if (/function setPit\(/.test(app) && /pitF\+=a\*\(v-pitF\)/.test(app)) ok('cabeceo filtrado (pitF)');
else mal('no se filtra el cabeceo');
if (/return fv\*zoom\*\(stab\?stabEsc:1\)/.test(app)) ok('el zoom y el sobreencuadre cuentan para las etiquetas');
else mal('fEff no tiene en cuenta el estabilizador');
if (/var y=H\/2-f\*Math\.tan\(el-pitF\*R\)/.test(app)) ok('las etiquetas usan el cabeceo filtrado');
else mal('las etiquetas no usan pitF');
if (/translate\("\+tx\.toFixed\(1\)\+"px,"\+ty\.toFixed\(1\)\+"px\) scale/.test(app)) ok('la imagen se desplaza y se escala');
else mal('la imagen no se desplaza con el estabilizador');
if (/Math\.abs\(dH\)>8/.test(app) && /Math\.abs\(dP\)>8/.test(app)) ok('se ignoran los saltos de la brújula y del cabeceo');
else mal('no se protegen los saltos del sensor');
if (/stabX=Math\.max\(-mx,Math\.min\(mx/.test(app) && /stabY=Math\.max\(-my,Math\.min\(my/.test(app)) ok('el desplazamiento se limita al sobreencuadre (sin bordes negros)');
else mal('el desplazamiento no se limita');

// ---------- declinación magnética, campo de visión y nombres largos ----------
console.log('\ndeclinación magnética y campo de visión');
if (/var WMM_G=\[/.test(app) && /function wmmDecl\(/.test(app)) ok('modelo WMM2025 incluido (coeficientes y cálculo)');
else mal('falta el modelo WMM2025');
if (/function declinacion\(/.test(app)) ok('función declinacion()');
else mal('falta declinacion()');
if (/function rumboC\(\)\{return \(hd\+offPara\(hd\)\+hzPara\(hd\)\+declinacion\(\)/.test(app)) ok('el rumbo aplica la declinación magnética');
else mal('rumboC() no aplica la declinación');
if (/o=envolver\(b-hd-declinacion\(\)\)/.test(app) && /off=envolver\(b-media-declinacion\(\)\)/.test(app)) ok('la calibración descuenta la declinación (sin contarla dos veces)');
else mal('la calibración no descuenta la declinación');
if (/localStorage\.getItem\("decl2025"\)/.test(app) && /migrarDecl\(\)/.test(app)) ok('migración única de las calibraciones antiguas');
else mal('falta la migración de calibraciones antiguas');
if (/function fijarFov\(/.test(app) && /localStorage\.getItem\("fov"\)/.test(app)) ok('el campo de visión se guarda en el móvil');
else mal('el campo de visión no se guarda');
if (/id="cm5"/.test(html) && /id="calv5"/.test(html) && /id="fovr"/.test(html)) ok('ajuste del campo de visión en «Calibrar»');
else mal('falta el ajuste del campo de visión en la calibración');
if (/id="caldecl"/.test(html) && /Declinación magnética \(WMM2025\)/.test(app)) ok('la calibración muestra la declinación aplicada');
else mal('no se muestra la declinación en la calibración');
if (/function rotular\(/.test(app) && /rotular\(m\.n/.test(app) && /rotular\(q\.n/.test(app)) ok('los nombres largos se acortan en las etiquetas');
else mal('los nombres largos no se acortan');
if (/oriN===0\?\["n","Calibración …"\]:imprecisa\|\|prec===null\?\["av","Sin calibrar"\]/.test(app)) ok('el chip pasa de «Calibración …» a «Sin calibrar» cuando hay brújula');
else mal('el chip de calibración se queda en «Calibración …»');

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

// ---------- guía completa ----------
console.log('\nguía completa');
if (existe('docs/guia.html')) {
  const g = leer('docs/guia.html');
  if (/id="indice"/.test(g) && /Calibración de la brújula/.test(g)) ok('guía con índice y capítulo de calibración');
  else mal('la guía no tiene índice o capítulo de calibración');
} else mal('falta docs/guia.html');
if (existe('docs/guia-pueblos.pdf')) ok('PDF de la guía incluido');
else mal('falta docs/guia-pueblos.pdf');
if (/id="ayudaMarco"/.test(html) && /id="ayudaPdf"/.test(html)) ok('guía interactiva con descarga de PDF en la app');
else mal('faltan la guía interactiva o su botón de descarga');
if (/id="descargarGuia"/.test(html)) mal('el botón de PDF sigue en la pantalla principal');
else ok('el PDF solo se descarga desde la guía completa');
if (/id="vconsejos"[^>]*class="[^"]*btn-secondary/.test(html)) ok('la guía es la primera opción secundaria de la portada');
else mal('la guía no está como primera opción de la portada');
if (/<details id="faltan"/.test(html)) ok('«¿Falta algún pueblo o pico?» plegado para ahorrar espacio');
else mal('«¿Falta algún pueblo o pico?» no está plegado');

// ---------- línea del horizonte de la cámara ----------
console.log('\nhorizonte');
const dib = (app.match(/function dibujarSilueta\([\s\S]*?\n\}/) || [''])[0];
if (/hzDet\.ok&&/.test(dib) && !/255,255,255,\.35/.test(dib)) {
  ok('la línea de la cámara solo se dibuja cuando es fiable (amarilla)');
} else mal('se sigue dibujando la línea gris del horizonte sin validar');

// ---------- resultado ----------
console.log('');
if (fallos.length) {
  console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
console.log('RESULTADO: todo correcto');
