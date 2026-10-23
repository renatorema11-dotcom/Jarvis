@echo off
rem Liga o Jarvis PC: o Jarvis passa a controlar o computador e as duas palmas abrem a conversa.
rem Usa o Python do OpenJarvis (que ja tem numpy e sounddevice para as palmas) se existir.
cd /d "%~dp0"
set "PY=%USERPROFILE%\jarvis\OpenJarvis\.venv\Scripts\pythonw.exe"
if exist "%PY%" (
  start "" "%PY%" "jarvis-pc.py"
) else (
  start "" pyw -3 "jarvis-pc.py"
)
