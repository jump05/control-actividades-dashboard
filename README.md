# Control de Actividades — Mantenimiento & TI

Dashboard que cruza el **Control de Actividades** (formato que llena cada supervisor) contra las
**marcaciones biométricas** reales, para confirmar que el colaborador estuvo ese día en la sede
que declaró.

- Fuente de datos: `base de datos/Maestro Control Actividades.xlsx` (editable, no se sube al repo)
  + los dos archivos originales (Marcaciones, Control de Actividades).
- `docs/build.py` lee esos tres archivos y genera `docs/data.js` (tabla de hechos).
- `docs/index.html` + `docs/app.js` es el dashboard estático (GitHub Pages sirve `docs/`).

## Actualizar el dashboard

1. Reemplaza los archivos en `base de datos/` con las versiones nuevas (mismo nombre).
2. Corre `actualizar.bat` (o `python docs/build.py` + commit + push a mano).

## Cómo se resuelve el cruce

- El nombre que escribe cada supervisor en Base_Mtto/Base_TI se resuelve a un DNI real vía la
  hoja `Alias_Colaborador` del maestro.
- El código de sede abreviado se resuelve a un dispositivo biométrico vía la hoja `Sedes`.
- Categorías de ausencia (Vacaciones, Feriado, Licencia, Falta, Ds compensado) se cruzan contra
  la columna Incidencias/Falta de Marcaciones en vez de contra una sede.
- Estados posibles: confirmado, marcó en otra sede, sin marcación ese día, ausencia confirmada,
  sede sin biométrico (no verificable), colaborador no identificado, fuera de rango de marcaciones.
