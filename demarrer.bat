@echo off
chcp 65001 >nul
title La cible du formateur - demarrage
cd /d "%~dp0"

echo Verification de PostgreSQL sur le port 5432...
powershell -NoProfile -Command "if(-not (Test-NetConnection localhost -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue)){exit 1}"
if errorlevel 1 (
  echo [ATTENTION] PostgreSQL ne repond pas sur localhost:5432. Demarrez le service PostgreSQL puis relancez.
  pause
  exit /b 1
)

echo Application des migrations en attente...
pushd backend
call npx prisma migrate deploy
popd

start "Backend - La cible" cmd /k "cd /d %~dp0backend && npm run start:dev"
start "Frontend - La cible" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Ouverture du navigateur dans 15 secondes...
timeout /t 15 >nul
start http://localhost:5173
