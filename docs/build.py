# -*- coding: utf-8 -*-
"""
Lee ../base de datos/*.xlsx y genera data.js (tabla de hechos + diccionarios)
para el dashboard de Control de Actividades (Mtto / TI).

Cruce: cada fila de actividad reportada por el supervisor (Base_Mtto / Base_TI)
se cruza contra las marcaciones biometricas reales del mismo DNI + fecha, y
contra la sede reportada (via el mapeo Sedes -> dispositivo biometrico).
"""
import json
import re
import sys
import unicodedata
from datetime import datetime, date
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
DB = HERE.parent / "base de datos"
MAESTRO = DB / "Maestro Control Actividades.xlsx"
MARCACIONES = DB / "MARCACIONES INFRA-MMTTO-TI.xlsx"
CONTROL = DB / "Control de actividades - Mtto y TI.xlsx"

MESES_ES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
            "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def norm(s):
    if s is None:
        return ""
    s = str(s).strip()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return s.upper()


def to_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


# ------------------------------------------------------------------
# 1) MAESTRO
# ------------------------------------------------------------------
wb_m = openpyxl.load_workbook(MAESTRO, data_only=True)

trabajadores = {}  # dni -> {nombre, cargo, area}
for row in wb_m["Trabajadores"].iter_rows(min_row=2, values_only=True):
    dni, nombre, cargo, area = row[0], row[1], row[2], row[3]
    if not dni:
        continue
    trabajadores[str(dni).strip()] = {
        "nombre": nombre, "cargo": cargo, "area": area
    }

alias_to_dni = {}  # nombre normalizado (tal cual Control Actividades) -> dni
for row in wb_m["Alias_Colaborador"].iter_rows(min_row=2, values_only=True):
    aliasv, dni = row[0], row[1]
    if not aliasv:
        continue
    alias_to_dni[norm(aliasv)] = str(dni).strip() if dni else None

sedes = {}  # abreviado normalizado -> {sede, dispositivo, tiene_bio}
for row in wb_m["Sedes"].iter_rows(min_row=2, values_only=True):
    abrev, sede, disp, tiene, nota = row[0], row[1], row[2], row[3], row[4]
    if not abrev:
        continue
    sedes[norm(abrev)] = {
        "sede": sede,
        "dispositivo": norm(disp) if disp else "",
        "tiene_bio": str(tiene).strip().lower().startswith("s"),
    }

ausencias = set()  # codigos que NO son sede (Vacaciones, Feriado, etc.)
for row in wb_m["Ausencias_NoSede"].iter_rows(min_row=2, values_only=True):
    if row[0]:
        ausencias.add(norm(row[0]))

# ------------------------------------------------------------------
# 2) MARCACIONES -> indice por (dni, fecha)
# ------------------------------------------------------------------
wb_k = openpyxl.load_workbook(MARCACIONES, data_only=True)
ws_k = wb_k["CONTROL REGISTRO DE ASISTENCIA"]

DISP_COLS = [6, 8, 10, 12, 14, 16, 17, 19, 21]  # columnas "Nombre de dispositivo ..."
marc_idx = {}  # (dni, fecha) -> {marco: bool, dispositivos:set, incidencia:str, falta:str}
marc_fechas = []

for row in ws_k.iter_rows(min_row=2, values_only=True):
    fecha = to_date(row[0])
    if fecha is None:
        continue
    dni = str(row[1]).strip() if row[1] else None
    if not dni:
        continue
    marc_fechas.append(fecha)
    horario1 = str(row[4]).strip() if row[4] else "----"
    entrada1 = str(row[5]).strip() if row[5] else "---"
    marco = horario1 != "----" and entrada1 not in ("---", "")
    dispositivos = set()
    for ci in DISP_COLS:
        if ci < len(row) and row[ci] and str(row[ci]).strip() not in ("---", ""):
            dispositivos.add(norm(row[ci]))
    incidencia = str(row[25]).strip() if len(row) > 25 and row[25] else "----"
    falta = str(row[24]).strip() if len(row) > 24 and row[24] else "----"
    marc_idx[(dni, fecha)] = {
        "marco": marco, "dispositivos": dispositivos,
        "incidencia": incidencia, "falta": falta,
    }

MARC_MIN = min(marc_fechas) if marc_fechas else None
MARC_MAX = max(marc_fechas) if marc_fechas else None


def device_matches(sede_key, dispositivos):
    info = sedes.get(sede_key)
    if not info or not info["dispositivo"]:
        return False
    dev_tokens = [t for t in re.split(r"[^A-Z0-9]+", info["dispositivo"]) if len(t) > 2]
    for d in dispositivos:
        if all(tok in d for tok in dev_tokens):
            return True
    return False


# ------------------------------------------------------------------
# 3) BASE_MTTO / BASE_TI -> filas de actividad cruzadas
# ------------------------------------------------------------------
wb_c = openpyxl.load_workbook(CONTROL, data_only=True)

registros = []
rid = 0


