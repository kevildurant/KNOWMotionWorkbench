/**
 * 效果库标签页：951 条汉化名资料 + 已安装效果扫描 + 名称映射 + 自定义条目。
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});
  var core = AWB.core;
  var esc = core.escapeHtml;

  var S = {
    library: null,
    rows: [],
    view: [],
    installed: [],
    installedAt: 0,
    map: {},
    userItems: [],
    cat: 'all',
    filter: 'all',
    query: '',
    busy: false,
    selIdx: -1,
  };

  var els = {};
  var fxList = null;

  function dataFile(name) {
    return AWB.node.path.join(AWB.node.dataDir(), name);
  }

  function bundledLibraryPath() {
    return AWB.node.path.join(AWB.node.extensionRoot(), 'data', 'effects-library.json');
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    els.catList = document.getElementById('catList');
    els.list = document.getElementById('fxList');
    els.search = document.getElementById('fxSearch');
    els.filter = document.getElementById('fxFilter');
    els.total = document.getElementById('fxTotal');
    els.status = document.getElementById('statusText');

    fxList = new AWB.VList(els.list, {
      rowHeight: 46,
      render: renderRow,
      emptyHtml: '<div class="pv-empty">没有匹配的效果<br><span class="muted">试试换关键词，或点「扫描已安装」</span></div>',
    });

    S.map = AWB.store.loadMap() || {};
    loadLibrary();
    loadInstalledCache();

    els.search.addEventListener('input', core.debounce(function () {
      S.query = els.search.value.trim();
      applyFilter(true);
    }, 150));
    els.filter.addEventListener('change', function () {
      S.filter = els.filter.value;
      AWB.store.set('fxFilter', S.filter);
      applyFilter(true);
    });
    els.filter.value = AWB.store.get('fxFilter') || 'all';
    S.filter = els.filter.value;

    AWB.app.bindButton('btnScanInstalled', function () {
      scanInstalled(true);
    });
    AWB.app.bindButton('btnAddEffect', openAddEffect);
    AWB.app.bindButton('btnSyncLib', openSync);
    AWB.app.bindButton('btnLibManage', openManage);

    els.list.onclick = onListClick;
    els.list.oncontextmenu = onListContext;
    els.list.onkeydown = onKeyDown;

    rebuild();
    if (!S.installed.length) scanInstalled(false);
  }

  /* ---------------- 数据载入 ---------------- */
  function loadLibrary() {
    var cached = AWB.node.readJSON(dataFile('library.json'), null);
    var lib = cached;
    if (!lib || !lib.categories) {
      lib = AWB.node.readJSON(bundledLibraryPath(), null);
      if (lib) AWB.node.writeJSON(dataFile('library.json'), lib);
    }
    S.library = lib || { version: 1, categories: [], total: 0 };
    var u = AWB.node.readJSON(dataFile('user-effects.json'), null);
    S.userItems = (u && u.items) || [];
  }

  function loadInstalledCache() {
    var c = AWB.node.readJSON(dataFile('installed-effects.json'), null);
    if (c && c.list && c.list.length) {
      S.installed = c.list;
      S.installedAt = c.at || 0;
    }
  }

  function saveInstalledCache() {
    AWB.node.writeJSON(dataFile('installed-effects.json'), {
      at: Date.now(),
      ae: (AWB.app.hostInfo && AWB.app.hostInfo.version) || '',
      list: S.installed,
    });
  }

  function saveUserItems() {
    AWB.node.writeJSON(dataFile('user-effects.json'), { version: 1, items: S.userItems });
  }

  /* ---------------- 扫描已安装 ---------------- */
  function scanInstalled(showToast) {
    if (S.busy) return;
    S.busy = true;
    AWB.app.setStatus('正在扫描 AE 已安装效果…', true);
    AWB.cep
      .callHost('listEffects', '')
      .then(function (body) {
        S.installed = AWB.cep.parseTable(body, ['displayName', 'matchName', 'category', 'version']);
        S.installedAt = Date.now();
        saveInstalledCache();
        rebuild();
        if (showToast) AWB.app.toast('已扫描到 ' + S.installed.length + ' 个已安装效果', 'ok');
        AWB.app.setStatus('已安装效果：' + S.installed.length + ' 个');
      })
      .catch(function (err) {
        if (showToast) AWB.app.toast('扫描失败：' + err.message, 'err');
        AWB.app.setStatus('扫描已安装效果失败：' + err.message);
      })
      .then(function () {
        S.busy = false;
      });
  }

  /* ---------------- 行数据 ---------------- */
  function buildRows() {
    var lib = S.library;
    var rows = core.flattenLibrary(lib);

    // 自定义条目
    S.userItems.forEach(function (it, i) {
      var names = it.names && it.names.length ? it.names : [it.name];
      var cid = it.catId || 'custom';
      var clabel = it.catLabel || '自定义';
      names.forEach(function (nm, ni) {
        rows.push({
          id: 'custom|' + i + '|' + ni,
          catId: cid,
          catLabel: clabel,
          catIcon: '⭐',
          section: '我的添加',
          name: nm,
          fullName: it.name,
          desc: it.desc || '',
          usage: it.usage || '',
          kind: 'effect',
          custom: true,
          userMatchName: it.matchName || '',
          search: (nm + ' ' + it.name + ' ' + (it.desc || '') + ' ' + (it.usage || '') + ' 自定义').toLowerCase(),
        });
      });
    });

    // 匹配
    rows.forEach(function (r) {
      if (r.kind !== 'effect') {
        r.match = null;
        return;
      }
      if (r.userMatchName) {
        r.match = { matchName: r.userMatchName, displayName: r.name, category: '', score: 1, method: 'user' };
        var hitInstalled = S.installed.filter(function (e) {
          return e.matchName === r.userMatchName;
        })[0];
        if (hitInstalled) {
          r.match.displayName = hitInstalled.displayName;
          r.match.category = hitInstalled.category;
        }
        return;
      }
      r.match = core.matchEffectName(r.name, S.installed, S.map);
    });

    return rows;
  }

  function rebuild() {
    S.rows = buildRows();
    renderCats();
    applyFilter(true);
  }

  function countByCat() {
    var out = { all: S.rows.length };
    S.rows.forEach(function (r) {
      out[r.catId] = (out[r.catId] || 0) + 1;
    });
    return out;
  }

  function renderCats() {
    var counts = countByCat();
    var cats = [{ id: 'all', label: '全部效果', icon: '◆' }];
    var known = { all: 1 };
    (S.library.categories || []).forEach(function (c) {
      known[c.id] = 1;
      cats.push({ id: c.id, label: c.label, icon: c.icon || '•' });
    });
    if (counts.custom) {
      known.custom = 1;
      cats.push({ id: 'custom', label: '自定义', icon: '⭐' });
    }
    // 自定义条目可能被归到已有分类，也可能落到未知分类
    S.rows.forEach(function (r) {
      if (!known[r.catId]) {
        known[r.catId] = 1;
        cats.push({ id: r.catId, label: r.catLabel || r.catId, icon: '⭐' });
      }
    });

    var html = cats.map(function (c) {
      var n = counts[c.id] || 0;
      var active = S.cat === c.id ? ' active' : '';
      return (
        '<li class="cat-item' + active + '" data-cat="' + esc(c.id) + '">' +
        '<span class="ic">' + esc(c.icon) + '</span>' +
        '<span class="nm">' + esc(c.label) + '</span>' +
        '<span class="cnt">' + n + '</span>' +
        '</li>'
      );
    });
    els.catList.innerHTML = html.join('');
    els.total.textContent = S.rows.length + ' 条';
    Array.prototype.forEach.call(els.catList.querySelectorAll('.cat-item'), function (li) {
      li.onclick = function () {
        S.cat = li.getAttribute('data-cat');
        renderCats();
        applyFilter(true);
      };
    });
  }

  function applyFilter(resetScroll) {
    var q = S.query.toLowerCase();
    var view = S.rows.filter(function (r) {
      if (S.cat !== 'all' && r.catId !== S.cat) return false;
      if (q && r.search.indexOf(q) < 0) return false;
      if (S.filter === 'installed' && !r.match) return false;
      if (S.filter === 'missing' && (r.match || r.kind !== 'effect')) return false;
      if (S.filter === 'bound' && (!r.match || r.match.method !== 'bind')) return false;
      return true;
    });
    S.view = view;
    fxList.setItems(view, !resetScroll);
    var matched = view.filter(function (r) { return r.match; }).length;
    AWB.app.setStatus('效果库：' + view.length + ' 条，其中已匹配已安装 ' + matched + ' 条' + (S.installed.length ? '（已扫描 ' + S.installed.length + ' 个效果）' : ''));
  }

  /* ---------------- 渲染行 ---------------- */
  function renderRow(r, i) {
    var sel = S.selIdx === i ? ' sel' : '';
    var statusHtml;
    var tools = '<button class="mini" data-act="copy" title="复制效果名称">复制名</button>';
    if (r.kind === 'shortcut') {
      statusHtml = '<span class="status-dot info">快捷键</span>';
      tools = '<button class="mini" data-act="copy">复制名</button>';
    } else if (r.kind === 'combo') {
      statusHtml = '<span class="status-dot info">组合</span>';
    } else if (r.match) {
      statusHtml = '<span class="status-dot ok" title="' + esc(r.match.matchName) + '">已安装</span>';
      tools = '<button class="mini" data-act="apply" title="应用到选中图层">应用</button>' + tools;
    } else {
      statusHtml = '<span class="status-dot miss">未安装</span>';
      tools = '<button class="mini" data-act="bind" title="手工绑定到某个已安装效果">绑定</button>' + tools;
    }

    var sub = r.catLabel + (r.section ? ' · ' + r.section : '');
    if (r.match && r.match.matchName) sub += ' · ' + r.match.matchName;
    else if (r.kind === 'effect') sub += ' · 未匹配';

    return (
      '<div class="fxrow' + sel + '" data-idx="' + i + '" title="' + esc(r.name + '\n' + (r.match ? r.match.matchName + ' / ' + r.match.method : '未匹配到已安装效果')) + '">' +
      '<span class="c1"><span class="nm">' + esc(r.name) + '</span><span class="sub">' + esc(sub) + '</span></span>' +
      '<span class="c2">' + esc(r.desc) + '</span>' +
      '<span class="c3">' + esc(r.usage) + '</span>' +
      '<span class="c4">' + statusHtml + '<span class="fx-tools">' + tools + '</span></span>' +
      '</div>'
    );
  }

  /* ---------------- 交互 ---------------- */
  function rowAt(e) {
    var row = core.closest(e.target, '.fxrow');
    if (!row) return null;
    var i = Number(row.getAttribute('data-idx'));
    return { i: i, r: S.view[i] };
  }

  function onListClick(e) {
    var hit = rowAt(e);
    if (!hit || !hit.r) return;
    var btn = core.closest(e.target, 'button[data-act]');
    var act = btn ? btn.getAttribute('data-act') : 'copy';
    S.selIdx = hit.i;
    var r = hit.r;
    if (act === 'copy') {
      var ok = AWB.cep.copyText(r.name);
      AWB.app.toast(ok ? '已复制效果名：' + r.name : '复制失败，请手动选择', ok ? 'ok' : 'err');
      AWB.app.setStatus('已复制「' + r.name + '」' + (r.match ? '（' + r.match.matchName + '）' : ''));
    } else if (act === 'apply') {
      applyRow(r);
    } else if (act === 'bind') {
      openBind(r);
    }
    fxList.paint();
  }

  function onListContext(e) {
    e.preventDefault();
    var hit = rowAt(e);
    if (!hit || !hit.r) return;
    var r = hit.r;
    var items = [
      { label: '复制效果名称', run: function () { AWB.cep.copyText(r.name); AWB.app.toast('已复制：' + r.name, 'ok'); } },
    ];
    if (r.kind === 'effect' && r.match) {
      items.push({ label: '应用到选中图层', run: function () { applyRow(r); } });
      items.push({ label: '复制 matchName', run: function () { AWB.cep.copyText(r.match.matchName); AWB.app.toast('已复制 matchName', 'ok'); } });
      items.push({ label: '重新绑定…', run: function () { openBind(r); } });
    } else if (r.kind === 'effect') {
      items.push({ label: '手工绑定到已安装效果…', run: function () { openBind(r); } });
    }
    if (r.custom) {
      items.push({ sep: true });
      items.push({
        label: '删除这条自定义效果',
        run: function () {
          AWB.app.confirm('删除自定义效果「' + r.name + '」？', function () {
            var idx = Number(String(r.id).split('|')[1]);
            S.userItems.splice(idx, 1);
            saveUserItems();
            rebuild();
            AWB.app.toast('已删除', 'ok');
          });
        },
      });
    }
    AWB.app.contextMenu(e.clientX, e.clientY, items);
  }

  function onKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!S.view.length) return;
    if (e.key === 'ArrowDown') S.selIdx = Math.min(S.view.length - 1, S.selIdx + 1);
    else if (e.key === 'ArrowUp') S.selIdx = Math.max(0, S.selIdx - 1);
    else {
      var r = S.view[S.selIdx];
      if (r) {
        if (r.match && r.kind === 'effect') applyRow(r);
        else {
          AWB.cep.copyText(r.name);
          AWB.app.toast('已复制效果名：' + r.name, 'ok');
        }
      }
      return;
    }
    fxList.scrollToIndex(S.selIdx);
    fxList.paint();
  }

  /* ---------------- 应用 / 绑定 ---------------- */
  function applyRow(r) {
    if (!r.match) return;
    AWB.app.setStatus('正在应用「' + r.name + '」…', true);
    AWB.cep
      .callHost('applyEffect', r.match.matchName + '\u0001' + r.match.displayName)
      .then(function (body) {
        var cells = body.split('\u0001');
        AWB.app.toast('已应用「' + (cells[0] || r.name) + '」', 'ok');
        AWB.app.setStatus('已应用到图层：' + (cells[1] || ''));
      })
      .catch(function (err) {
        AWB.app.toast(err.message, 'err');
        AWB.app.setStatus('应用失败：' + err.message);
      });
  }

  function openBind(r) {
    var installed = S.installed.slice().sort(function (a, b) {
      return core.naturalCompare(a.displayName, b.displayName);
    });
    var listHtml = installed
      .map(function (e) {
        return (
          '<div class="pick-item" data-mn="' + esc(e.matchName) + '" data-dn="' + esc(e.displayName) + '">' +
          '<span>' + esc(e.displayName) + '</span><span class="mn">' + esc(e.matchName) + '</span>' +
          '</div>'
        );
      })
      .join('');
    var close = AWB.app.modal({
      title: '绑定「' + r.name + '」到已安装效果',
      width: 520,
      body:
        '<div class="pv-tip">在下面搜索并点选 AE 里真实存在的效果，绑定会保存到 effect-map.json，之后自动识别。</div>' +
        '<input type="text" id="bindSearch" placeholder="搜索已安装效果…" />' +
        '<div class="pick-list" id="bindList">' + (listHtml || '<div class="pv-empty">没有已安装效果缓存，请先点「扫描已安装」</div>') + '</div>',
      buttons: [{ label: '关闭' }],
    });
    var input = document.getElementById('bindSearch');
    var list = document.getElementById('bindList');
    input.oninput = function () {
      var q = input.value.trim().toLowerCase();
      Array.prototype.forEach.call(list.querySelectorAll('.pick-item'), function (it) {
        var txt = (it.getAttribute('data-dn') + ' ' + it.getAttribute('data-mn')).toLowerCase();
        it.style.display = !q || txt.indexOf(q) >= 0 ? '' : 'none';
      });
    };
    list.onclick = function (e) {
      var it = core.closest(e.target, '.pick-item');
      if (!it) return;
      S.map[r.name] = it.getAttribute('data-mn');
      AWB.store.saveMap(S.map);
      close();
      rebuild();
      AWB.app.toast('已绑定「' + r.name + '」→ ' + it.getAttribute('data-dn'), 'ok');
    };
    input.focus();
  }

  /* ---------------- 添加效果 ---------------- */
  function openAddEffect() {
    var cats = [{ id: 'custom', label: '自定义' }].concat(
      (S.library.categories || []).map(function (c) {
        return { id: c.id, label: c.label };
      })
    );
    var close = AWB.app.modal({
      title: '添加效果（可来自任意插件）',
      width: 460,
      body:
        '<div class="field"><label>效果中文名 *（多个用顿号分隔）</label><input id="aeName" type="text" placeholder="例如：深度发光 / Deep Glow" /></div>' +
        '<div class="field"><label>matchName（可留空，留空则按名称自动匹配）</label><input id="aeMatch" type="text" placeholder="例如：ADBE Gaussian Blur 2" /><span class="hint">在 AE 里选中效果后可用「扫描已安装」找到它；也可在效果列表右键「复制 matchName」。</span></div>' +
        '<div class="field"><label>分类</label><select id="aeCat">' + cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.label) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>说明</label><input id="aeDesc" type="text" placeholder="一句话说明" /></div>' +
        '<div class="field"><label>用途</label><input id="aeUsage" type="text" placeholder="常见用途" /></div>',
      buttons: [
        { label: '取消' },
        {
          label: '保存',
          primary: true,
          onClick: function (closeFn) {
            var name = document.getElementById('aeName').value.trim();
            if (!name) {
              AWB.app.toast('效果名称不能为空', 'err');
              return false;
            }
            var names = core.splitNames(name);
            var catSel = document.getElementById('aeCat');
            var cid = catSel ? catSel.value : 'custom';
            var clabel = catSel && catSel.selectedIndex >= 0 ? catSel.options[catSel.selectedIndex].text : '自定义';
            S.userItems.push({
              name: name,
              names: names.length ? names : [name],
              catId: cid,
              catLabel: clabel,
              matchName: document.getElementById('aeMatch').value.trim(),
              desc: document.getElementById('aeDesc').value.trim(),
              usage: document.getElementById('aeUsage').value.trim(),
              addedAt: Date.now(),
            });
            saveUserItems();
            rebuild();
            closeFn();
            AWB.app.toast('已添加：' + name, 'ok');
            return true;
          },
        },
      ],
    });
  }

  /* ---------------- 同步资料库 ---------------- */
  function resolveLibrarySource(p) {
    if (!p) return '';
    var candidates = [p];
    if (/\.js$/i.test(p)) return AWB.node.exists(p) ? p : '';
    candidates.push(AWB.node.path.join(p, 'data.js'));
    candidates.push(AWB.node.path.join(p, 'resources', 'app', 'data.js'));
    candidates.push(AWB.node.path.join(p, 'AE学习工作台', 'resources', 'app', 'data.js'));
    candidates.push(AWB.node.path.join(p, 'resources', 'app', 'data.js'));
    for (var i = 0; i < candidates.length; i++) {
      if (AWB.node.exists(candidates[i])) return candidates[i];
    }
    return '';
  }

  function openSync() {
    var stored = AWB.store.get('libraryPath') || '';
    var resolved = resolveLibrarySource(stored);
    var body =
      '<div class="pv-tip">从「AE 学习工作台」重新导入 951 条效果资料（含你后续在那边新增的条目）。当前资料库路径：</div>' +
      '<div class="field"><label>资料库位置（文件夹或 data.js 文件）</label>' +
      '<input id="libPath" type="text" value="' + esc(stored) + '" />' +
      '<span class="hint">解析结果：' + (resolved ? esc(resolved) : '未找到 data.js，请检查路径') + '</span></div>' +
      '<div class="pv-tip">说明：导入会覆盖 library.json；你手动添加的「自定义」条目与 effect-map.json 绑定不会丢。</div>';
    AWB.app.modal({
      title: '同步效果资料库',
      width: 480,
      body: body,
      buttons: [
        { label: '选择文件夹…', onClick: function () { var p = AWB.cep.pickFolder('选择 AE学习工作台 文件夹'); if (p) document.getElementById('libPath').value = p; return false; } },
        { label: '取消' },
        {
          label: '开始同步',
          primary: true,
          onClick: function (closeFn) {
            var p = document.getElementById('libPath').value.trim();
            AWB.store.set('libraryPath', p);
            doSync(p, closeFn);
            return false;
          },
        },
      ],
    });
  }

  function doSync(p, closeFn) {
    var src = resolveLibrarySource(p);
    if (!src) {
      AWB.app.toast('没找到 data.js，请检查路径', 'err');
      return;
    }
    var r = AWB.node.readText(src, 32 * 1024 * 1024);
    if (!r.ok) {
      AWB.app.toast('读取失败：' + r.error, 'err');
      return;
    }
    var lib;
    try {
      lib = core.parseEffectData(r.text, src);
    } catch (e) {
      AWB.app.toast('解析失败：' + e.message, 'err');
      return;
    }
    var w = AWB.node.writeJSON(dataFile('library.json'), lib);
    if (!w.ok) {
      AWB.app.toast('写入缓存失败：' + w.error, 'err');
      return;
    }
    S.library = lib;
    rebuild();
    if (closeFn) closeFn();
    AWB.app.toast('同步完成：' + lib.total + ' 条', 'ok');
  }

  /* ---------------- 资料库与映射管理 ---------------- */
  function openManage() {
    var mapCount = Object.keys(S.map).length;
    var body =
      '<div class="pv-meta" style="grid-template-columns:88px 1fr">' +
      '<div class="k">资料库</div><div class="v">' + S.rows.length + ' 行（' + (S.library.categories || []).length + ' 类）</div>' +
      '<div class="k">已安装缓存</div><div class="v">' + S.installed.length + ' 个' + (S.installedAt ? ' · ' + core.formatTime(S.installedAt) : '') + '</div>' +
      '<div class="k">手工绑定</div><div class="v">' + mapCount + ' 条</div>' +
      '<div class="k">自定义</div><div class="v">' + S.userItems.length + ' 条</div>' +
      '<div class="k">数据目录</div><div class="v">' + esc(AWB.node.dataDir()) + '</div>' +
      '</div>' +
      '<div class="pv-tip">导出后可在另一台机器导入；缓存可随时清理，不影响资料。</div>';
    AWB.app.modal({
      title: '资料库与映射',
      width: 520,
      body: body,
      buttons: [
        {
          label: '导出资料库',
          onClick: function () {
            var p = AWB.cep.pickFolder('选择导出文件夹');
            if (!p) return false;
            var out = AWB.node.path.join(p, 'ae-asset-workbench-library.json');
            var r = AWB.node.writeJSON(out, { library: S.library, user: S.userItems, map: S.map });
            AWB.app.toast(r.ok ? '已导出：' + out : '导出失败：' + r.error, r.ok ? 'ok' : 'err');
            return false;
          },
        },
        {
          label: '导入…',
          onClick: function () {
            var f = AWB.cep.pickFile('选择导出的 JSON');
            if (!f) return false;
            var obj = AWB.node.readJSON(f, null);
            if (!obj || !obj.library) {
              AWB.app.toast('文件格式不对', 'err');
              return false;
            }
            S.library = obj.library;
            S.userItems = obj.user || [];
            S.map = obj.map || {};
            AWB.node.writeJSON(dataFile('library.json'), S.library);
            saveUserItems();
            AWB.store.saveMap(S.map);
            rebuild();
            AWB.app.toast('已导入资料库', 'ok');
            return true;
          },
        },
        {
          label: '清理缩略图缓存',
          onClick: function () {
            var n = AWB.node.clearCache();
            AWB.app.toast('已清理 ' + n + ' 个缓存文件', 'ok');
            return false;
          },
        },
        { label: '关闭' },
      ],
    });
  }

  function refresh() {
    loadLibrary();
    rebuild();
  }

  AWB.effects = {
    init: init,
    refresh: refresh,
    rebuild: rebuild,
    scanInstalled: scanInstalled,
    getState: function () { return S; },
  };
})();

