@echo off
setlocal
cd /d "%~dp0"
title Efekti lijekova
set "URL=http://127.0.0.1:8000"
set "PY=.venv\Scripts\python.exe"

netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Aplikacija vec radi: %URL%
  if not defined EFEKTI_BEZ_BROWSERA start "" "%URL%"
  exit /b 0
)

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python nije instaliran na ovom racunaru.
  echo Instalirajte ga sa https://www.python.org/downloads/
  echo i pri instalaciji oznacite "Add python.exe to PATH", pa ponovo pokrenite start.bat.
  goto :fail
)

if not exist "%PY%" (
  echo Pripremam Python okruzenje ^(samo prvi put^)...
  python -m venv .venv
  if errorlevel 1 goto :fail
)

fc /b requirements.txt ".venv\requirements.installed" >nul 2>nul
if errorlevel 1 (
  echo Instaliram potrebne pakete, ovo moze potrajati minut-dva...
  "%PY%" -m pip install --disable-pip-version-check -q -r requirements.txt
  if errorlevel 1 (
    echo Instalacija paketa nije uspjela. Provjerite internet vezu.
    goto :fail
  )
  copy /y requirements.txt ".venv\requirements.installed" >nul
)

if not exist "frontend\dist\index.html" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo.
    echo Nedostaje folder frontend\dist ^(izgradjeni interfejs^).
    echo Preuzmite ponovo cijeli projekat ili instalirajte Node.js sa https://nodejs.org/
    goto :fail
  )
  echo Gradim interfejs ^(samo prvi put^)...
  pushd frontend
  call npm install --no-audit --no-fund
  if errorlevel 1 ( popd & goto :fail )
  call npm run build
  if errorlevel 1 ( popd & goto :fail )
  popd
)

echo.
echo  Aplikacija: %URL%
echo  Ostavite ovaj prozor otvoren dok radite.
echo  Aplikacija se sama ugasi kad zatvorite njenu karticu u browseru.
echo  ^(Moze i rucno: zatvorite ovaj prozor ili pritisnite Ctrl+C.^)
echo.
if not defined EFEKTI_BEZ_BROWSERA start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" %URL%"
set "EFEKTI_AUTO_GASENJE=1"
"%PY%" -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
exit /b 0

:fail
echo.
echo Pokretanje nije uspjelo.
pause
exit /b 1
