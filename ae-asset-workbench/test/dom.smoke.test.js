/**
 * 前端冒烟测试：用极简 DOM 桩在 Node 里跑一遍面板启动流程，
 * 捕获初始化阶段的 ReferenceError / TypeError，并检查数据是否装载。
 * 用法: node test/dom.smoke.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TMP_APPDATA = path.join(__dirname, '_appdata');
const TMP_EXT = path.join(__dirname, '_ext');

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

/* ---------- 极简 DOM ---------- */
function classList() {
  const set = new Set();
  return {
    add(...c) {
      c.forEach((x) => set.add(x));
    },
    remove(...c) {
      c.forEach((x) => set.delete(x));
    },
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c);
      else set.delete(c);
      return on;
    },
    contains(c) {
      return set.has(c);
    },
  };
}

const registry = new Map();
const tabs = [];

function makeEl(tag, attrs) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    _attrs: Object.assign({}, attrs || {}),
    _cls: classList(),
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    scrollTop: 0,
    clientHeight: 420,
    clientWidth: 900,
    selectedIndex: 0,
    options: [],
    parentNode: null,
    children: [],
    classList: null,
    getAttribute(n) {
      return this._attrs[n] === undefined ? null : this._attrs[n];
    },
    setAttribute(n, v) {
      this._attrs[n] = String(v);
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) {
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    removeChild(c) {
      this.children = this.children.filter((x) => x !== c);
      c.parentNode = null;
      return c;
    },
    insertAdjacentHTML() {},
    querySelector(sel) {
      return stubFor(sel);
    },
    querySelectorAll() {
      return [];
    },
    focus() {},
    select() {},
    setSelectionRange() {},
    closest() {
      return null;
    },
    getBoundingClientRect() {
      return { width: 178, height: 120, left: 10, top: 10 };
    },
    contains() {
      return false;
    },
  };
  el.classList = el._cls;
  return el;
}

function stubFor(sel) {
  const el = makeEl('div');
  if (String(sel).indexOf('spacer') >= 0) el.style.height = '0px';
  return el;
}

const documentStub = {
  readyState: 'complete',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  createElement: (t) => makeEl(t),
  getElementById(id) {
    if (!registry.has(id)) registry.set(id, makeEl('div', { id }));
    return registry.get(id);
  },
  querySelector(sel) {
    if (String(sel).charAt(0) === '#') return this.getElementById(String(sel).slice(1));
    return stubFor(sel);
  },
  querySelectorAll(sel) {
    if (sel === '.tab') return tabs;
    return [];
  },
  addEventListener() {},
  removeEventListener() {},
  execCommand() {
    return true;
  },
};

/* 预建 index.html 里出现的元素 id 与 tab */
const html = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8');
for (const m of html.matchAll(/id="([^"]+)"/g)) documentStub.getElementById(m[1]);
for (const m of html.matchAll(/data-tab="([^"]+)"/g)) {
  const t = makeEl('button', { 'data-tab': m[1] });
  t.classList.add('tab');
  tabs.push(t);
}

/* ---------- window / CEP 桩 ---------- */
global.window = global;
global.document = documentStub;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.cancelAnimationFrame = () => {};
global.ResizeObserver = function () {
  this.observe = () => {};
  this.disconnect = () => {};
};
global.location = { pathname: '/client/index.html' };
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.innerWidth = 1000;
global.innerHeight = 700;

const EFFECT_ROWS = [
  ['高斯模糊', 'ADBE Gaussian Blur 2', 'Blur & Sharpen', '1.0'],
  ['梯度渐变', 'ADBE Ramp', 'Generate', '1.0'],
  ['发光', 'ADBE Glo2', 'Stylize', '1.0'],
  ['CC Light Sweep', 'CC Light Sweep', 'Generate', '1.0'],
];
let evalCalls = [];

global.__adobe_cep__ = {
  evalScript(script, cb) {
    evalCalls.push(script);
    setTimeout(() => {
      if (/__AWB\.info\(/.test(script)) cb('OK\n25.6\u000142\u0001D:\\proj\\a.aep\u0001主合成\u00013');
      else if (/listEffects/.test(script)) cb('OK\n' + EFFECT_ROWS.map((r) => r.join('\u0001')).join('\n'));
      else if (/importFiles|importIntoComp/.test(script)) cb('OK\nD:\\a.png\u00011\u0001');
      else if (/applyEffect/.test(script)) cb('OK\n高斯模糊\u0001图层 1\u00011\u0001');
      else cb('OK\n');
    }, 0);
  },
  getSystemPath() {
    return path.join(ROOT, 'client', '..');
  },
};
global.cep = {
  fs: {
    showOpenDialogEx() {
      return { data: null };
    },
  },
};

process.env.APPDATA = TMP_APPDATA;
fs.mkdirSync(TMP_APPDATA, { recursive: true });

/* ---------- 逐层加载（顺序与 index.html 一致） ---------- */
// core.js 在 Node 下走 module.exports，先手动挂到 AWB.core
global.AWB = {};
window.AWB = global.AWB;
global.AWB.core = require(path.join(ROOT, 'client', 'js', 'core.js'));

// CEP uses --mixed-context, where a browser script can see a CommonJS
// `module`.  Verify core.js still publishes window.AWB.core in that mode.
const mixedWindow = {};
const mixedContext = { window: mixedWindow, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'client', 'js', 'core.js'), 'utf8'), mixedContext);
check('mixed-context 下 core.js 发布 AWB.core', !!mixedWindow.AWB && !!mixedWindow.AWB.core);

