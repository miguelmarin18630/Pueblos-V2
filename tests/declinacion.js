#!/usr/bin/env node
/* Prueba del modelo de declinación magnética WMM2025 (sin navegador).
   Extrae los coeficientes y wmmDecl() de scripts/app.js y compara con valores
   de referencia calculados con la implementación oficial del WMM2025.
   Uso:  node tests/declinacion.js
   Sale con código 1 si alguna comprobación falla. */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'scripts', 'app.js'), 'utf8');

const fallos = [];
const ok = (m) => console.log('  OK   ' + m);
const mal = (m) => { console.log('  FALLO ' + m); fallos.push(m); };

function bloque(desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error('no encuentro "' + desde + '" en scripts/app.js');
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error('no encuentro el final de "' + desde + '"');
  return src.slice(i, j + hasta.length);
}

let codigo;
try {
  codigo = [
    bloque('var WMM_G=[', '\n];'),
    bloque('var WMM_H=[', '\n];'),
    bloque('var WMM_DG=[', '\n];'),
    bloque('var WMM_DH=[', '\n];'),
    bloque('var wmmP=[]', '})();'),
    bloque('function wmmDecl(', '\n}'),
  ].join('\n');
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const wmmDecl = new Function(codigo + '\nreturn wmmDecl;')();

// Valores de referencia (NOAA WMM2025, redondeados a 0,01°)
const casos = [
  ['Granada', 37.089, -3.6255, 0.843, 2026.87, 0.68],
  ['Granada 2025', 37.089, -3.6255, 0.843, 2025.0, 0.43],
  ['Granada 2030', 37.089, -3.6255, 0.843, 2030.0, 1.09],
  ['Madrid', 40.4168, -3.7038, 0.65, 2026.0, 0.55],
  ['Londres', 51.5, -0.1, 0, 2026.0, 1.09],
  ['Sídney', -33.87, 151.21, 0, 2026.0, 12.81],
  ['Reikiavik', 64.1, -21.9, 0, 2026.0, -11.25],
  ['Ushuaia', -54.8, -68.3, 0, 2026.0, 11.70],
  ['Ecuador', 0, 0, 0, 2026.0, -3.89],
  ['Alaska', 70, -150, 0.5, 2026.0, 13.72],
];

console.log('\ndeclinación magnética WMM2025');
for (const [nombre, la, lo, h, anio, ref] of casos) {
  const v = wmmDecl(la, lo, h, anio);
  const d = Math.abs(v - ref);
  if (d <= 0.05) ok(nombre + ': ' + v.toFixed(2) + '° (referencia ' + ref.toFixed(2) + '°)');
  else mal(nombre + ': ' + v.toFixed(3) + '°, se esperaba ' + ref.toFixed(2) + '°');
}

// El modelo se interpola con el tiempo: en Granada la declinación crece.
const a = wmmDecl(37.089, -3.6255, 0.843, 2025.0);
const b = wmmDecl(37.089, -3.6255, 0.843, 2030.0);
b > a + 0.5
  ? ok('la variación secular crece de ' + a.toFixed(2) + '° a ' + b.toFixed(2) + '° (2025–2030)')
  : mal('la declinación no crece con los años: ' + a.toFixed(2) + ' → ' + b.toFixed(2));
if (Math.abs(wmmDecl(37.089, -3.6255, 0.843, 2100) - b) < 1e-9) ok('fuera de 2030 se mantiene el último valor del modelo');
else mal('no se limita el modelo a su periodo de validez');

// En España la declinación es pequeña pero positiva (este).
const es = wmmDecl(37.089, -3.6255, 0.843, 2026.87);
es > 0 && es < 2 ? ok('en el sur de España es positiva y pequeña (' + es.toFixed(2) + '°)') : mal('valor raro en España: ' + es);

console.log('');
if (fallos.length) {
  console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
  process.exit(1);
}
console.log('RESULTADO: todo correcto');
