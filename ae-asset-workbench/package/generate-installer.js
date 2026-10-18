'use strict';
const fs = require('fs');

const payload = fs.readFileSync('release/payload.zip');
let out = [
  '// Auto-generated payload for AE Asset Workbench installer',
  '#include <windows.h>',
  '#include <stdio.h>',
  '#include <stdlib.h>',
  '#include <string.h>',
  '#include <wchar.h>',
  'static const unsigned char payload[] = {',
];
for (let i = 0; i < payload.length; i++) {
  if (i % 16 === 0) out.push('');
  out[out.length - 1] += `0x${payload[i].toString(16).padStart(2, '0')},`;
}
out.push(
  '};',
  'static const size_t payload_len = sizeof(payload);',
  'int wmain(void) {',
  '  wchar_t temp[MAX_PATH], dir[MAX_PATH], zip[MAX_PATH], ps[MAX_PATH], cmd[4096];',
  '  DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", temp, MAX_PATH);',
  '  if (!n || n >= MAX_PATH - 8) { n = GetTempPathW(MAX_PATH, temp); if (!n || n >= MAX_PATH) return 2; }',
  "  else { size_t len = wcslen(temp); if (len && temp[len - 1] != L'\\\\') wcscat(temp, L\"\\\\\"); wcscat(temp, L\"Temp\\\\\"); }",
  '  _snwprintf(dir, sizeof(dir) / sizeof(dir[0]), L"%lsAEAssetWorkbenchSetup_%lu", temp, (unsigned long)GetTickCount());',
  '  if (!CreateDirectoryW(dir, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) { fwprintf(stderr, L"无法创建临时目录: %ls\\n", dir); return 3; }',
  '  _snwprintf(zip, sizeof(zip) / sizeof(zip[0]), L"%ls\\\\payload.zip", dir);',
  '  FILE *f = _wfopen(zip, L"wb");',
  '  if (!f) { fwprintf(stderr, L"无法写入载荷: %ls\\n", zip); return 3; }',
  '  fwrite(payload, 1, payload_len, f);',
  '  fclose(f);',
  '  _snwprintf(ps, sizeof(ps) / sizeof(ps[0]), L"%ls\\\\run.ps1", dir);',
  '  FILE *s = _wfopen(ps, L"wb");',
  '  if (!s) return 4;',
  '  fputs("$zip=$env:AE_PAYLOAD_ZIP\\n$dir=$env:AE_SETUP_DIR\\nExpand-Archive -LiteralPath $zip -DestinationPath $dir -Force\\n$installer=Join-Path $dir \'AEAssetWorkbench\\\\install.ps1\'\\nif ($env:AE_INSTALL_TARGET) { & $installer -Force -NoDebugMode -TargetPath $env:AE_INSTALL_TARGET } else { & $installer -Force }\\nexit $LASTEXITCODE\\n", s);',
  '  fclose(s);',
  '  SetEnvironmentVariableW(L"AE_PAYLOAD_ZIP", zip);',
  '  SetEnvironmentVariableW(L"AE_SETUP_DIR", dir);',
  '  _snwprintf(cmd, sizeof(cmd) / sizeof(cmd[0]), L"powershell.exe -NoProfile -ExecutionPolicy Bypass -File \\\"%ls\\\"", ps);',
  '  int rc = _wsystem(cmd);',
  '  DeleteFileW(ps);',
  '  DeleteFileW(zip);',
  '  RemoveDirectoryW(dir);',
  '  return rc;',
  '}',
  '',
);
fs.writeFileSync('package/installer_main.c', out.join('\n'), 'utf8');
console.log(JSON.stringify({payloadBytes: payload.length, sourceBytes: Buffer.byteLength(out.join('\n'))}));

