#!/usr/bin/env node
/* Prueba de humo en un navegador de verdad.
   Necesita Chrome instalado y puppeteer-core (no se versiona):

     npm install puppeteer-core
     python -m http.server 8765
     node tests/humo.js http://localhost:8765/

   Comprueba que la app arranca sin errores de consola, que carga la base de
   pueblos, que el botón de inicio se habilita y que a 390 px de ancho no hay
   desbordamiento horizontal. Sale con código 1 si algo falla. */
'use strict';

const fs = require('fs');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error('Falta puppeteer-core: ejecuta "npm install puppeteer-core" en la raíz del proyecto.');
  process.exit(2);
}

const url = process.argv[2] || process.env.URL || 'http://127.0.0.1:8765/';

const candidatos = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chrome = candidatos.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('No encuentro Chrome/Edge. Define CHROME_PATH.');
  process.exit(2);
}

const fallos = [];
const ok = (m) => console.log('  OK   ' + m);
const mal = (m) => { console.log('  FALLO ' + m); fallos.push(m); };

(async () => {
  console.log('navegador: ' + chrome);
  console.log('url: ' + url + '\n');

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  try {
    const page = await browser.newPage();
    const errores = [];
    page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
    page.on('pageerror', (e) => errores.push('excepción: ' + e.message));
    page.on('requestfailed', (r) => errores.push('petición fallida: ' + r.url()));

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.evaluate(() => { try { localStorage.setItem('permisosVistos', '1'); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });

    // La portada muestra "Base de datos: 86.359 localidades…" cuando la base está lista
    // (app.js → actualizarConteos). Se espera a ese texto con al menos 80.000 localidades.
    try {
      await page.waitForFunction(
        () => /Base de datos: [\d.]+ localidades/.test((document.getElementById('cnt') || {}).textContent || ''),
        { timeout: 120000 }
      );
      const cnt = await page.evaluate(() => document.getElementById('cnt').textContent);
      const n = parseInt(cnt.match(/Base de datos: ([\d.]+) localidades/)[1].replace(/\./g, ''), 10);
      if (n >= 80000) ok(cnt);
      else mal('la base tiene solo ' + n + ' localidades (se esperan más de 80.000)');
    } catch (e) {
      mal('no aparece el contador de la base de datos (#cnt); ¿falló la carga de data/pueblos.js?');
    }

    const est = await page.evaluate(() => ({
      ancho: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      busy: document.getElementById('go').getAttribute('aria-busy'),
      botonOff: document.getElementById('go').disabled,
      anchoPantalla: window.outerWidth,
    }));
    if (est.scroll <= est.ancho + 1) ok('sin desbordamiento horizontal (' + est.ancho + ' px)');
    else mal('desbordamiento horizontal: scrollWidth ' + est.scroll + ' > ' + est.ancho);
    if (est.busy === 'false' && est.botonOff === false) ok('botón de inicio habilitado');
    else mal('el botón de inicio sigue deshabilitado');

    if (!errores.length) ok('sin errores de consola');
    else errores.slice(0, 5).forEach((e) => mal(e));
  } finally {
    await browser.close();
  }

  console.log('');
  if (fallos.length) {
    console.log('RESULTADO: ' + fallos.length + ' fallo(s)');
    process.exit(1);
  }
  console.log('RESULTADO: todo correcto');
})().catch((e) => { console.error('FALLO: ' + e.message); process.exit(1); });