def procesar(sheetname, area_hint):
    global rid
    ws = wb_c[sheetname]
    for row in ws.iter_rows(min_row=2, values_only=True):
        fecha, mes, colab, unidad, sede_raw, detalle, horas = row[1], row[2], row[3], row[4], row[5], row[6], row[7]
        fecha = to_date(fecha)
        if not colab or fecha is None:
            continue
        rid += 1
        alias_key = norm(colab)
        dni = alias_to_dni.get(alias_key)
        trab = trabajadores.get(dni) if dni else None

        sede_key = norm(sede_raw)
        es_ausencia = sede_key in ausencias or norm(unidad) in ausencias
        sede_info = sedes.get(sede_key)

        estado = None
        detalle_estado = ""

        if not dni or not trab:
            estado = "sin_dni"
            detalle_estado = "Colaborador no identificado en la tabla maestra"
        elif MARC_MIN and (fecha < MARC_MIN or fecha > MARC_MAX):
            estado = "fuera_rango"
            detalle_estado = "Fecha fuera del rango cubierto por Marcaciones"
        else:
            mk = marc_idx.get((dni, fecha))
            if es_ausencia:
                if mk and (sede_key in norm(mk["incidencia"]) or norm(mk["incidencia"]) in sede_key
                           or (sede_key == "FALTA" and mk["falta"] == "Falta")
                           or (sede_key in ("VACACIONES",) and "VACACIONES" in norm(mk["incidencia"]))
                           or (sede_key == "FERIADO" and norm(mk["incidencia"]) not in ("----",) and mk["falta"] != "Falta" and mk["incidencia"] != "----")):
                    estado = "ausencia_ok"
                    detalle_estado = f"Incidencia en Marcaciones: {mk['incidencia']}"
                elif mk and mk["marco"]:
                    estado = "ausencia_pero_marco"
                    detalle_estado = "Reportado como ausencia pero SI hay marcacion ese dia"
                else:
                    estado = "ausencia_sin_verificar"
                    detalle_estado = "No se encontro incidencia equivalente en Marcaciones"
            elif not mk or not mk["marco"]:
                estado = "critico_sin_marcacion"
                detalle_estado = "No hay marcacion ese dia para este colaborador"
            else:
                if sede_info and sede_info["tiene_bio"]:
                    if device_matches(sede_key, mk["dispositivos"]):
                        estado = "confirmado"
                        detalle_estado = "Marcacion coincide con la sede reportada"
                    else:
                        estado = "alerta_sede"
                        detalle_estado = "Marco ese dia pero en otra sede"
                else:
                    estado = "no_verificable"
                    detalle_estado = "Sede sin dispositivo biometrico asociado"

        registros.append({
            "id": rid,
            "area": (trab["area"] if trab else area_hint),
            "dni": dni or "",
            "colaborador": trab["nombre"] if trab else colab,
            "alias": colab,
            "cargo": trab["cargo"] if trab else "",
            "fecha": fecha.isoformat(),
            "anio": fecha.year,
            "mes": fecha.month,
            "mesLabel": MESES_ES[fecha.month],
            "sedeCodigo": sede_raw,
            "sede": (sede_info["sede"] if sede_info else sede_raw),
            "detalle": detalle,
            "horas": horas if isinstance(horas, (int, float)) else None,
            "esAusencia": es_ausencia,
            "estado": estado,
            "detalleEstado": detalle_estado,
        })


procesar("Base_Mtto", "Mantto")
procesar("Base_TI", "TI")

# ------------------------------------------------------------------
# 4) salida
# ------------------------------------------------------------------
out = {
    "generatedAt": datetime.now().isoformat(timespec="seconds"),
    "rangoMarcaciones": {
        "min": MARC_MIN.isoformat() if MARC_MIN else None,
        "max": MARC_MAX.isoformat() if MARC_MAX else None,
    },
    "trabajadores": [
        {"dni": dni, **info} for dni, info in trabajadores.items()
    ],
    "registros": registros,
}

version = datetime.now().strftime("%Y%m%d%H%M%S")
js = "const DASH_DATA = " + json.dumps(out, ensure_ascii=False, indent=None) + ";\n"
(HERE / "data.js").write_text(js, encoding="utf-8")

# bump cache-busting version en index.html
idx_path = HERE / "index.html"
if idx_path.exists():
    html = idx_path.read_text(encoding="utf-8")
    html = re.sub(r'(data\.js|app\.js)\?v=\d+', lambda m: f"{m.group(1)}?v={version}", html)
    idx_path.write_text(html, encoding="utf-8")

n = len(registros)
por_estado = {}
for r in registros:
    por_estado[r["estado"]] = por_estado.get(r["estado"], 0) + 1
print(f"OK -> {n} registros procesados, {len(trabajadores)} trabajadores")
for k, v in sorted(por_estado.items(), key=lambda x: -x[1]):
    print(f"   {k}: {v}")
print(f"Rango marcaciones: {MARC_MIN} a {MARC_MAX}")
print(f"data.js escrito, version {version}")
