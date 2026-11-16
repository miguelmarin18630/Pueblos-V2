#!/usr/bin/env python3
"""
generar-relieve.py  ·  Crea data/relieve.bin para "¿Qué pueblo es?"

Qué hace:
  1. Reutiliza (o descarga) las teselas Copernicus DEM GLO-90 de España,
     Baleares, Canarias y los países vecinos.
  2. Las reduce a una malla de 0,005° (~500 m) quedándose con la altura MÁXIMA
     de cada celda (así no se aplanan las crestas).
  3. Guarda un único archivo comprimido, data/relieve.bin, con este formato:

        4 bytes   largo de la cabecera (uint32 little-endian)
        cabecera  JSON  {"s":0.005,"b":[{"n":..,"w":..,"r":..,"c":..}, ...]}
        bytes     diferencias por filas en int16, primero los bytes bajos
        bytes     y después los altos (se comprime mucho mejor así)
        todo      comprimido con zlib (el móvil lo abre con DecompressionStream)

Uso:
    pip install numpy rasterio
    python tools/generar-relieve.py                 # teselas en tools/teselas_dem
    python tools/generar-relieve.py --teselas RUTA  # otra carpeta de teselas
    python tools/generar-relieve.py --validar       # compara con data/picos.js

Las teselas son gratis y no piden registro. Se guardan en tools/teselas_dem
(unos 450 MB) y no se suben al repositorio: solo se sube relieve.bin.
"""

import argparse
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from concurrent.futures import ThreadPoolExecutor

import numpy as np

STEP = 0.005          # grados por celda (~555 m de norte a sur)
MODO = "max"          # "max" conserva las crestas; "mean" suaviza
HILOS = 6

# (nombre, lat_sur, lat_norte, lon_oeste, lon_este)
BLOQUES = [
    ("peninsula_y_baleares", 35, 45, -10, 5),
    ("canarias", 27, 30, -19, -13),
]

URL = ("https://copernicus-dem-90m.s3.eu-central-1.amazonaws.com/"
       "Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/"
       "Copernicus_DSM_COG_30_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "data", "relieve.bin")
TESELAS = os.path.join(RAIZ, "tools", "teselas_dem")

_MAR = set()


def nombre_tesela(lat, lon):
    return "{}{:02d}_{}{:03d}".format("N" if lat >= 0 else "S", abs(lat),
                                      "E" if lon >= 0 else "W", abs(lon))


def url_tesela(lat, lon):
    return URL.format(ns="N" if lat >= 0 else "S", lat=abs(lat),
                      ew="E" if lon >= 0 else "W", lon=abs(lon))


def descargar(lat, lon, carpeta):
    if (lat, lon) in _MAR:
        return None
    ruta = os.path.join(carpeta, nombre_tesela(lat, lon) + ".tif")
    if os.path.exists(ruta) and os.path.getsize(ruta) > 0:
        return ruta
    ultimo = None
    for intento in range(4):
        try:
            with urllib.request.urlopen(url_tesela(lat, lon), timeout=90) as r:
                datos = r.read()
            tmp = ruta + ".tmp"
            with open(tmp, "wb") as f:
                f.write(datos)
            os.replace(tmp, ruta)
            return ruta
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):     # en el mar no hay tesela
                _MAR.add((lat, lon))
                return None
            ultimo = "HTTP %s" % e.code
        except Exception as e:
            ultimo = str(e)
        time.sleep(2 + 3 * intento)
    raise SystemExit("No pude descargar %s: %s" % (nombre_tesela(lat, lon), ultimo))


def leer_tesela(ruta):
    import rasterio
    with rasterio.open(ruta) as ds:
        return ds.read(1).astype(np.float32)


def reducir(a):
    """Reduce una tesela de 1°x1° a las celdas de STEP, con el máximo de cada una."""
    a = np.nan_to_num(a, nan=0.0)
    a[(a < -500) | (a > 9000)] = 0
    n = int(round(1 / STEP))
    fh, fw = int(round(a.shape[0] / n)), int(round(a.shape[1] / n))
    r = a.reshape(n, fh, n, fw)
    r = r.max(axis=(1, 3)) if MODO == "max" else r.mean(axis=(1, 3))
    return np.clip(np.rint(r), -32000, 32000).astype(np.int16)


def construir(nombre, s, n, w, e, carpeta):
    celdas = int(round(1 / STEP))
    filas, cols = (n - s) * celdas, (e - w) * celdas
    arr = np.zeros((filas, cols), dtype=np.int16)
    pedidas = [(lat, lon) for lat in range(s, n) for lon in range(w, e)]
    print("[%s] %d teselas posibles…" % (nombre, len(pedidas)))
    with ThreadPoolExecutor(HILOS) as ex:
        rutas = list(ex.map(lambda t: descargar(t[0], t[1], carpeta), pedidas))
    hechas = 0
    for (lat, lon), ruta in zip(pedidas, rutas):
        if not ruta:
            continue
        blq = reducir(leer_tesela(ruta))
        if blq.shape != (celdas, celdas):
            raise SystemExit("La tesela %s no cuadra con celdas de %s°: %s"
                             % (nombre_tesela(lat, lon), STEP, blq.shape))
        f0 = (n - lat - 1) * celdas
        c0 = (lon - w) * celdas
        arr[f0:f0 + celdas, c0:c0 + celdas] = blq
        hechas += 1
    print("[%s] teselas con datos: %d · celdas %d x %d" % (nombre, hechas, filas, cols))
    if hechas == 0:
        raise SystemExit("No hay teselas de %s: revisa la carpeta." % nombre)
    return {"n": n, "w": w, "arr": arr}


