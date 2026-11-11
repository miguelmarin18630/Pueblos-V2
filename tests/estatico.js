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

// ---------- resultado ----------
console.log('');
if (fallos.length) {
  console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
console.log('RESULTADO: todo correcto');
