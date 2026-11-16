#!/usr/bin/env node
/* Prueba de la calibración andando, sin navegador.
   Extrae calAndar() y sinBrujula() del propio scripts/app.js y los ejecuta en un
   contexto aislado con un GPS y una brújula simulados. Comprueba que:
   - con el móvil inclinado (|cabeceo| >= 30°) no se guardan muestras ni se calibra;
   - con el móvil en vertical se recupera el desvío real de la brújula;
   - sin datos de brújula se detecta que no se puede calibrar.
   Uso:  node tests/calibracion.js
   Sale con código 1 si alguna comprobación falla. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'scripts', 'app.js'), 'utf8');

const fallos = [];
const ok = (m) => console.log('  OK   ' + m);
const mal = (m) => { console.log('  FALLO ' + m); fallos.push(m); };

// Extrae una función completa por su cabecera (llaves equilibradas, ignorando cadenas simples)
function extraerFuncion(cabecera) {
  const i = src.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro "' + cabecera + '" en scripts/app.js');
  let n = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { n++; started = true; }
    if (c === '}') { n--; if (started && n === 0) return src.slice(i, j + 1); }
  }
  throw new Error('no cierro el bloque de "' + cabecera + '"');
}
function extraerLinea(cabecera) {
  const i = src.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro "' + cabecera + '" en scripts/app.js');
  return src.slice(i, src.indexOf('\n', i));
}

let codigo;
try {
  codigo = [
    'var R=Math.PI/180;',
    extraerLinea('function dst('),
    extraerLinea('function brg('),
    extraerLinea('function dif('),
    extraerLinea('function envolver('),
    extraerLinea('function fmtOff('),
    extraerFuncion('function sinBrujula('),
    extraerFuncion('function calAndar('),
  ].join('\n');
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

// Entorno simulado: estado global que usa calAndar()
function nuevoEntorno() {
  const elementos = {};
  const $ = (id) => (elementos[id] = elementos[id] || { textContent: '' });
  const ctx = {
    $, Math, Date, console,
    hd: 0, pit: 0, oriN: 1, off: 0, calAnd: null,
    finCal: (t) => { ctx.ultimoTexto = t; },
    ponerTab: () => {},
    declinacion: () => 0,
    dstAviso: null,
    elementos,
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx;
}

// Recorrido en línea recta hacia el norte-este (45°) de unos 120 m, 1 fix cada ~4 m
const LA0 = 40.0, LO0 = -3.0;
function puntoEn(rumboDeg, metros) {
  const r = rumboDeg * Math.PI / 180, dLat = metros * Math.cos(r) / 111320, dLon = metros * Math.sin(r) / (111320 * Math.cos(LA0 * Math.PI / 180));
  return { latitude: LA0 + dLat, longitude: LO0 + dLon, accuracy: 5 };
}

// Simula caminar con un desvío de brújula de `desvio` grados y el cabeceo indicado
function caminar(ctx, desvio, cabeceo) {
  const rumboReal = 45;
  ctx.calAnd = { la: LA0, lo: LO0, s: [] };
  for (let m = 4; m <= 120; m += 4) {
    ctx.hd = (rumboReal + desvio + 360) % 360;   // lo que marca el móvil
    ctx.pit = cabeceo;
    ctx.calAndar(puntoEn(rumboReal, m));
    if (ctx.calAnd === null) break;              // la calibración ya ha terminado
  }
}

console.log('\nCalibración andando (calAndar)\n');

// 1) Vertical: se recupera el desvío real de la brújula (+12°)
{
  const ctx = nuevoEntorno();
  caminar(ctx, 12, 0);
  const err = Math.abs(((ctx.off - (-12)) + 540) % 360 - 180);
  // off debe ser -desvio (la corrección que hay que sumar al rumbo bruto, con la misma convención de calOk)
  if (ctx.ultimoTexto && err < 2) ok('en vertical recupera el desvío de +12° con error < 2° (' + ctx.off.toFixed(1) + '°)');
  else mal('en vertical no recupera el desvío (off=' + ctx.off + ', texto=' + ctx.ultimoTexto + ')');
}

// 2) Inclinado todo el recorrido: no hay muestras válidas, no se calibra y se pide vertical
{
  const ctx = nuevoEntorno();
  caminar(ctx, 12, 60);
  const txt = ctx.elementos.calst.textContent;
  if (ctx.calAnd && ctx.calAnd.s.length === 0 && ctx.ultimoTexto === undefined && /vertical/.test(txt)) ok('inclinado: no guarda muestras y pide poner el móvil en vertical');
  else mal('inclinado: se han guardado muestras o no se avisa (muestras=' + (ctx.calAnd && ctx.calAnd.s.length) + ', texto=' + txt + ')');
}

// 3) Mitad inclinado y mitad vertical: solo cuentan las muestras verticales y la estimación sigue siendo buena
{
  const ctx = nuevoEntorno();
  ctx.calAnd = { la: LA0, lo: LO0, s: [] };
  for (let m = 4; m <= 120; m += 4) {
    ctx.hd = (45 + 12 + 360) % 360;
    ctx.pit = (m < 60) ? 60 : 0;
    ctx.calAndar(puntoEn(45, m));
    if (ctx.calAnd === null) break;
  }
  const err = Math.abs(((ctx.off + 12) + 540) % 360 - 180);
  if (ctx.ultimoTexto && err < 2) ok('mezcla inclinado/vertical: usa solo las muestras verticales (error ' + err.toFixed(1) + '°)');
  else mal('mezcla inclinado/vertical: resultado incorrecto (off=' + ctx.off + ', texto=' + ctx.ultimoTexto + ')');
}

// 4) Sin brújula se detecta
{
  const ctx = nuevoEntorno();
  ctx.oriN = 0;
  if (ctx.sinBrujula() === true) ok('sin datos de brújula se detecta');
  else mal('sin datos de brújula no se detecta');
  ctx.oriN = 5;
  if (ctx.sinBrujula() === false) ok('con datos de brújula no bloquea');
  else mal('con datos de brújula bloquea la calibración');
}

console.log('');
if (fallos.length) {
  console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
console.log('RESULTADO: todo correcto');
