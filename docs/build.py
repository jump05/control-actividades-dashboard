# -*- coding: utf-8 -*-
"""
Lee ../base de datos/*.xlsx y genera data.js para el dashboard simplificado
de Control de Actividades (Mtto / TI).

Logica (simplificada a pedido):
  - Por cada (colaborador, dia) se toma solo la PRIMERA sede reportada ese dia
    en Base_Mtto/Base_TI (la primera fila que aparece para ese dia).
  - Se compara contra la PRIMERA marcacion biometrica real del dia (Entrada 1 /
    dispositivo de entrada 1), no todas las marcaciones del dia.
  - Si el dispositivo de la primera marcacion no corresponde a la sede
    reportada (o no hay marcacion ese dia), el dia cuenta como "incidencia".
  - Dias de ausencia (Vacaciones/Feriado/etc.), fuera del rango de marcaciones,
    sin DNI identificado, o en sedes sin dispositivo biometrico, no se cuentan
    (no se pueden verificar).

Todo el detalle dia-a-dia se exporta en `registros`; el dashboard arma la
tabla resumen, el pivote por sede y el detalle por persona en el cliente,
para que los filtros (mes, persona) sean instantaneos.
"""
import json
import re
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

# palabra(s) clave que identifican de forma unica a cada sede dentro del
# nombre del dispositivo biometrico (evita depender de "Biometrico -" que
# no aparece en todas las variantes, p.ej. "Dasso 5to Piso I"), y su
# abreviado (mismo formato que usa el supervisor en Control de Actividades)
SEDES_REALES = [
    ("La Victoria", "Vic", ["VICTORIA"]),
    ("Colina", "Col", ["COLINA"]),
    ("Faucett", "Fau", ["FAUCETT"]),
    ("Surquillo", "Surq", ["SURQUILLO"]),
    ("Surco", "Sur", ["SURCO"]),
    ("Independencia", "Ind", ["INDEPENDENCIA"]),
    ("San Juan de Lurigancho", "SJL", ["SJL"]),
    ("Dasso", "Dasso", ["DASSO"]),
    ("Santa Anita", "Ani", ["SANTA", "ANITA"]),
    ("San Borja (Eureka)", "Bor", ["SAN", "BORJA"]),
    ("Derby", "Der", ["DERBY"]),
    ("Ate", "Ate", ["ATE"]),
    ("Treneman", "Tre", ["TRENEMAN"]),
    ("El Polo (Eureka)", "Polo", ["POLO"]),
    ("Chorrillos", "Cho", ["CHORRILLOS"]),
    ("San Miguel", "SM", ["MIGUEL"]),
]


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


def sede_real_for_device(device_norm):
    for sede, abrev, kws in SEDES_REALES:
        if all(k in device_norm for k in kws):
            return sede, abrev
    return None, None


def device_matches_sede(sede_friendly, device_norm):
    for sede, abrev, kws in SEDES_REALES:
        if sede == sede_friendly:
            return all(k in device_norm for k in kws)
    return False


# ------------------------------------------------------------------
# 1) MAESTRO
# ------------------------------------------------------------------
wb_m = openpyxl.load_workbook(MAESTRO, data_only=True)

trabajadores = {}
for row in wb_m["Trabajadores"].iter_rows(min_row=2, values_only=True):
    dni, nombre, cargo, area = row[0], row[1], row[2], row[3]
    if not dni:
        continue
    trabajadores[str(dni).strip()] = {"nombre": nombre, "cargo": cargo, "area": area}

alias_to_dni = {}
for row in wb_m["Alias_Colaborador"].iter_rows(min_row=2, values_only=True):
    aliasv, dni = row[0], row[1]
    if not aliasv:
        continue
    alias_to_dni[norm(aliasv)] = str(dni).strip() if dni else None

sedes_info = {}  # abreviado normalizado -> {sede_friendly, tiene_bio}
for row in wb_m["Sedes"].iter_rows(min_row=2, values_only=True):
    abrev, sede, disp, tiene, nota = row[0], row[1], row[2], row[3], row[4]
    if not abrev:
        continue
    sedes_info[norm(abrev)] = {
        "sede": sede,
        "tiene_bio": str(tiene).strip().lower().startswith("s"),
    }

ausencias = set()
for row in wb_m["Ausencias_NoSede"].iter_rows(min_row=2, values_only=True):
    if row[0]:
        ausencias.add(norm(row[0]))

# ------------------------------------------------------------------
# 2) MARCACIONES -> primera marcacion del dia por (dni, fecha)
# ------------------------------------------------------------------
wb_k = openpyxl.load_workbook(MARCACIONES, data_only=True)
ws_k = wb_k["CONTROL REGISTRO DE ASISTENCIA"]