def codificar(bloques):
    """Diferencias por filas + bytes bajos/altos separados + zlib."""
    cab = {"s": STEP, "b": [{"n": b["n"], "w": b["w"],
                             "r": int(b["arr"].shape[0]),
                             "c": int(b["arr"].shape[1])} for b in bloques]}
    partes = []
    for b in bloques:
        a = b["arr"].astype(np.int32)
        d = a.copy()
        d[:, 1:] = a[:, 1:] - a[:, :-1]
        partes.append((d & 0xFFFF).astype(np.uint16).ravel())
    todo = np.concatenate(partes)
    lo = (todo & 255).astype(np.uint8)
    hi = (todo >> 8).astype(np.uint8)
    h = json.dumps(cab, separators=(",", ":")).encode()
    crudo = struct.pack("<I", len(h)) + h + lo.tobytes() + hi.tobytes()
    return zlib.compress(crudo, 9), len(crudo)


def decodificar(crudo):
    """Inverso de codificar (para validar y para el script de comprobación)."""
    hl = struct.unpack("<I", crudo[:4])[0]
    cab = json.loads(crudo[4:4 + hl])
    base = 4 + hl
    total = sum(k["r"] * k["c"] for k in cab["b"])
    lo = np.frombuffer(crudo, np.uint8, total, base).astype(np.uint16)
    hi = np.frombuffer(crudo, np.uint8, total, base + total).astype(np.uint16)
    todo = (hi << 8) | lo
    out, off = [], 0
    for k in cab["b"]:
        d = todo[off:off + k["r"] * k["c"]].reshape(k["r"], k["c"]).astype(np.int64)
        d = np.where(d >= 32768, d - 65536, d)
        out.append(np.cumsum(d, axis=1).astype(np.int16))
        off += k["r"] * k["c"]
    return cab, out


def validar(bloques):
    """Compara la malla con las alturas de los 42.920 picos de data/picos.js."""
    ruta = os.path.join(RAIZ, "data", "picos.js")
    crudo = open(ruta, encoding="utf-8").read()
    ini = crudo.index('"') + 1
    fin = crudo.rindex('"')
    lineas = crudo[ini:fin].replace("\\n", "\n").split("\n")
    errores, fuera, peores = [], 0, []
    for l in lineas:
        if not l.strip():
            continue
        p = l.split("|")
        if len(p) < 4:
            continue
        la, lo, nom, ele = float(p[0]), float(p[1]), p[2], float(p[3])
        v = None
        for b in bloques:
            k = b["arr"]
            s = STEP
            fi = (b["n"] - la) / s - 0.5
            fj = (lo - b["w"]) / s - 0.5
            if fi < 0 or fj < 0 or fi > k.shape[0] - 1 or fj > k.shape[1] - 1:
                continue
            v = int(k[int(round(fi)), int(round(fj))])
            break
        if v is None:
            fuera += 1
            continue
        errores.append(v - ele)
        peores.append((abs(v - ele), nom, int(ele), v))
    e = np.array(errores)
    print("\nValidación contra data/picos.js")
    print("  picos comprobados: %d · fuera de la malla: %d" % (len(e), fuera))
    print("  error medio: %+.0f m · error absoluto medio: %.0f m" % (e.mean(), np.abs(e).mean()))
    print("  percentiles del error absoluto: p50 %.0f m · p90 %.0f m · p99 %.0f m"
          % tuple(np.percentile(np.abs(e), [50, 90, 99])))
    print("  dentro de ±50 m: %.0f%% · dentro de ±100 m: %.0f%% · dentro de ±200 m: %.0f%%"
          % (100 * np.mean(np.abs(e) <= 50), 100 * np.mean(np.abs(e) <= 100),
             100 * np.mean(np.abs(e) <= 200)))
    peores.sort(reverse=True)
    print("  peores casos:")
    for d, nom, ele, v in peores[:8]:
        print("    %-32s OSM %4d m · malla %4d m · %+d m" % (nom[:32], ele, v, v - ele))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teselas", default=TESELAS)
    ap.add_argument("--salida", default=SALIDA)
    ap.add_argument("--validar", action="store_true")
    a = ap.parse_args()
    try:
        import rasterio  # noqa: F401
    except ImportError:
        raise SystemExit("Falta rasterio:  pip install numpy rasterio")
    os.makedirs(a.teselas, exist_ok=True)
    bloques = [construir(*b, carpeta=a.teselas) for b in BLOQUES]
    print("\nComprimiendo…")
    datos, crudo = codificar(bloques)
    cab, dec = decodificar(zlib.decompress(datos))
    for orig, d in zip(bloques, dec):
        if not np.array_equal(orig["arr"], d):
            raise SystemExit("El archivo generado no coincide con los datos (error interno).")
    os.makedirs(os.path.dirname(a.salida), exist_ok=True)
    with open(a.salida, "wb") as f:
        f.write(datos)
    print("Listo: %s" % a.salida)
    print("  sin comprimir: %.2f MB · archivo: %.2f MB (%.0f%%)"
          % (crudo / 1e6, len(datos) / 1e6, 100 * len(datos) / crudo))
    print("  cabecera: %s" % json.dumps(cab, separators=(",", ":")))
    if a.validar:
        validar(bloques)


if __name__ == "__main__":
    main()
