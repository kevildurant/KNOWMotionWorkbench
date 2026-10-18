@echo off
setlocal
set "WORK=%TEMP%\AE-Asset-Workbench-Setup-%RANDOM%"
mkdir "%WORK%" >nul 2>&1
tar -xf "%~dp0payload.zip" -C "%WORK%"
if errorlevel 1 (
  echo 解压安装包失败。
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WORK%\AEAssetWorkbench\install.ps1" -Force
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo 安装失败，错误码 %RC%。
  pause
  exit /b %RC%
)
echo 安装完成。请完全退出并重新打开 After Effects。
pause
exit /b 0

