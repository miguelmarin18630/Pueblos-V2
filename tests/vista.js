#!/usr/bin/env node
/* Prueba de la vista de la cámara: pueblos, aldeas y picos con el relieve.
   Extrae las funciones reales de scripts/app.js (contarPueblos, sinPueblos,
   panVis y picoMira) y las ejecuta con datos simulados.
   Uso:  node tests/vista.js
   Sale con código 1 si alguna comprobación falla. */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'scripts', 'app.js'), 'utf8');

const fallos = [];
const ok = (m) => console.log('  OK   ' + m);
const mal = (m) => { console.log('  FALLO ' + m); fallos.push(m); };

function extraer(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('no encuentro "' + desde + '" en scripts/app.js');
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('no encuentro el final del bloque "' + desde + '"');
  return src.slice(i, j + hasta.length);
}

const R = Math.PI / 180;
const envolver = (a) => ((a % 360) + 540) % 360 - 180;
function brg(a, b, c, d) {
  const L = (d - b) * R, y = Math.sin(L) * Math.cos(c * R);
  const x = Math.cos(a * R) * Math.sin(c * R) - Math.sin(a * R) * Math.cos(c * R) * Math.cos(L);
  return (Math.atan2(y, x) / R + 360) % 360;
}
function dst(a, b, c, d) {
  const p = (c - a) * R, q = (d - b) * R;
  const h = Math.sin(p / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin(q / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const dif = (a, b) => { const d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };
function puntoEnDireccion(la, lo, km, rumbo) {
  const d = km / 111;
  return [la + d * Math.cos(rumbo * R), lo + d * Math.sin(rumbo * R) / Math.cos(la * R)];
}

// ---------- contarPueblos / sinPueblos ----------
let fragContar, fragSin;
try {
  fragContar = extraer('function contarPueblos(', '\n}');
  fragSin = extraer('var spC={k:"",t:""};', '\n}');
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

function montarVista(puntos, extra) {
  const ctx = Object.assign({
    R, tolMira: () => 3, enRecuadro: () => puntos,
    BD: [1], BASE: [], P: [1, 2, 3], alcance: 40, verAldeas: false,
    brg, dst, dif,
  }, extra || {});
  const fn = new Function('ctx', 'with(ctx){' + fragContar + '\n' + fragSin + '\nreturn {contarPueblos:contarPueblos,sinPueblos:sinPueblos};}');
  return fn(ctx);
}

const LA = 40.0, LO = -3.0;
const pueblo = ['Pueblo', ...puntoEnDireccion(LA, LO, 10, 0), 'village'];
const aldea = ['Aldea', ...puntoEnDireccion(LA, LO, 5, 0), 'hamlet'];
const aldeaLejos = ['Aldea lejana', ...puntoEnDireccion(LA, LO, 20, 0), 'hamlet'];
const pico = ['Pico', ...puntoEnDireccion(LA, LO, 12, 0), 'peak'];

console.log('\nvista: solo pueblos / con aldeas');
{
  const v = montarVista([pueblo, aldea]);
  const sin = v.contarPueblos({ latitude: LA, longitude: LO }, 0, 40, true, false);
  const con = v.contarPueblos({ latitude: LA, longitude: LO }, 0, 40, true, true);
  sin === 1 ? ok('«Solo pueblos» no cuenta la aldea (1)') : mal('«Solo pueblos» contó aldeas: ' + sin);
  con === 2 ? ok('«Con aldeas» cuenta pueblo + aldea (2)') : mal('«Con aldeas» no contó la aldea: ' + con);
}
{
  const v = montarVista([aldea], { verAldeas: false });
  const msg = v.sinPueblos({ latitude: LA, longitude: LO }, 0, []);
  /Solo hay aldeas/.test(msg)
    ? ok('con solo aldeas avisa: «' + msg + '»')
    : mal('mensaje inesperado con solo aldeas: «' + msg + '»');
}
{
  const v = montarVista([aldeaLejos], { verAldeas: true });
  const n = v.contarPueblos({ latitude: LA, longitude: LO }, 0, 40, true, false);
  n === 0 ? ok('las aldeas a más de 12 km no se cuentan ni se pintan') : mal('contó un aldea a 20 km: ' + n);
}
{
  const v = montarVista([pueblo, aldea], { verAldeas: true });
  const msg = v.sinPueblos({ latitude: LA, longitude: LO }, 0, []);
  /No veo ningún pueblo/.test(msg) ? ok('con pueblo y aldea en la mira no hay aviso de bloqueo') : mal('mensaje inesperado: «' + msg + '»');
}

// ---------- panVis: el relieve apagado deja verlo todo ----------
const fragPanVis = extraer('function panVis(p){', '\n}');
{
  const ctx = { R, usarRelieve: false, panBloq: 0, pan: null, brg, dst, elevC: {}, ek: (p) => p.n, pedirElev() {}, DS: [1], Date: { now: () => 0 } };
  const fn = new Function('ctx', 'with(ctx){' + fragPanVis + '\nreturn panVis;}');
  const panVis = fn(ctx);
  panVis(pueblo) === true && panVis(pico) === true
    ? ok('con «Relieve: No» se ven pueblos y picos')
    : mal('con «Relieve: No» algo queda oculto');
}

// ---------- picoMira: los picos también dependen del relieve ----------
const fragPico = extraer('function picoMira(pe,hdc){', '\n}');
function montarPico(panVis) {
  const ctx = {
    R, envolver, brg, dst, tolMira: () => 3, fEff: () => 1200,
    innerHeight: 800, alcance: 40, PK: [{ n: 'Pico', la: pico[1], lo: pico[2], e: 2000 }],
    pan: null, pos: { latitude: LA, longitude: LO, altitude: 600 },
    pit: 0, panVis,
  };
  const fn = new Function('ctx', 'with(ctx){' + fragPico + '\nreturn picoMira;}');
  return fn(ctx)({ latitude: LA, longitude: LO }, 0);
}
{
  const pm = montarPico(() => true);
  pm && pm.n === 'Pico' ? ok('con relieve y pico visible, la mira lo encuentra') : mal('no encontró el pico visible');
}
{
  const pm = montarPico(() => false);
  pm === null ? ok('si una montaña tapa el pico, no se muestra') : mal('mostró un pico tapado por el relieve');
}

console.log('');
if (fallos.length) {
  console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
console.log('RESULTADO: todo correcto');
