<#
  AE 资源工作台 —— 卸载脚本
  只删除 CEP 扩展目录，不删除 %APPDATA%\AE-Asset-Workbench 里的个人数据。
  用法：pwsh -File uninstall.ps1 [-RemoveData]
#>
param(
  [string]$TargetPath = (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.ae.assetworkbench'),
  [switch]$RemoveData
)

$ErrorActionPreference = 'Stop'

if (Test-Path $TargetPath) {
  Remove-Item -LiteralPath $TargetPath -Recurse -Force
  Write-Host "已删除面板目录：$TargetPath" -ForegroundColor Green
} else {
  Write-Host "没有找到面板目录：$TargetPath" -ForegroundColor Yellow
}

$dataDir = Join-Path $env:APPDATA 'AE-Asset-Workbench'
if ($RemoveData) {
  if (Test-Path $dataDir) {
    Remove-Item -LiteralPath $dataDir -Recurse -Force
    Write-Host "已删除数据目录：$dataDir" -ForegroundColor Green
  }
} elseif (Test-Path $dataDir) {
  Write-Host "个人数据保留在：$dataDir（需要一并删除请加 -RemoveData）" -ForegroundColor DarkGray
}

Write-Host '重启 After Effects 后，扩展菜单里就不会再出现本面板。' -ForegroundColor Cyan

