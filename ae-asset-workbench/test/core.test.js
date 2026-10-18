/**
 * 纯逻辑层回归测试：node test/core.test.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const core = require(path.join(__dirname, '..', 'client', 'js', 'core.js'));

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
function eq(name, actual, expected) {
  check(name, actual === expected, 'actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
}

/* 1. 资料库解析 */
const dataPath = 'D:\\ae\\bei-ae-creative-assistance\\AE学习工作台\\resources\\app\\data.js';
let lib = null;
try {
  lib = core.parseEffectData(fs.readFileSync(dataPath, 'utf8'), dataPath);
} catch (e) {
  console.log('  (跳过真实 data.js 解析: ' + e.message + ')');
}
if (lib) {
  eq('解析条目总数 951', lib.total, 951);
  eq('分类数 13', lib.categories.length, 13);
  const aeCat = lib.categories.filter((c) => c.id === 'ae')[0];
  eq('AE 自带条目 114', aeCat.sections.reduce((a, s) => a + s.items.length, 0), 114);
  const flat = core.flattenLibrary(lib);
  check('摊平行数 >= 951', flat.length >= 951, flat.length);
  const ramp = flat.filter((r) => r.name === '梯度渐变')[0];
  check('拆分多名称条目：梯度渐变单独成行', !!ramp);
  check('四色渐变单独成行', flat.some((r) => r.name === '四色渐变'));
  check('快捷键条目 kind=shortcut', flat.filter((r) => r.catId === 'shortcut').every((r) => r.kind === 'shortcut'));
  check('组合条目 kind=combo', flat.filter((r) => r.catId === 'combo').every((r) => r.kind === 'combo'));
}

/* 2. 名称拆分 */
eq('splitNames 顿号', core.splitNames('梯度渐变、四色渐变').length, 2);
eq('splitNames 斜杠', core.splitNames('雨/雪').length, 2);
eq('splitNames 单个', core.splitNames('发光').length, 1);

/* 3. 匹配 */
const installed = [
  { displayName: '高斯模糊', matchName: 'ADBE Gaussian Blur 2', category: 'Blur & Sharpen' },
  { displayName: '梯度渐变', matchName: 'ADBE Ramp', category: 'Generate' },
  { displayName: 'CC Light Sweep', matchName: 'CC Light Sweep', category: 'Generate' },
  { displayName: '发光', matchName: 'ADBE Glo2', category: 'Stylize' },
];
eq('精确匹配中文名', core.matchEffectName('高斯模糊', installed).matchName, 'ADBE Gaussian Blur 2');
eq('精确匹配英文名', core.matchEffectName('CC Light Sweep', installed).matchName, 'CC Light Sweep');
eq('括号干扰也能匹配', core.matchEffectName('高斯模糊（Blur）', installed).matchName, 'ADBE Gaussian Blur 2');
check('完全不认识的名字返回 null', core.matchEffectName('不存在的效果xyz', installed) === null);
const bound = core.matchEffectName('我的自定义发光', installed, { 我的自定义发光: 'ADBE Glo2' });
check('手工绑定优先', bound && bound.matchName === 'ADBE Glo2' && bound.method === 'bind');
check('编辑距离兜底', (core.matchEffectName('高斯摸糊', installed) || {}).matchName === 'ADBE Gaussian Blur 2');

/* 资料库里「高斯、径向、定向模糊」这种缩写拆出来的 2 字名，靠前缀匹配 */
const prefixInstalled = [
  { displayName: '高斯模糊', matchName: 'ADBE Gaussian Blur 2', category: 'Blur' },
  { displayName: '径向模糊', matchName: 'ADBE Radial Blur', category: 'Blur' },
];
eq('2 字前缀匹配（高斯 → 高斯模糊）', core.matchEffectName('高斯', prefixInstalled).matchName, 'ADBE Gaussian Blur 2');
eq('2 字前缀匹配（径向 → 径向模糊）', core.matchEffectName('径向', prefixInstalled).matchName, 'ADBE Radial Blur');
/* 「CC Cross Blur（十字模糊）」这种英文+括号写法，靠反包含匹配 */
const ccInstalled = [{ displayName: 'CC 十字模糊', matchName: 'CC Cross Blur', category: 'Blur' }];
eq('英文+括号 → matchName 反包含', core.matchEffectName('CC Cross Blur（十字模糊）', ccInstalled).matchName, 'CC Cross Blur');

/* 4. 文件分类 */
eq('aep 识别', core.classify('a.aep').kind, 'aep');
eq('mp4 识别', core.classify('a.mp4').kind, 'video');
eq('文件夹识别', core.classify('素材', true).kind, 'folder');
eq('未知扩展', core.classify('a.xyz').kind, 'other');
check('图片序列 xxx_0001.png', core.isImageSequence('镜头_0001.png'));
check('非序列 a.png', !core.isImageSequence('a.png'));
check('序列 exr', core.isImageSequence('beauty_12.exr'));

/* 5. 格式化与排序 */
eq('formatBytes 1024', core.formatBytes(1024), '1.0 KB');
eq('formatBytes 1536', core.formatBytes(1536), '1.5 KB');
eq('formatBytes 0', core.formatBytes(0), '0 B');
const sorted = core.sortEntries(
  [
    { name: 'b.png', isDir: false, size: 10, mtime: 2 },
    { name: 'a.png', isDir: false, size: 20, mtime: 1 },
    { name: 'z文件夹', isDir: true, size: 0, mtime: 3 },
  ],
  'name',
  'asc'
);
eq('文件夹排在最前', sorted[0].name, 'z文件夹');
eq('名称排序', sorted[1].name, 'a.png');
const bySize = core.sortEntries(
  [
    { name: 'b', isDir: false, size: 10, mtime: 1 },
    { name: 'a', isDir: false, size: 30, mtime: 2 },
  ],
  'size',
  'desc'
);
eq('按大小倒序', bySize[0].name, 'a');

/* 6. 名称归一 */
eq('normalizeName 去空格星号', core.normalizeName(' 发光 * Glow '), '发光glow');
eq('levenshtein 相同', core.levenshtein('abc', 'abc'), 0);
eq('levenshtein 替换', core.levenshtein('abc', 'abd'), 1);

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);

