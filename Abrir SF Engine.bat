@echo off
title SF Engine
cd /d "%~dp0"
rem atualiza sozinho se a pasta veio do GitHub (clone pelo GitHub Desktop ou git)
if exist ".git" (
  where git >nul 2>nul && (
    echo Procurando atualizacoes...
    git pull --ff-only
  )
)
set PY=
where py >nul 2>nul && set PY=py
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY (
  echo Python nao encontrado. Instale em https://www.python.org/downloads/
  echo Marque "Add Python to PATH" na instalacao.
  pause
  exit /b
)
%PY% tools\serve.py 8010
pause
