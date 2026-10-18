/**
 * Node 层（目录/路径/缓存）冒烟测试：node test/nodeapi.test.js
 * 在纯 Node 里用最小 window 桩加载 cep.js + nodeapi.js。
 */
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
global.AWB = {};
window.AWB = global.AWB;
global.AWB.core = require(path.join(__dirname, '..', 'client', 'js', 'core.js'));
require(path.join(__dirname, '..', 'client', 'js', 'cep.js'));
require(path.join(__dirname, '..', 'client', 'js', 'nodeapi.js'));
const node = global.AWB.node;

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ok   ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name + (extra ? '  -> ' + extra : ''));
  }
}
function eq(name, a, b) {
  check(name, a === b, 'actual=' + JSON.stringify(a) + ' expected=' + JSON.stringify(b));
}

console.log('node 可用:', node.available());
check('Node 层可用', node.available());

/* 1. fileUrl 编码 */
eq('fileUrl 空格与中文', node.fileUrl('D:\\ae\\a b\\中文.png'), 'file:///D:/ae/a%20b/%E4%B8%AD%E6%96%87.png');
eq('fileUrl 普通路径', node.fileUrl('D:\\ae\\x.mp4'), 'file:///D:/ae/x.mp4');

/* 2. 目录读取 */
const res = node.listDir('D:\\ae');
check('listDir D:\\ae', res.ok, res.error);
if (res.ok) {
  eq('D:\\ae 的上级是 D:\\', res.parent, 'D:\\');
  const names = res.entries.map((e) => e.name);
  check('包含工作区目录', names.indexOf('ae文件脚本') >= 0, names.slice(0, 6).join(','));
  const dir = res.entries.filter((e) => e.isDir)[0];
  check('文件夹有类型标签', !!dir && dir.typeLabel === '文件夹', dir && dir.typeLabel);
}
const bad = node.listDir('D:\\这个目录不存在_测试');
check('不存在的目录返回 ok:false', !bad.ok && !!bad.error);

/* 3. 文本读取 */
const sample = 'D:\\ae\\bei-ae-creative-assistance\\AE学习工作台\\测试报告.json';
if (node.exists(sample)) {
  const r = node.readText(sample, 4096);
  check('readText 小文件', r.ok && r.text.length > 0, r.error);
} else {
  console.log('  (跳过 readText：样本文件不存在)');
}

/* 4. JSON 读写 */
const tmpDir = path.join(__dirname, '_tmp');
node.ensureDir(tmpDir);
const tmpFile = path.join(tmpDir, 'roundtrip.json');
const w = node.writeJSON(tmpFile, { a: 1, 中文: '值' });
check('writeJSON', w.ok, w.error);
const back = node.readJSON(tmpFile, null);
check('readJSON 往返', back && back.a === 1 && back['中文'] === '值');
try {
  fs.unlinkSync(tmpFile);
  fs.rmdirSync(tmpDir);
} catch (e) {
  /* ignore */
}

/* 5. 递归扫描 */
const root = 'D:\\ae\\bei-ae-creative-assistance\\AE学习工作台\\resources\\app';
if (node.exists(root)) {
  let count = 0;
  let doneSeen = false;
  node.walk(
    root,
    function (batch, total, done) {
      count += batch.length;
      if (done) doneSeen = true;
    },
    { maxFiles: 5000 }
  );
  // walk 是异步的（setTimeout 分批），给它一点时间
  setTimeout(function () {
    check('walk 扫到文件', count > 5, 'count=' + count);
    check('walk 回调 done', doneSeen);
    /* 6. 数据目录 */
    check('dataDir 结尾', /AE-Asset-Workbench$/.test(node.dataDir()), node.dataDir());
    /* 7. ffmpeg 探测 */
    const ff = node.ffmpegPath();
    check('ffmpeg 探测有结果', !!ff, 'ff=' + ff);
    console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
    process.exit(fail ? 1 : 0);
  }, 800);
} else {
  console.log('  (跳过 walk：样本目录不存在)');
  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
}

