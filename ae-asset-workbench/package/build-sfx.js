'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sevenZip = 'C:/Program Files/7-Zip/7z.exe';
const sfx = 'C:/Program Files/7-Zip/7z.sfx';
const release = path.join(root, 'release');
const payload = path.join(release, 'AE资源工作台-payload.7z');
const config = path.join(release, 'AE资源工作台-sfx-config.txt');
const output = path.join(release, 'AE资源工作台安装.exe');

if (!fs.existsSync(sevenZip) || !fs.existsSync(sfx)) throw new Error('未找到 7-Zip SFX 组件');
fs.mkdirSync(release, { recursive: true });

const { spawnSync } = require('child_process');
const pack = spawnSync(sevenZip, ['a', '-t7z', '-mx=9', payload, path.join(root, 'package', 'payload', 'AEAssetWorkbench')], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (pack.status !== 0) throw new Error('创建 payload.7z 失败：' + pack.status);

fs.writeFileSync(
  config,
  ';!@Install@!UTF-8!\n' +
    'Title="AE 资源工作台"\n' +
    'RunProgram="powershell.exe -NoProfile -ExecutionPolicy Bypass -File \\\"AEAssetWorkbench\\\\install.ps1\\\" -Force"\n' +
    ';!@InstallEnd@!\n',
  'utf8',
);

const joined = Buffer.concat([fs.readFileSync(sfx), fs.readFileSync(config), fs.readFileSync(payload)]);
fs.writeFileSync(output, joined);
console.log(JSON.stringify({ output, bytes: joined.length, payload: fs.statSync(payload).size }));

