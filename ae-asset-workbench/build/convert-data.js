/**
 * 把「AE学习工作台」的 data.js 转成面板可直接加载的 effects-library.json。
 * 用法: node build/convert-data.js [源data.js路径] [输出路径]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require(path.join(__dirname, '..', 'client', 'js', 'core.js'));

const DEFAULT_SRC = 'D:\\ae\\bei-ae-creative-assistance\\AE学习工作台\\resources\\app\\data.js';
const src = process.argv[2] || DEFAULT_SRC;
const out = process.argv[3] || path.join(__dirname, '..', 'data', 'effects-library.json');

const raw = fs.readFileSync(src, 'utf8');
const library = core.parseEffectData(raw, src);
fs.writeFileSync(out, JSON.stringify(library, null, 2), 'utf8');

console.log('OK ' + out);
console.log('categories=' + library.categories.length + ' items=' + library.total);
for (const c of library.categories) {
  const n = c.sections.reduce((a, s) => a + s.items.length, 0);
  console.log('  ' + c.id + '\t' + c.label + '\t' + n);
}

