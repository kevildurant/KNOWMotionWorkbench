<#
  AE 资源工作台 —— 安装脚本
  把面板复制到 CEP 扩展目录，并确保调试模式已开启（HKCU，无需管理员）。
  用法：
    pwsh -File install.ps1
    pwsh -File install.ps1 -Force            # 覆盖安装，不再提示
    pwsh -File install.ps1 -TargetPath D:\tmp\test   # 只装到指定目录（测试用）
#>
param(
  [string]$TargetPath = (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.ae.assetworkbench'),
  [switch]$NoDebugMode,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
if (-not $src) { $src = (Get-Location).Path }

Write-Host '=====================================' -ForegroundColor Cyan
Write-Host ' AE 资源工作台 安装' -ForegroundColor Cyan
Write-Host '=====================================' -ForegroundColor Cyan
Write-Host "源目录  : $src"
Write-Host "目标目录: $TargetPath"

# 1. 检查必要文件
$required = @('CSXS\manifest.xml', 'client\index.html', 'host\host.jsx', 'data\effects-library.json')
foreach ($r in $required) {
  if (-not (Test-Path (Join-Path $src $r))) {
    throw "缺少必要文件：$r（请在完整的面板目录里运行本脚本）"
  }
}

# 2. 校验 manifest
try {
  [xml]$xml = Get-Content -LiteralPath (Join-Path $src 'CSXS\manifest.xml') -Raw -Encoding UTF8
  $bundle = $xml.ExtensionManifest.ExtensionBundleId
  Write-Host "manifest: $bundle  OK" -ForegroundColor Green
} catch {
  throw "manifest.xml 解析失败：$($_.Exception.Message)"
}

# 3. 复制
if (Test-Path $TargetPath) {
  if (-not $Force) {
    Write-Host '目标目录已存在，覆盖安装…' -ForegroundColor Yellow
  }
  Remove-Item -LiteralPath $TargetPath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $TargetPath | Out-Null

$copyItems = @('CSXS', 'client', 'host', 'data', '说明.md', '自测清单.md')
foreach ($item in $copyItems) {
  $p = Join-Path $src $item
  if (Test-Path $p) {
    Copy-Item -LiteralPath $p -Destination $TargetPath -Recurse -Force
  }
}
$copied = (Get-ChildItem -LiteralPath $TargetPath -Recurse -File | Measure-Object).Count
Write-Host "已复制 $copied 个文件" -ForegroundColor Green

# 复制后立即核对关键文件，避免权限或旧缓存导致“安装完成”但实际仍是旧代码。
$verifyFiles = @('CSXS\manifest.xml', 'client\index.html', 'client\js\core.js', 'client\js\app.js', 'host\host.jsx')
foreach ($vf in $verifyFiles) {
  $sourceFile = Join-Path $src $vf
  $targetFile = Join-Path $TargetPath $vf
  if (-not (Test-Path -LiteralPath $targetFile)) {
    throw "安装校验失败：目标文件不存在：$vf"
  }
  $sourceHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
  $targetHash = (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
  if ($sourceHash -ne $targetHash) {
    throw "安装校验失败：文件内容不一致：$vf"
  }
}
Write-Host '关键文件校验通过（manifest / index / core / app / host）' -ForegroundColor Green

# 4. 调试模式（未签名面板必须）
if (-not $NoDebugMode) {
  $fixed = 0
  foreach ($v in 9, 10, 11, 12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) {
      New-Item -Path $key -Force | Out-Null
    }
    $cur = $null
    try { $cur = (Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction Stop).PlayerDebugMode } catch { $cur = $null }
    if ($cur -ne '1') {
      New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
      $fixed++
      Write-Host "CSXS.$v PlayerDebugMode -> 1" -ForegroundColor Green
    } else {
      Write-Host "CSXS.$v PlayerDebugMode 已是 1" -ForegroundColor DarkGray
    }
  }
  $missingDebug = @()
  foreach ($v in 9, 10, 11, 12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    try {
      $actual = [string](Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction Stop).PlayerDebugMode
      if ($actual -ne '1') { $missingDebug += "CSXS.$v=$actual" }
    } catch {
      $missingDebug += "CSXS.$v=缺失"
    }
  }
  if ($missingDebug.Count) {
    throw "CEP 调试模式写入后校验失败：$($missingDebug -join ', ')。请用当前登录用户运行 PowerShell，再重试。"
  }
}

# 5. 提示
Write-Host ''
Write-Host '安装完成，接下来：' -ForegroundColor Cyan
Write-Host '  1) 完全退出 After Effects（不是最小化）'
Write-Host '  2) 重新打开 AE，打开任意工程/合成'
Write-Host '  3) 菜单：窗口(Window) > 扩展(Extensions) > AE 资源工作台'
Write-Host '  4) 首次打开默认源库是 D:\ae 和桌面，可在左侧 ＋ 添加自己的文件夹'
Write-Host ''
Write-Host "数据目录（设置/缓存/自定义效果）: $env:APPDATA\AE-Asset-Workbench" -ForegroundColor DarkGray
Write-Host '卸载：运行 uninstall.ps1' -ForegroundColor DarkGray

