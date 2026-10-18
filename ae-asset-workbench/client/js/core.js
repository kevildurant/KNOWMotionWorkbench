/**
 * 纯逻辑层：不依赖 DOM / Node / AE，浏览器与 Node 均可加载。
 * 浏览器: window.AWB.core
 * Node:   require('./client/js/core.js')
 */
(function (root, factory) {
  // CEP uses a mixed Node/browser context.  Some CEP builds expose a
  // CommonJS `module` object even while loading this file as a browser
  // script.  Always publish the value on window.AWB first; keep the CommonJS
  // export as an additional Node-test compatibility path.
  var value = factory();
  root.AWB = root.AWB || {};
  root.AWB.core = value;
  if (typeof module === 'object' && module.exports) module.exports = value;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* ---------------- 文件类型 ---------------- */
  var KINDS = {
    image: { kind: 'image', label: '图片', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'tga', 'exr', 'hdr', 'dpx', 'psd', 'ai', 'svg', 'ico', 'heic'] },
    video: { kind: 'video', label: '视频', exts: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', 'mxf', 'mts', 'r3d', 'braw', 'mpeg', 'mpg', 'ts'] },
    audio: { kind: 'audio', label: '音频', exts: ['wav', 'mp3', 'aac', 'flac', 'ogg', 'm4a', 'aiff', 'aif', 'wma'] },
    aep: { kind: 'aep', label: 'AE 工程', exts: ['aep', 'aepx', 'aet', 'aepb'] },
    preset: { kind: 'preset', label: 'AE 预设/模板', exts: ['ffx', 'mogrt', 'ffx_', 'epr', 'jsx', 'jsxbin', 'xml'] },
    text: { kind: 'text', label: '文本', exts: ['txt', 'json', 'md', 'csv', 'log', 'ini', 'yaml', 'yml', 'html', 'htm', 'css', 'js'] },
    archive: { kind: 'archive', label: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz'] },
    font: { kind: 'font', label: '字体', exts: ['ttf', 'otf', 'ttc'] },
    model: { kind: 'model', label: '模型/其它', exts: ['obj', 'fbx', 'c4d', 'blend', 'max', 'glb', 'gltf'] },
  };

  var EXT_KIND = {};
  Object.keys(KINDS).forEach(function (k) {
    KINDS[k].exts.forEach(function (e) {
      EXT_KIND[e] = k;
    });
  });

  function extOf(name) {
    var i = String(name || '').lastIndexOf('.');
    if (i < 0 || i === String(name).length - 1) return '';
    return String(name).slice(i + 1).toLowerCase();
  }

  function classify(name, isDir) {
    if (isDir) return { kind: 'folder', label: '文件夹', ext: '' };
    var ext = extOf(name);
    var k = EXT_KIND[ext];
    if (!k) return { kind: 'other', label: ext ? ext.toUpperCase() : '文件', ext: ext };
    return { kind: KINDS[k].kind, label: KINDS[k].label, ext: ext };
  }

  function isPreviewableImage(name) {
    var k = classify(name, false).kind;
    return k === 'image';
  }

  /** 图片序列：name_0001.png / name-01.exr */
  function isImageSequence(name) {
    return /\.(png|jpe?g|tga|tiff?|exr|dpx|psd)$/i.test(String(name || '')) && /[._-]0*\d{1,6}$/.test(String(name || '').replace(/\.[^.]+$/, ''));
  }

  /* ---------------- 格式化 ---------------- */
  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    var u = ['KB', 'MB', 'GB', 'TB'];
    var i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i];
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ---------------- 排序 ---------------- */
  var collator = null;
  try {
    collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  } catch (e) {
    collator = null;
  }

  function naturalCompare(a, b) {
    if (collator) return collator.compare(a, b);
    return String(a).localeCompare(String(b), 'zh');
  }

  function sortEntries(list, by, dir) {
    var d = dir === 'desc' ? -1 : 1;
    var arr = list.slice();
    arr.sort(function (x, y) {
      if (x.isDir !== y.isDir) return x.isDir ? -1 : 1; // 文件夹在前
      var r = 0;
      if (by === 'size') r = (x.size || 0) - (y.size || 0);
      else if (by === 'mtime') r = (x.mtime || 0) - (y.mtime || 0);
      else if (by === 'type') r = naturalCompare(x.typeLabel || '', y.typeLabel || '');
      if (r === 0) r = naturalCompare(x.name, y.name);
      return r * d;
    });
    return arr;
  }

  /* ---------------- 名称归一 / 模糊匹配 ---------------- */
  var PUNCT = /[\s\u3000、，,。．；;:：\/／\\|（）()\[\]【】{}<>《》〈〉“”‘’"'"'`~!！?？·•\-—_+=*&^%$#@…]/g;

  function normalizeName(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(PUNCT, '')
      .trim();
  }

  function levenshtein(a, b) {
    a = String(a);
    b = String(b);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1);
    var cur = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
      }
      var t = prev;
      prev = cur;
      cur = t;
    }
    return prev[b.length];
  }

  function splitNames(s) {
    return String(s == null ? '' : s)
      .split(/[、，,\/／]/)
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }

  /**
   * 中文名 -> 已安装效果。
   * installed: [{displayName, matchName, category}]
   * 返回 {displayName, matchName, category, score, method} 或 null
   */
  function matchEffectName(name, installed, aliasMap) {
    if (!name || !installed || !installed.length) return null;
    var hit = null;

    // 0. 手工绑定优先
    if (aliasMap) {
      var bound = aliasMap[name];
      if (typeof bound === 'string' && bound) {
        for (var i = 0; i < installed.length; i++) {
          if (installed[i].matchName === bound) {
            return { displayName: installed[i].displayName, matchName: bound, category: installed[i].category, score: 2, method: 'bind' };
          }
        }
      }
    }

    var nName = normalizeName(name);
    if (!nName) return null;
    var nLower = String(name).toLowerCase().trim();

    // 1. 精确
    for (var a = 0; a < installed.length; a++) {
      var e = installed[a];
      if (String(e.matchName).toLowerCase() === nLower || String(e.displayName).toLowerCase() === nLower) {
        return { displayName: e.displayName, matchName: e.matchName, category: e.category, score: 1, method: 'exact' };
      }
      if (normalizeName(e.displayName) === nName || normalizeName(e.matchName) === nName) {
        return { displayName: e.displayName, matchName: e.matchName, category: e.category, score: 0.98, method: 'normalized' };
      }
    }

    // 2. 包含 / 前缀关系
    //    资料库里很多条目是「高斯、径向、定向模糊」这种缩写，拆出来是 2 字名（高斯 → 高斯模糊），
    //    所以 2 字名也允许做「前缀」匹配；3 字以上才允许任意包含。
    if (nName.length >= 2) {
      var best2 = null;
      for (var b = 0; b < installed.length; b++) {
        var eb = installed[b];
        var dName = normalizeName(eb.displayName);
        var mName = normalizeName(eb.matchName);
        if (!dName) continue;
        var score = 0;
        if (dName.indexOf(nName) === 0 || mName.indexOf(nName) === 0) score = nName.length >= 3 ? 0.85 : 0.8;
        else if (nName.length >= 3 && (dName.indexOf(nName) >= 0 || mName.indexOf(nName) >= 0)) score = 0.72;
        else if (nName.length > dName.length && nName.indexOf(dName) >= 0) score = 0.78;
        else if (mName && nName.length > mName.length && nName.indexOf(mName) >= 0) score = 0.76;
        if (score && (!best2 || score > best2.score || (score === best2.score && dName.length > best2.len))) {
          best2 = { displayName: eb.displayName, matchName: eb.matchName, category: eb.category, score: score, method: 'contains', len: dName.length };
        }
      }
      if (best2) {
        return { displayName: best2.displayName, matchName: best2.matchName, category: best2.category, score: best2.score, method: 'contains' };
      }
    }

    // 3. 编辑距离
    if (nName.length >= 3) {
      var best = null;
      for (var c = 0; c < installed.length; c++) {
        var ec = installed[c];
        var nc = normalizeName(ec.displayName);
        if (!nc || Math.abs(nc.length - nName.length) > 3) continue;
        var dist = levenshtein(nName, nc);
        if (dist <= 2 && (!best || dist < best.dist)) best = { dist: dist, e: ec };
      }
      if (best) {
        return { displayName: best.e.displayName, matchName: best.e.matchName, category: best.e.category, score: 0.6, method: 'fuzzy' };
      }
    }
    return null;
  }

  /* ---------------- 效果资料库解析 ---------------- */
  var KIND_OF_CAT = { shortcut: 'shortcut', combo: 'combo' };

  function parseEffectData(rawText, sourcePath) {
    var text = String(rawText || '');
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('资料内容里找不到 DATA 对象');
    var data = JSON.parse(text.slice(start, end + 1));

    var categories = [];
    var total = 0;
    Object.keys(data).forEach(function (id) {
      var cat = data[id] || {};
      var kind = KIND_OF_CAT[id] || 'effect';
      var sections = [];
      (cat.sections || []).forEach(function (sec) {
        var items = [];
        (sec.items || []).forEach(function (it) {
          var arr = Array.isArray(it) ? it : [String(it)];
          var rawName = String(arr[0] || '').trim();
          var names = splitNames(rawName);
          items.push({
            name: rawName,
            names: names.length ? names : [rawName],
            desc: String(arr[1] == null ? '' : arr[1]).trim(),
            usage: kind === 'shortcut' ? '' : String(arr[2] == null ? '' : arr[2]).trim(),
            kind: kind,
          });
        });
        total += items.length;
        if (items.length) sections.push({ label: String(sec.label || ''), items: items });
      });
      categories.push({ id: id, label: cat.label || id, icon: cat.icon || '', kind: kind, sections: sections });
    });

    return { version: 1, generatedAt: new Date().toISOString(), source: sourcePath || '', total: total, categories: categories };
  }

  /** 把资料库摊平成可搜索的行 */
  function flattenLibrary(lib) {
    var rows = [];
    (lib.categories || []).forEach(function (cat) {
      cat.sections.forEach(function (sec) {
        sec.items.forEach(function (it) {
          var names = it.names && it.names.length ? it.names : [it.name];
          names.forEach(function (nm, idx) {
            rows.push({
              id: cat.id + '|' + sec.label + '|' + it.name + '|' + idx,
              catId: cat.id,
              catLabel: cat.label,
              catIcon: cat.icon,
              section: sec.label,
              name: nm,
              fullName: it.name,
              desc: it.desc,
              usage: it.usage,
              kind: it.kind || cat.kind || 'effect',
              search: (nm + ' ' + it.name + ' ' + it.desc + ' ' + it.usage + ' ' + cat.label + ' ' + sec.label).toLowerCase(),
            });
          });
        });
      });
    });
    return rows;
  }

  function countByCategory(lib) {
    var out = {};
    (lib.categories || []).forEach(function (cat) {
      var n = 0;
      cat.sections.forEach(function (s) {
        n += s.items.length;
      });
      out[cat.id] = n;
    });
    return out;
  }

  /* ---------------- 其它小工具 ---------------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Element.closest is missing in some embedded CEP Chromium builds.  Keep
  // delegation working with the older matches/parentNode primitives too.
  function closest(el, selector) {
    var node = el;
    var doc = typeof document !== 'undefined' ? document : null;
    while (node && node !== doc) {
      if (node.nodeType === 1 && typeof node.matches === 'function' && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, ms || 120);
    };
  }

  return {
    KINDS: KINDS,
    extOf: extOf,
    classify: classify,
    isPreviewableImage: isPreviewableImage,
    isImageSequence: isImageSequence,
    formatBytes: formatBytes,
    formatTime: formatTime,
    naturalCompare: naturalCompare,
    sortEntries: sortEntries,
    normalizeName: normalizeName,
    levenshtein: levenshtein,
    splitNames: splitNames,
    matchEffectName: matchEffectName,
    parseEffectData: parseEffectData,
    flattenLibrary: flattenLibrary,
    countByCategory: countByCategory,
    escapeHtml: escapeHtml,
    closest: closest,
    debounce: debounce,
  };
});