const scripts = ['cep.js', 'nodeapi.js', 'store.js', 'vlist.js', 'preview.js', 'files.js', 'effects.js', 'app.js'];
let loadError = null;
try {
  for (const s of scripts) require(path.join(ROOT, 'client', 'js', s));
} catch (e) {
  loadError = e;
}
check('所有前端脚本加载 + boot() 不抛异常', !loadError, loadError && (loadError.stack || loadError.message));

const AWB = global.AWB;
check('AWB 命名空间建立', !!AWB && !!AWB.files && !!AWB.effects && !!AWB.app);
check(
  '关键按钮使用兼容 CEP 的 onclick 绑定',
  ['btnSettings', 'btnHelp', 'btnAddSource', 'btnBack', 'btnImportSelected', 'btnScanInstalled'].every(
    (id) => typeof documentStub.getElementById(id).onclick === 'function',
  ),
);
const filesSource = fs.readFileSync(path.join(ROOT, 'client', 'js', 'files.js'), 'utf8');
check(
  '文件夹双击不会被首次点击重绘打断',
  /function onListClick[\s\S]*recalcSel\(true\)[\s\S]*scheduleSelectionPaint\(\)[\s\S]*function onListDblClick/.test(filesSource),
);
if (!AWB || !AWB.files) {
  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(1);
}

setTimeout(() => {
  const fileState = AWB.files.getState();
  check('资源页默认进入 D:\\ae', fileState.curDir === 'D:\\ae', fileState.curDir);
  check('资源页列出条目', fileState.view.length > 0, 'count=' + fileState.view.length);
  check('条目带类型标签', !!fileState.view[0] && !!fileState.view[0].typeLabel, JSON.stringify(fileState.view[0] || {}).slice(0, 120));

  const fxState = AWB.effects.getState();
  check('效果库载入 >= 951 行', fxState.rows.length >= 951, 'rows=' + fxState.rows.length);
  check('效果库分类数 13', fxState.library.categories.length === 13, fxState.library.categories.length);
  check('已安装效果扫描到 4 个', fxState.installed.length === 4, fxState.installed.length);
  const matched = fxState.rows.filter((r) => r.match).length;
  check('名称匹配出结果', matched > 0, 'matched=' + matched);
  const ramp = fxState.rows.filter((r) => r.name === '梯度渐变')[0];
  check('梯度渐变匹配到 ADBE Ramp', !!ramp && ramp.match && ramp.match.matchName === 'ADBE Ramp', JSON.stringify(ramp && ramp.match));
  const sweep = fxState.rows.filter((r) => r.name === 'CC Light Sweep')[0];
  check('英文效果名匹配到同名 matchName', !!sweep && sweep.match && sweep.match.matchName === 'CC Light Sweep', JSON.stringify(sweep && sweep.match));

  check('AE 版本信息解析', !!AWB.app.hostInfo && AWB.app.hostInfo.version === '25.6', JSON.stringify(AWB.app.hostInfo));

  // 导入调用
  let importErr = null;
  try {
    AWB.files.importPaths(['D:\\a.png'], false);
  } catch (e) {
    importErr = e;
  }
  check('importPaths 不抛异常', !importErr, importErr && importErr.message);

  // 设置写入
  AWB.store.patch({ lastDir: 'D:\\ae' });
  AWB.store.saveNow();
  const settingsPath = path.join(TMP_APPDATA, 'AE-Asset-Workbench', 'settings.json');
  check('settings.json 落地', fs.existsSync(settingsPath), settingsPath);

  // boot 期间确实调用了 host
  check('启动时调用过 host.jsx', evalCalls.some((s) => /__AWB\.(info|listEffects)/.test(s)), evalCalls.length + ' calls');

  setTimeout(() => {
    console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
    try {
      fs.rmSync(TMP_APPDATA, { recursive: true, force: true });
    } catch (e) {
      /* ignore */
    }
    process.exit(fail ? 1 : 0);
  }, 300);
}, 600);

