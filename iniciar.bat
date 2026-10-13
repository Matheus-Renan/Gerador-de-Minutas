@echo off
cd /d "%~dp0"
title Gerador de Minutas - CBMPA
python app.py
if errorlevel 1 pause
