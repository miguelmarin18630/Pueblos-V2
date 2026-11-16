#!/usr/bin/env node
/* Prueba del relieve incluido en data/relieve.bin, sin navegador.
   Uso:  node tests/relieve.js
   - Abre el archivo y comprueba el formato y la cobertura
   - Compara la malla con las alturas de los 42.920 picos reales
   - Comprueba cumbres conocidas y el nivel del mar
   - Comprueba que el motor usa el archivo antes que la red y que el
     service worker lo guarda
   Sale con código 1 si algo falla. */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const raiz = path.resolve(__dirname, '..');
const fallos = [];
const ok = (m) => console.log('  OK   ' + m);
const mal = (m) => { console.log('  FALLO ' + m); fallos.push(m); };

const app = fs.readFileSync(path.join(raiz, 'scripts', 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

// ---------- formato ----------
console.log('\nformato del archivo');
let bytes, cab, bloques;
try {
  bytes = fs.readFileSync(path.join(raiz, 'data', 'relieve.bin'));
  ok('data/relieve.bin existe (' + (bytes.length / 1e6).toFixed(2) + ' MB)');
} catch (e) {
  mal('no existe data/relieve.bin: ejecuta tools/generar-relieve.py');
  console.log('\nRESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
try {
  const crudo = zlib.inflateSync(bytes);
  const hl = crudo.readUInt32LE(0);
  cab = JSON.parse(crudo.toString('utf8', 4, 4 + hl));
  const base = 4 + hl;
  const total = cab.b.reduce((s, k) => s + k.r * k.c, 0);
  const lo = crudo.subarray(base, base + total);
  const hi = crudo.subarray(base + total, base + total * 2);
  let off = 0;
  bloques = cab.b.map((k) => {
    const d = new Int16Array(k.r * k.c);
    for (let y = 0; y < k.r; y++) {
      let p = 0;
      const o = off + y * k.c;
      for (let x = 0; x < k.c; x++) { p = (p + ((hi[o + x] << 8) | lo[o + x])) << 16 >> 16; d[y * k.c + x] = p; }
    }
    off += k.r * k.c;
    return { n: k.n, w: k.w, r: k.r, c: k.c, d };
  });
  ok('se descomprime: ' + (crudo.length / 1e6).toFixed(2) + ' MB, ' + total.toLocaleString('es-ES') + ' celdas');
  if (cab.s === 0.005) ok('paso de malla 0,005° (~500 m)');
  else mal('el paso de malla no es 0,005°: ' + cab.s);
  const memoria = total * 2 / 1e6;
  console.log('       (en el móvil ocupa ' + memoria.toFixed(1) + ' MB de memoria al abrirlo)');
} catch (e) {
  mal('el archivo no se puede leer: ' + e.message);
  console.log('\nRESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}

// ---------- cobertura ----------
console.log('\ncobertura');
const dentro = (la, lo) => bloques.some((k) =>
  la <= k.n && la >= k.n - k.r * cab.s && lo >= k.w && lo <= k.w + k.c * cab.s);
const ESPERADOS = [
  ['Teide (Tenerife)', 28.2724, -16.6425],
  ['Mulhacén (Granada)', 37.0534, -3.3123],
  ['Aneto (Huesca)', 42.6322, 0.6570],
  ['Torre Cerredo (Asturias)', 43.1979, -4.8528],
  ['Almanzor (Ávila)', 40.24603, -5.29748],
  ['Madrid', 40.4168, -3.7038],
  ['Punta de Tarifa', 36.0000, -5.6000],
  ['Cabo de Creus', 42.3190, 3.3160],
  ['La Palma', 28.6800, -17.8500],
  ['Lanzarote', 29.0400, -13.6300],
  ['Melilla', 35.2920, -2.9380],
];
let sinCobertura = 0;
ESPERADOS.forEach(([n, la, lo]) => { if (!dentro(la, lo)) { sinCobertura++; console.log('       fuera: ' + n); } });
if (!sinCobertura) ok('la malla cubre toda España, Baleares y Canarias (' + ESPERADOS.length + ' puntos de control)');
else mal(sinCobertura + ' puntos de control quedan fuera de la malla');

// ---------- alturas ----------
console.log('\nalturas conocidas');
const altura = (la, lo) => {
  for (const k of bloques) {
    const fi = (k.n - la) / cab.s - 0.5, fj = (lo - k.w) / cab.s - 0.5;
    if (fi < -0.5 || fj < -0.5 || fi > k.r - 0.5 || fj > k.c - 0.5) continue;
    const i = Math.min(Math.max(Math.floor(fi), 0), k.r - 2);
    const j = Math.min(Math.max(Math.floor(fj), 0), k.c - 2);
    const ty = Math.min(Math.max(fi - i, 0), 1), tx = Math.min(Math.max(fj - j, 0), 1);
    const c = k.c;
    const a = k.d[i * c + j], b = k.d[i * c + j + 1], e = k.d[(i + 1) * c + j], f = k.d[(i + 1) * c + j + 1];
    return Math.round((a * (1 - tx) + b * tx) * (1 - ty) + (e * (1 - tx) + f * tx) * ty);
  }
  return null;
};
const CUMBRES = [
  ['Teide', 28.2724, -16.6425, 3715, 150],
  ['Mulhacén', 37.0534, -3.3123, 3479, 120],
  ['Aneto', 42.6322, 0.6570, 3404, 120],
  ['Torre Cerredo', 43.1979, -4.8528, 2648, 200],
  ['Almanzor', 40.24603, -5.29748, 2592, 120],
];
CUMBRES.forEach(([n, la, lo, real, tol]) => {
  const v = altura(la, lo);
  if (v === null) { mal(n + ': fuera de la malla'); return; }
  if (Math.abs(v - real) <= tol) ok(n + ': ' + v + ' m (real ' + real + ' m)');
  else mal(n + ': ' + v + ' m, se esperaba ' + real + ' m ±' + tol);
});
const mar = altura(36.0, -5.5);
if (mar !== null && Math.abs(mar) <= 30) ok('en el mar: ' + mar + ' m');
else mal('en el mar debería rondar 0 m y da ' + mar + ' m');
const madrid = altura(40.4168, -3.7038);
if (madrid !== null && Math.abs(madrid - 650) <= 120) ok('Madrid: ' + madrid + ' m (unos 650 m)');
else mal('Madrid da ' + madrid + ' m y se esperaba unos 650 m');

// ---------- comparación con los picos reales ----------
console.log('\ncomparación con los 42.920 picos');
try {
  const crudo = fs.readFileSync(path.join(raiz, 'data', 'picos.js'), 'utf8');
  const ini = crudo.indexOf('"') + 1, fin = crudo.lastIndexOf('"');
  const lineas = crudo.slice(ini, fin).replace(/\\n/g, '\n').split('\n').filter((l) => l.trim());
  const errores = [];
  let fuera = 0;
  lineas.forEach((l) => {
    const p = l.split('|');
    if (p.length < 4) return;
    const v = altura(Number(p[0]), Number(p[1]));
    if (v === null) { fuera++; return; }
    errores.push(v - Number(p[3]));
  });
  const abs = errores.map(Math.abs).sort((a, b) => a - b);
  const mae = abs.reduce((s, v) => s + v, 0) / abs.length;
  const p90 = abs[Math.floor(abs.length * 0.9)];
  console.log('       ' + errores.length + ' picos · error medio ' + mae.toFixed(0) +
    ' m · p90 ' + p90 + ' m · fuera ' + fuera);
  if (errores.length > 40000) ok('la malla cubre los picos de la base (' + fuera + ' fuera)');
  else mal('solo se han podido comparar ' + errores.length + ' picos');
  if (mae <= 40) ok('error absoluto medio ' + mae.toFixed(0) + ' m (≤ 40 m)');
  else mal('error absoluto medio ' + mae.toFixed(0) + ' m: la malla se ha degradado');
  if (p90 <= 90) ok('el 90% de los picos a ' + p90 + ' m o menos (≤ 90 m)');
  else mal('el 90% de los picos a ' + p90 + ' m: demasiado');
} catch (e) {
  mal('no se pudo comparar con data/picos.js: ' + e.message);
}

// ---------- el motor lo usa ----------
console.log('\nintegración en la app');
if (/fetch\("data\/relieve\.bin"/.test(app)) ok('el motor descarga data/relieve.bin');
else mal('el motor no descarga data/relieve.bin');
if (/async function altitudes\(lats,lons\)\{\s*if\(DEMLOC\)/.test(app)) ok('las altitudes se leen del archivo antes que de la red');
else mal('altitudes() no usa el archivo incluido en primer lugar');
if (/libre=DEMLOC\?1e9/.test(app)) ok('con el archivo no se respeta el cupo de Open-Meteo (panorama completo)');
else mal('el panorama sigue limitado por el cupo aunque haya archivo');
if (!/await demLocalP/.test(app)) ok('el archivo no bloquea el primer dibujo');
else mal('el arranque se queda esperando al archivo');
if (/relieveListo/.test(app) && /pan=null/.test(app)) ok('al llegar el archivo se rehace el panorama');
else mal('no se rehace el panorama al llegar el archivo');
if (/panGen\+\+/.test(app) && /gen!==panGen/.test(app)) ok('un panorama calculado con la red no pisa al que usa el archivo');
else mal('el panorama viejo puede pisar al calculado con el archivo');
if (/data\/relieve\.bin/.test(sw) && /'\.\/data\/relieve\.bin'/.test(sw)) ok('el service worker guarda el archivo');
else mal('el service worker no guarda data/relieve.bin');
const vSw = /VERSION = 'v(\d+)'/.exec(sw), vHtml = [...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
if (vSw && vHtml.length && vHtml.every((v) => v === vSw[1])) ok('versión unificada v' + vSw[1]);
else mal('la versión del index.html y la del sw.js no coinciden');

console.log('\nRESULTADO: ' + (fallos.length ? fallos.length + ' fallo(s)' : 'todo bien'));
process.exit(fallos.length ? 1 : 0);
