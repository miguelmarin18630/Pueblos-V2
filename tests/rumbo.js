#!/usr/bin/env node
/* Prueba del filtro de rumbo y de la selección de la mira, sin navegador.
   Extrae setH(), tolMira(), cmpMira() y picoMira() del propio scripts/app.js y
   las ejecuta con un sensor simulado (ruido, giros, picos de interferencia y
   huecos de eventos). Uso:  node tests/rumbo.js
   Sale con código 1 si alguna comprobación falla. */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'scripts', 'app.js'), 'utf8');

const fallos = [];
const ok = (m) => console.log('  OK   ' + m);
const mal = (m) => { console.log('  FALLO ' + m); fallos.push(m); };

// ---------- extraer el código real de la app ----------
function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('no encuentro "' + desde + '" en scripts/app.js');
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('no encuentro el final del bloque "' + desde + '"');
  return src.slice(i, j + hasta.length);
}
function extraerLinea(desde) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('no encuentro "' + desde + '" en scripts/app.js');
  return src.slice(i, src.indexOf('\n', i));
}

let fragRumbo, fragTol, fragCmp, fragPico;
try {
  fragRumbo = extraer('var OEF_MIN', '\n}');              // constantes + setH
  fragTol = extraer('function tolMira(){', '\n}');
  fragCmp = extraerLinea('function cmpMira');
  fragPico = extraer('function picoMira(pe,hdc){', '\n}');
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const wrap = (a) => ((a % 360) + 540) % 360 - 180;
const R = Math.PI / 180;

// mismas fórmulas que scripts/app.js (para montar posiciones de prueba)
function brg(a, b, c, d) { const L = (d - b) * R, y = Math.sin(L) * Math.cos(c * R), x = Math.cos(a * R) * Math.sin(c * R) - Math.sin(a * R) * Math.cos(c * R) * Math.cos(L); return (Math.atan2(y, x) / R + 360) % 360; }
function dst(a, b, c, d) { const p = (c - a) * R, q = (d - b) * R, h = Math.sin(p / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin(q / 2) ** 2; return 12742 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); }

// sensor simulado determinista
let seed = 20261110;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function gauss() { const u = Math.max(rnd(), 1e-9), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function montar(frag, extra, cual) {
  const ctx = Object.assign({
    TOL: 3, prec: null, R,
    sm: null, smRaw: null, smDx: 0, smT: 0, smPend: null,
    hd: 0, tp: 0, reloj: 1e6, pintados: 0,
    pintar() { ctx.pintados++; },
    Date: { now() { return ctx.reloj; } },
  }, extra || {});
  const fn = new Function('ctx', 'with(ctx){' + frag + '\nreturn ' + cual + ';}');
  const f = fn(ctx);
  f.ctx = ctx;
  return f;
}

// ---------- 1. temblor parado y retraso girando ----------
console.log('\nFiltro de rumbo (60 Hz, ruido sigma 0,35°)');
{
  const setH = montar(fragRumbo, null, 'setH');
  const ctx = setH.ctx;
  const DT = 1000 / 60;
  let verdad = 0;
  const erroresQuieto = [], erroresGiro = [];

  function paso(vel, n, medir) {
    for (let i = 0; i < n; i++) {
      ctx.reloj += DT;
      verdad = (verdad + vel * (DT / 1000) + 360) % 360;
      setH((verdad + 0.35 * gauss() + 360) % 360);
      if (medir) medir(wrap(ctx.hd - verdad));
    }
  }
  paso(0, 240, (e) => erroresQuieto.push(e));      // 4 s parado
  paso(90, 120, (e) => erroresGiro.push(e));       // 2 s girando a 90°/s
  paso(0, 120, (e) => erroresQuieto.push(e));      // 2 s parado

  const rms = Math.sqrt(erroresQuieto.reduce((a, e) => a + e * e, 0) / erroresQuieto.length);
  const maxQ = Math.max(...erroresQuieto.map(Math.abs));
  const retraso = -erroresGiro.reduce((a, e) => a + e, 0) / erroresGiro.length;

  if (rms < 0.6) ok('temblor parado: ' + rms.toFixed(2) + '° rms (antes 0,68°)');
  else mal('temblor parado ' + rms.toFixed(2) + '° (se esperaba < 0,6°)');
  if (maxQ < 2.5) ok('desvío máximo parado: ' + maxQ.toFixed(2) + '°');
  else mal('desvío máximo parado ' + maxQ.toFixed(2) + '° (se esperaba < 2,5°)');
  if (retraso < 2.5) ok('retraso a 90°/s: ' + retraso.toFixed(2) + '° (antes 5,8°)');
  else mal('retraso a 90°/s ' + retraso.toFixed(2) + '° (se esperaba < 2,5°)');
  if (ctx.pintados > 55 && ctx.pintados < 85) ok('repinta ' + ctx.pintados + ' veces en 8 s (cada ~100 ms)');
  else mal('repinta ' + ctx.pintados + ' veces en 8 s: el límite de 100 ms no funciona');
}

// ---------- 2. pico aislado de interferencia ----------
console.log('\nPico aislado de interferencia magnética');
{
  const setH = montar(fragRumbo, null, 'setH');
  const ctx = setH.ctx;
  const DT = 1000 / 60;
  for (let i = 0; i < 120; i++) { ctx.reloj += DT; setH(0); }
  let peor = 0;
  ctx.reloj += DT; setH(25); peor = Math.max(peor, Math.abs(wrap(ctx.hd)));
  for (let i = 0; i < 120; i++) { ctx.reloj += DT; setH(0); peor = Math.max(peor, Math.abs(wrap(ctx.hd))); }
  if (peor < 3) ok('una muestra de +25° no mueve el rumbo (máx ' + peor.toFixed(2) + '°)');
  else mal('la muestra aislada de +25° movió el rumbo ' + peor.toFixed(2) + '°');
}

// ---------- 3. salto de verdad (interferencia persistente) ----------
console.log('\nSalto real de 40° sostenido');
{
  const setH = montar(fragRumbo, null, 'setH');
  const ctx = setH.ctx;
  const DT = 1000 / 60;
  for (let i = 0; i < 60; i++) { ctx.reloj += DT; setH(0); }
  for (let i = 0; i < 3; i++) { ctx.reloj += DT; setH(40); }
  const e = Math.abs(wrap(ctx.hd - 40));
  if (e < 1) ok('acepta el salto confirmado en 2 muestras (error ' + e.toFixed(2) + '°)');
  else mal('no acepta un salto real de 40° (error ' + e.toFixed(2) + '°)');
}

// ---------- 4. hueco de eventos ----------
console.log('\nHueco de eventos (pantalla apagada)');
{
  const setH = montar(fragRumbo, null, 'setH');
  const ctx = setH.ctx;
  for (let i = 0; i < 60; i++) { ctx.reloj += 1000 / 60; setH(10); }
  ctx.reloj += 2000;
  setH(120);
  const e = Math.abs(wrap(ctx.hd - 120));
  if (e < 0.01) ok('tras 2 s sin eventos toma el rumbo nuevo sin filtrar');
  else mal('tras un hueco de 2 s se queda en ' + ctx.hd.toFixed(1) + '° en vez de 120°');
}

// ---------- 5. cruce del norte ----------
console.log('\nCruce del norte (350° -> 10°)');
{
  const setH = montar(fragRumbo, null, 'setH');
  const ctx = setH.ctx;
  for (let i = 0; i < 60; i++) { ctx.reloj += 1000 / 60; setH(350); }
  for (let i = 0; i < 30; i++) { ctx.reloj += 1000 / 60; setH(10); }
  const e = Math.abs(wrap(ctx.hd - 10));
  if (e < 3) ok('no se va al lado contrario (error ' + e.toFixed(2) + '°)');
  else mal('al cruzar el norte se va a ' + ctx.hd.toFixed(1) + '° (error ' + e.toFixed(2) + '°)');
}

// ---------- 6. tolerancia de la mira ----------
console.log('\nTolerancia de la mira según la precisión de la brújula');
{
  const tolMira = montar(fragTol, null, 'tolMira');
  const casos = [[null, 3, 'sin dato'], [-1, 3, 'sin calibrar'], [0, 1.5, '±0°'], [2, 1.5, '±2°'], [4, 2, '±4°'], [6, 2.5, '±6°'], [8, 3, '±8°'], [20, 3, '±20°'], [40, 3, 'dato absurdo']];
  for (const [prec, esperado, etiqueta] of casos) {
    tolMira.ctx.prec = prec;
    const v = tolMira();
    if (Math.abs(v - esperado) < 1e-9) ok('prec ' + etiqueta + ' -> ' + v.toFixed(1) + '°');
    else mal('prec ' + etiqueta + ' -> ' + v + ' (se esperaba ' + esperado + ')');
  }
  tolMira.ctx.prec = undefined;
  if (isFinite(tolMira())) ok('con prec sin inicializar devuelve un margen válido');
  else mal('con prec sin inicializar devuelve NaN');
  tolMira.ctx.prec = NaN;
  if (isFinite(tolMira())) ok('con prec NaN devuelve un margen válido');
  else mal('con prec NaN devuelve NaN');
}

// ---------- 7. orden de candidatos ----------
console.log('\nOrden de los pueblos en la mira');
{
  const cmpMira = montar(fragCmp, null, 'cmpMira');
  const a = { d: 0.2, k: 39 }, b = { d: 0.4, k: 1.5 };
  // La distancia manda: gana el lugar más cercano que está en la mira (1,5 km), no el lejano (39 km)
  if (cmpMira(b, a) < 0) ok('el pueblo más cercano (1,5 km) gana al más lejano (39 km)');
  else mal('un pueblo a 39 km sigue ganando a uno a 1,5 km');
  const c = { d: 0.21, k: 39 }, d = { d: 0.24, k: 1.5 };
  if (cmpMira(c, d) > 0) ok('manda la distancia, el ángulo solo desempata si es igual');
  else mal('el ángulo manda sobre la distancia');
  if (cmpMira({ d: 0.5, k: 3 }, { d: 0.5, k: 3 }) === 0) ok('mismo ángulo y distancia: orden estable');
  else mal('el comparador no devuelve 0 para dos candidatos idénticos');
}

// ---------- 8. picos: banda vertical y desempate ----------
console.log('\nPicos: la cumbre que de verdad estás apuntando');
{
  const lat0 = 40, lon0 = 0;
  function picoA(nombre, rumbo, km, altura) {
    const dLat = (km / 111.32) * Math.cos(rumbo * R);
    const dLon = (km / (111.32 * Math.cos(lat0 * R))) * Math.sin(rumbo * R);
    return { n: nombre, la: lat0 + dLat, lo: lon0 + dLon, e: altura };
  }
  const cerca = picoA('Cerca', 0, 1, 100 + 1000 * Math.tan(30 * R));    // 30° de altura aparente
  const lejos = picoA('Lejos', 1, 30, 100 + 30000 * Math.tan(0.5 * R)); // 0,5° sobre el horizonte
  const pe = { latitude: lat0, longitude: lon0 };

  const picoMira = montar(fragTol + '\n' + fragPico, {
    PK: [cerca, lejos], alcance: 40, prec: 8, pit: 0, innerHeight: 844,
    fEff: () => 600, pan: { H0: 100 }, pos: { altitude: 100 },
    panVis: () => true, brg, dst, envolver: wrap,
  }, 'picoMira');

  let r = picoMira(pe, 0);
  if (r && r.n === 'Lejos') ok('mirando al horizonte gana la lejana de la mira, no la cercana que asoma a 30°');
  else mal('mirando al horizonte eligió ' + (r ? r.n : 'ninguna') + ' (se esperaba Lejos)');

  picoMira.ctx.pit = 25;
  r = picoMira(pe, 0);
  if (r && r.n === 'Cerca') ok('si apuntas arriba (25°) gana la cumbre cercana');
  else mal('apuntando a 25° eligió ' + (r ? r.n : 'ninguna') + ' (se esperaba Cerca)');

  // tolerancia: un pico a 2,5° entra con brújula de ±8° pero no con una de ±2°
  const p25 = picoA('Dos y medio', 2.5, 10, 100 + 10000 * Math.tan(1 * R));
  picoMira.ctx.PK = [p25];
  picoMira.ctx.pit = 1;
  picoMira.ctx.prec = 8;
  if (picoMira(pe, 0)) ok('con brújula de ±8° acepta un pico a 2,5° de la mira');
  else mal('con brújula de ±8° pierde un pico a 2,5°');

  picoMira.ctx.prec = 2;
  if (!picoMira(pe, 0)) ok('con brújula de ±2° descarta ese pico (margen 1,5°)');
  else mal('con brújula de ±2° sigue aceptando un pico a 2,5°');

  // fuera del encuadre vertical
  picoMira.ctx.prec = 8;
  picoMira.ctx.pit = 0;
  picoMira.ctx.PK = [picoA('Muy alto', 0, 1, 100 + 1000 * Math.tan(50 * R))];
  if (!picoMira(pe, 0)) ok('descarta un pico a 50° de altura (no cabe en el encuadre)');
  else mal('acepta un pico a 50° de altura');
}

// ---------- resultado ----------
console.log('');
if (fallos.length) {
  console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
console.log('RESULTADO: todo correcto');
