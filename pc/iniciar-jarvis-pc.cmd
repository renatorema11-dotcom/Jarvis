@echo off
rem Liga o Jarvis PC: o Jarvis passa a controlar o computador e as duas palmas abrem a conversa.
rem Abre uma janela minimizada "Jarvis PC"; feche essa janela para desligar.
cd /d "%~dp0"
set "PY=%USERPROFILE%\jarvis\OpenJarvis\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=py"
if "%PY%"=="py" (start "Jarvis PC" /min py -3 -u jarvis-pc.py) else (start "Jarvis PC" /min "%PY%" -u jarvis-pc.py)
