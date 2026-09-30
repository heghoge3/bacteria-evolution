@echo off
chcp 65001 >nul
rem Запуск «Бактерий» как отдельного окна (Microsoft Edge есть в Windows 11).
set "APP=%~dp0app\index.html"
set "URL=file:///%APP:\=/%"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%" --window-size=1500,900
  exit /b
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app="%URL%" --window-size=1500,900
  exit /b
)

rem Запасной вариант — браузер по умолчанию
start "" "%APP%"