primera_marcacion = {}  # (dni, fecha) -> {marco, device (norm), hora}
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
    device1 = str(row[6]).strip() if row[6] else ""
    marco = horario1 != "----" and entrada1 not in ("---", "")
    primera_marcacion[(dni, fecha)] = {
        "marco": marco,
        "device": norm(device1) if marco else "",
        "hora": entrada1 if marco else None,
    }

MARC_MIN = min(marc_fechas) if marc_fechas else None
MARC_MAX = max(marc_fechas) if marc_fechas else None

# ------------------------------------------------------------------
# 3) BASE_MTTO / BASE_TI -> primera sede reportada por (dni, fecha)
# ------------------------------------------------------------------
wb_c = openpyxl.load_workbook(CONTROL, data_only=True)

primer_reporte = {}


def procesar(sheetname, area_hint):
    ws = wb_c[sheetname]
    for row in ws.iter_rows(min_row=2, values_only=True):
        fecha, mes, colab, unidad, sede_raw = row[1], row[2], row[3], row[4], row[5]
        fecha = to_date(fecha)
        if not colab or fecha is None:
            continue
        alias_key = norm(colab)
        dni = alias_to_dni.get(alias_key)
        key = (dni or alias_key, fecha)
        if key in primer_reporte:
            continue
        primer_reporte[key] = {
            "dni": dni, "alias": colab, "area_hint": area_hint,
            "sede_raw": sede_raw, "unidad": unidad,
        }


procesar("Base_Mtto", "Mantto")
procesar("Base_TI", "TI")

# ------------------------------------------------------------------
# 4) evaluar cada dia -> registros detallados
# ------------------------------------------------------------------
registros = []

for (dni_or_alias, fecha), rep in sorted(primer_reporte.items(), key=lambda x: x[0][1]):
    dni = rep["dni"]
    if not dni or dni not in trabajadores:
        continue

    sede_raw = rep["sede_raw"]
    sede_key = norm(sede_raw)
    es_ausencia = sede_key in ausencias or norm(rep["unidad"]) in ausencias
    if es_ausencia:
        continue
    if MARC_MIN and (fecha < MARC_MIN or fecha > MARC_MAX):
        continue

    info = sedes_info.get(sede_key)
    if not info or not info["tiene_bio"]:
        continue

    mk = primera_marcacion.get((dni, fecha))
    sede_real, sede_real_abrev = (None, None)
    if mk and mk["marco"]:
        sede_real, sede_real_abrev = sede_real_for_device(mk["device"])
        if sede_real is None:
            sede_real = mk["device"].title()
            sede_real_abrev = "Otro"
    confirmado = bool(mk and mk["marco"] and sede_real and device_matches_sede(info["sede"], mk["device"]))

    trab = trabajadores[dni]
    registros.append({
        "dni": dni,
        "personal": trab["nombre"],
        "area": trab["area"],
        "fecha": fecha.isoformat(),
        "mes": fecha.month,
        "mesLabel": MESES_ES[fecha.month].capitalize(),
        "hora": mk["hora"] if mk else None,
        "sedeFormato": info["sede"],
        "sedeFormatoAbrev": sede_raw,
        "sedeReal": sede_real if mk and mk["marco"] else None,
        "sedeRealAbrev": sede_real_abrev if mk and mk["marco"] else None,
        "status": "correcto" if confirmado else "incorrecto",
    })

# ------------------------------------------------------------------
# 5) salida
# ------------------------------------------------------------------
out = {
    "generatedAt": datetime.now().isoformat(timespec="seconds"),
    "rangoMarcaciones": {
        "min": MARC_MIN.isoformat() if MARC_MIN else None,
        "max": MARC_MAX.isoformat() if MARC_MAX else None,
    },
    "registros": registros,
}

version = datetime.now().strftime("%Y%m%d%H%M%S")
js = "const DASH_DATA = " + json.dumps(out, ensure_ascii=False, indent=None) + ";\n"
(HERE / "data.js").write_text(js, encoding="utf-8")

idx_path = HERE / "index.html"
if idx_path.exists():
    html = idx_path.read_text(encoding="utf-8")
    html = re.sub(r'(data\.js|app\.js)\?v=\d+', lambda m: f"{m.group(1)}?v={version}", html)
    idx_path.write_text(html, encoding="utf-8")

correctos = sum(1 for r in registros if r["status"] == "correcto")
print(f"OK -> {len(registros)} dia-registros, {correctos} correctos, {len(registros)-correctos} incorrectos")
print(f"Rango marcaciones: {MARC_MIN} a {MARC_MAX}")
print(f"data.js escrito, version {version}")
