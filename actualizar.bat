@echo off
REM === Actualiza el dashboard Control de Actividades ===
REM 1) regenera data.js desde "base de datos\Maestro Control Actividades.xlsx"  2) sube el cambio a GitHub Pages
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: no encuentro Python instalado en esta PC.
  echo Instalalo desde https://python.org y vuelve a intentar.
  pause
  exit /b 1
)

if not exist "base de datos\Maestro Control Actividades.xlsx" (
  echo ERROR: no encuentro "base de datos\Maestro Control Actividades.xlsx"
  echo Copia el Excel actualizado dentro de la carpeta "base de datos" y vuelve a intentar.
  pause
  exit /b 1
)

echo Regenerando datos desde "base de datos\Maestro Control Actividades.xlsx"...
python docs\build.py
if errorlevel 1 (
  echo ERROR al generar los datos. Revisa el mensaje de arriba.
  pause
  exit /b 1
)

echo.
echo Subiendo a GitHub...
git add -A
git commit -m "Actualizar data %date% %time%" >nul 2>nul
git push
if errorlevel 1 (
  echo ERROR al subir a GitHub. Revisa tu conexion o que "gh auth login" siga activo.
  pause
  exit /b 1
)

echo.
echo Listo. En 1-2 minutos el link mostrara la data nueva:
echo https://jump05.github.io/control-actividades-dashboard/
pause
exit /b 0
