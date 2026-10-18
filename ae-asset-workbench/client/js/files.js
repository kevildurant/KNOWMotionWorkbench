/**
 * 资源标签页：源库、目录浏览、搜索、导入。
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});
  var core = AWB.core;
  var esc = core.escapeHtml;

  var S = {
    sources: [],
    curDir: '',
    backStack: [],
    fwdStack: [],
    entries: [],
    view: [],
    searchMode: 'none', // none | filter | walk
    walkCancel: null,
    sel: {},
    selCount: 0,
    anchor: -1,
    sortBy: 'name',
    sortDir: 'asc',
    loading: false,
  };

  var els = {};
  var fileVList = null;
  var thumbQueue = [];
  var thumbActive = 0;
  var selectionPaintTimer = 0;

  /* ---------------- 初始化 ---------------- */
  function init() {
    els.sourceList = document.getElementById('sourceList');
    els.breadcrumb = document.getElementById('breadcrumb');
    els.fileList = document.getElementById('fileList');
    els.gridView = document.getElementById('gridView');
    els.search = document.getElementById('searchInput');
    els.recursive = document.getElementById('recursiveSearch');
    els.head = document.getElementById('fileHead');
    els.selInfo = document.getElementById('selInfo');

    var st = AWB.store.ensure();
    S.sources = st.sources || [];
    S.sortBy = st.sortBy || 'name';
    S.sortDir = st.sortDir || 'asc';
    els.recursive.checked = !!st.recursiveSearch;
    setView(st.view || 'list', true);

    fileVList = new AWB.VList(els.fileList, {
      rowHeight: 26,
      render: renderRow,
      emptyHtml: '<div class="pv-empty">这里没有文件<br><span class="muted">从左侧源库选择文件夹，或点「＋ 添加文件夹」</span></div>',
    });

    renderSources();
    renderHead();
    bindSources();

    AWB.app.bindButton('btnAddSource', addSource);
    AWB.app.bindButton('btnAddSourceFoot', addSource);
    AWB.app.bindButton('btnGoLibrary', function () {
      var p = AWB.store.get('libraryPath');
      if (p && AWB.node.exists(p)) navigate(p);
      else AWB.app.toast('资料库目录不存在，请在设置里改路径', 'err');
    });
    AWB.app.bindButton('btnBack', goBack);
    AWB.app.bindButton('btnForward', goForward);
    AWB.app.bindButton('btnUp', goUp);
    AWB.app.bindButton('btnViewToggle', function () {
      setView(S.view && S.view.length ? (document.getElementById('gridView').classList.contains('hidden') ? 'grid' : 'list') : 'list');
    });

    els.search.addEventListener('input', core.debounce(onSearch, 150));
    els.recursive.addEventListener('change', function () {
      AWB.store.set('recursiveSearch', els.recursive.checked);
      onSearch();
    });

    els.head.onclick = function (e) {
      var col = core.closest(e.target, '.col');
      if (!col) return;
      var by = col.getAttribute('data-sort');
      if (S.sortBy === by) S.sortDir = S.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        S.sortBy = by;
        S.sortDir = 'asc';
      }
      AWB.store.patch({ sortBy: S.sortBy, sortDir: S.sortDir });
      renderHead();
      applyFilter(false);
    };

    els.fileList.onclick = onListClick;
    els.fileList.ondblclick = onListDblClick;
    els.fileList.oncontextmenu = onListContext;
    els.fileList.onkeydown = onKeyDown;
    els.fileList.addEventListener('error', onRowImageError, true);
    els.gridView.onclick = onListClick;
    els.gridView.ondblclick = onListDblClick;
    els.gridView.oncontextmenu = onListContext;
    els.gridView.addEventListener('error', onRowImageError, true);

    AWB.app.bindButton('btnImportSelected', importSelected);
    AWB.app.bindButton('btnImportAll', importAll);

    var start = AWB.store.get('lastDir');
    if (!start || !AWB.node.exists(start)) {
      start = firstSourcePath();
    }
    if (start) navigate(start, false);
    else AWB.app.setStatus('还没有源目录，点左上角 ＋ 添加一个文件夹');
  }

  /* ---------------- 源库 ---------------- */
  function firstSourcePath() {
    for (var i = 0; i < S.sources.length; i++) {
      if (S.sources[i].path && AWB.node.exists(S.sources[i].path)) return S.sources[i].path;
    }
    var drives = AWB.node.listDrives();
    return drives.length ? drives[0] + '\\' : '';
  }

  function renderSources() {
    var html = [];
    S.sources.forEach(function (s, i) {
      if (!s.path) return;
      var active = samePath(s.path, S.curDir) ? ' active' : '';
      var missing = AWB.node.exists(s.path) ? '' : ' <span class="cnt" title="路径不存在">✕</span>';
      html.push(
        '<li class="source-item' + active + '" data-i="' + i + '" title="' + esc(s.path) + '">' +
          '<span class="ic">' + (isDriveRoot(s.path) ? '💽' : '📁') + '</span>' +
          '<span class="nm">' + esc(s.label || s.path) + '</span>' + missing +
          '<span class="x" data-act="del-source" title="从源库移除">✕</span>' +
        '</li>'
      );
    });
    els.sourceList.innerHTML = html.join('') || '<li class="source-item"><span class="nm muted">暂无源目录</span></li>';
  }

  function isDriveRoot(p) {
    return /^[a-zA-Z]:\\?$/.test(String(p || ''));
  }

  function samePath(a, b) {
    if (!a || !b) return false;
    var x = String(a).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    var y = String(b).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    return x === y;
  }

  function addSource() {
    var p = AWB.cep.pickFolder('选择要加入源库的文件夹');
    if (!p) return;
    if (S.sources.some(function (s) { return samePath(s.path, p); })) {
      AWB.app.toast('这个文件夹已在源库中');
      return;
    }
    var label = p.replace(/\\+$/, '');
    var parts = label.split('\\');
    label = parts.length > 1 ? parts[parts.length - 1] : label;
    if (!label) label = p;
    S.sources.push({ path: p, label: label });
    AWB.store.set('sources', S.sources);
    renderSources();
    navigate(p);
  }

  function bindSources() {
    document.getElementById('sourceList').onclick = function (e) {
      var del = core.closest(e.target, '[data-act="del-source"]');
      var li = core.closest(e.target, '.source-item');
      if (!li) return;
      var i = Number(li.getAttribute('data-i'));
      if (del) {
        e.stopPropagation();
        S.sources.splice(i, 1);
        AWB.store.set('sources', S.sources);
        renderSources();
        return;
      }
      var s = S.sources[i];
      if (s && s.path) navigate(s.path);
    };
    document.getElementById('sourceList').oncontextmenu = function (e) {
      var li = core.closest(e.target, '.source-item');
      if (!li) return;
      e.preventDefault();
      var i = Number(li.getAttribute('data-i'));
      var s = S.sources[i];
      if (!s) return;
      AWB.app.contextMenu(e.clientX, e.clientY, [
        { label: '在资源管理器中打开', run: function () { AWB.node.showInExplorer(s.path); } },
        { label: '复制路径', run: function () { AWB.cep.copyText(s.path); AWB.app.toast('已复制路径', 'ok'); } },
        { sep: true },
        { label: '从源库移除', run: function () { S.sources.splice(i, 1); AWB.store.set('sources', S.sources); renderSources(); } },
      ]);
    };
  }

  /* ---------------- 导航 ---------------- */
  function navigate(dir, pushHistory) {
    if (!dir) return;
    clearTimeout(selectionPaintTimer);
    selectionPaintTimer = 0;
    if (S.walkCancel) {
      S.walkCancel();
      S.walkCancel = null;
    }
    var res = AWB.node.listDir(dir);
    if (!res.ok) {
      AWB.app.toast(res.error, 'err');
      return;
    }
    if (pushHistory !== false && S.curDir && !samePath(S.curDir, dir)) {
      S.backStack.push(S.curDir);
      S.fwdStack.length = 0;
    }
    S.curDir = res.dir;
    S.entries = res.entries || [];
    S.parent = res.parent || null;
    S.searchMode = 'none';
    S.anchor = -1;
    clearSel();
    S.sel = {};
    AWB.store.set('lastDir', S.curDir);
    renderBreadcrumb();
    renderSources();
    els.search.value = '';
    applyFilter(true);
    AWB.preview.empty();
    AWB.app.setStatus('载入 ' + S.curDir + (res.truncated ? '（文件过多，已截断）' : ''));
    updateNavButtons();
  }

  function goBack() {
    if (!S.backStack.length) return;
    var prev = S.backStack.pop();
    S.fwdStack.push(S.curDir);
    navigate(prev, false);
  }

  function goForward() {
    if (!S.fwdStack.length) return;
    var next = S.fwdStack.pop();
    S.backStack.push(S.curDir);
    navigate(next, false);
  }

  function goUp() {
    var res = AWB.node.listDir(S.curDir);
    if (res.ok && res.parent) navigate(res.parent);
  }

  function updateNavButtons() {
    document.getElementById('btnBack').disabled = !S.backStack.length;
    document.getElementById('btnForward').disabled = !S.fwdStack.length;
    document.getElementById('btnUp').disabled = !S.parent;
  }

  function renderBreadcrumb() {
    var p = S.curDir || '';
    var parts = p.replace(/\\+$/, '').split('\\');
    var acc = '';
    var html = [];
    parts.forEach(function (part, i) {
      acc = i === 0 ? part : acc + '\\' + part;
      var target = i === 0 ? part + '\\' : acc;
      if (i > 0) html.push('<span class="sep">›</span>');
      html.push('<span class="crumb" data-path="' + esc(target) + '" title="' + esc(target) + '">' + esc(part || target) + '</span>');
    });
    els.breadcrumb.innerHTML = html.join('');
    Array.prototype.forEach.call(els.breadcrumb.querySelectorAll('.crumb'), function (c) {
      c.onclick = function () {
        navigate(c.getAttribute('data-path'));
      };
    });
  }

  /* ---------------- 搜索 ---------------- */
  function onSearch() {
    var q = els.search.value.trim();
    if (S.walkCancel) {
      S.walkCancel();
      S.walkCancel = null;
    }
    if (!q) {
      S.searchMode = 'none';
      applyFilter(true);
      return;
    }
    if (els.recursive.checked) {
      S.searchMode = 'walk';
      S.entries = [];
      S.view = [];
      render(true);
      AWB.app.setStatus('正在递归搜索：' + q + ' …');
      var found = [];
      var kw = q.toLowerCase();
      S.walkCancel = AWB.node.walk(
        S.curDir,
        function (batch, total, done) {
          batch.forEach(function (en) {
            if (en.name.toLowerCase().indexOf(kw) >= 0) {
              en.displayPath = en.path.slice(S.curDir.length).replace(/^\\/, '');
              found.push(en);
            }
          });
          if (found.length > 4000) found = found.slice(0, 4000);
          S.entries = found;
          applyFilter(false);
          if (done) {
            S.walkCancel = null;
            AWB.app.setStatus('递归搜索完成：找到 ' + found.length + ' 项（已扫描 ' + total + ' 个条目）');
          } else {
            AWB.app.setStatus('搜索中… 已找到 ' + found.length + ' 项（扫描 ' + total + '）');
          }
        },
        { maxFiles: 200000 }
      );
    } else {
      S.searchMode = 'filter';
      applyFilter(true);
    }
  }

  /* ---------------- 渲染 ---------------- */
  function applyFilter(resetScroll) {
    var q = S.searchMode === 'walk' ? '' : els.search.value.trim().toLowerCase();
    var base = S.entries;
    if (q && S.searchMode === 'filter') {
      base = base.filter(function (e) {
        return e.name.toLowerCase().indexOf(q) >= 0;
      });
    }
    var sorted = core.sortEntries(base, S.sortBy, S.sortDir);
    S.view = sorted;
    render(resetScroll);
    AWB.app.setStatus(statusLine());
    updateSelInfo();
  }

  function statusLine() {
    var n = S.view ? S.view.length : 0;
    var extra = S.searchMode === 'walk' ? '（递归搜索结果）' : '';
    return (S.curDir || '') + '    ' + n + ' 项' + extra;
  }

  function render(resetScroll) {
    if (isGridView()) renderGrid();
    else fileVList.setItems(S.view, !resetScroll);
    updateSelInfo();
  }

  function isGridView() {
    return !els.gridView.classList.contains('hidden');
  }

  function setView(v, silent) {
    var grid = v === 'grid';
    els.gridView.classList.toggle('hidden', !grid);
    els.fileList.classList.toggle('hidden', grid);
    document.getElementById('btnViewToggle').textContent = grid ? '☰' : '▦';
    document.getElementById('fileHead').classList.toggle('hidden', grid);
    AWB.store.set('view', v);
    if (!silent) render();
  }

  function iconFor(e) {
    if (e.isDir) return '📁';
    var k = e.kind;
    if (k === 'aep') return '🎬';
    if (k === 'preset') return '🧩';
    if (k === 'archive') return '🗜';
    if (k === 'font') return '🔤';
    if (k === 'model') return '🧊';
    if (k === 'audio') return '🎵';
    if (k === 'video') return '🎞';
    if (k === 'text') return '📄';
    if (k === 'image') return '🖼';
    return '📄';
  }

  function renderRow(e, i) {
    var sel = S.sel[e.path] ? ' sel' : '';
    var dir = e.isDir ? ' dir' : '';
    var name = e.displayPath ? e.displayPath : e.name;
    var thumb = '';
    if (e.kind === 'image' && !e.isDir) {
      thumb = '<img class="thumb" loading="lazy" src="' + esc(AWB.node.fileUrl(e.path)) + '" alt="" />';
    } else {
      thumb = '<span class="ico">' + iconFor(e) + '</span>';
    }
    var seq = !e.isDir && core.isImageSequence(e.name) ? '<span class="badge">序列</span>' : '';
    return (
      '<div class="frow' + dir + sel + '" data-idx="' + i + '" title="' + esc(e.path) + '">' +
      '<span class="c-name">' + thumb + '<span class="txt">' + esc(name) + '</span>' + seq + '</span>' +
      '<span class="c-type">' + esc(e.isDir ? '文件夹' : e.typeLabel) + '</span>' +
      '<span class="c-size">' + (e.isDir ? '' : esc(core.formatBytes(e.size))) + '</span>' +
      '<span class="c-time">' + esc(core.formatTime(e.mtime)) + '</span>' +
      '</div>'
    );
  }

  function renderGrid() {
    var items = S.view.slice(0, 600);
    var html = items.map(function (e, i) {
      var sel = S.sel[e.path] ? ' sel' : '';
      var inner;
      if (e.isDir) inner = '📁';
      else if (e.kind === 'image') inner = '<img loading="lazy" src="' + esc(AWB.node.fileUrl(e.path)) + '" alt="" />';
      else if (e.kind === 'video') inner = '🎞<span class="play">视频</span>';
      else if (e.kind === 'aep') inner = '🎬';
      else inner = iconFor(e);
      return (
        '<div class="card' + sel + '" data-idx="' + i + '" title="' + esc(e.path) + '">' +
        '<div class="cv" data-vid="' + (e.kind === 'video' ? '1' : '0') + '">' + inner + '</div>' +
        '<div class="cn">' + esc(e.displayPath || e.name) + '</div>' +
        '</div>'
      );
    });
    els.gridView.innerHTML = html.join('') || '<div class="pv-empty">这里没有文件</div>';
    if (S.view.length > 600) {
      els.gridView.insertAdjacentHTML('beforeend', '<div class="pv-empty" style="grid-column:1/-1">仅显示前 600 项，请用搜索缩小范围</div>');
    }
    // 视频首帧缩略图（懒队列）
    Array.prototype.forEach.call(els.gridView.querySelectorAll('.card'), function (card) {
      var idx = Number(card.getAttribute('data-idx'));
      var e = S.view[idx];
      if (e && e.kind === 'video') enqueueThumb(e, card.querySelector('.cv'));
    });
  }

  function enqueueThumb(entry, cv) {
    thumbQueue.push({ entry: entry, cv: cv, tries: 0 });
    pumpThumbs();
  }

  function pumpThumbs() {
    var max = AWB.store.get('thumbConcurrency') || 4;
    while (thumbActive < max && thumbQueue.length) {
      var job = thumbQueue.shift();
      if (!job.cv || !document.body.contains(job.cv)) continue;
      thumbActive++;
      (function (job) {
        AWB.node.thumbFor(job.entry, function (err, out) {
          if (!err && job.cv && document.body.contains(job.cv)) {
            job.cv.innerHTML = '<img src="' + esc(AWB.node.fileUrl(out)) + '" alt="" /><span class="play">视频</span>';
          }
          thumbActive--;
          pumpThumbs();
        });
      })(job);
    }
  }

  function onRowImageError(e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    var isThumb = t.classList.contains('thumb') || (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('cv'));
    if (!isThumb) return;
    var span = document.createElement('span');
    span.className = 'ico';
    span.textContent = '🖼';
    if (t.parentNode) t.parentNode.replaceChild(span, t);
  }

  function renderHead() {
    Array.prototype.forEach.call(els.head.querySelectorAll('.col'), function (c) {
      var by = c.getAttribute('data-sort');
      c.classList.toggle('sorted', by === S.sortBy);
      c.textContent = c.textContent.replace(/[↑↓]$/, '').trim() + (by === S.sortBy ? (S.sortDir === 'asc' ? ' ↑' : ' ↓') : '');
    });
  }

  /* ---------------- 选择 ---------------- */
  function clearSel() {
    S.sel = {};
    S.selCount = 0;
  }

  function updateSelInfo() {
    var el = document.getElementById('selInfo');
    if (!el) return;
    if (!S.selCount) {
      el.textContent = '';
      return;
    }
    el.textContent = '已选择 ' + S.selCount + ' 项';
  }

  function selectRange(from, to, skipRender) {
    var a = Math.min(from, to);
    var b = Math.max(from, to);
    for (var i = a; i <= b; i++) {
      var e = S.view[i];
      if (e) S.sel[e.path] = true;
    }
    recalcSel(skipRender);
  }

  function recalcSel(skipRender) {
    S.selCount = Object.keys(S.sel).length;
    updateSelInfo();
    if (!skipRender) render();
  }

  // Keep the row DOM alive until the click/dblclick sequence has finished.
  // Repainting on the first click replaces the virtual-list row and makes the
  // following dblclick lose its data-idx target in CEP/CEF.
  function scheduleSelectionPaint() {
    clearTimeout(selectionPaintTimer);
    selectionPaintTimer = setTimeout(function () {
      selectionPaintTimer = 0;
      render();
    }, 360);
  }

  function currentIndexFromEvent(e) {
    var row = core.closest(e.target, '[data-idx]');
    if (!row) return -1;
    return Number(row.getAttribute('data-idx'));
  }

  function onListClick(e) {
    var idx = currentIndexFromEvent(e);
    if (idx < 0) return;
    var entry = S.view[idx];
    if (!entry) return;
    if (!isGridView()) {
      try {
        els.fileList.focus();
      } catch (err) {
        /* ignore */
      }
    }
    if (e.ctrlKey || e.metaKey) {
      if (S.sel[entry.path]) delete S.sel[entry.path];
      else S.sel[entry.path] = true;
      S.anchor = idx;
      recalcSel(true);
    } else if (e.shiftKey && S.anchor >= 0) {
      clearSel();
      selectRange(S.anchor, idx, true);
    } else {
      clearSel();
      S.sel[entry.path] = true;
      S.anchor = idx;
      recalcSel(true);
    }
    scheduleSelectionPaint();
    AWB.preview.show(entry);
  }

  function onListDblClick(e) {
    var idx = currentIndexFromEvent(e);
    if (idx < 0) return;
    var entry = S.view[idx];
    if (!entry) return;
    if (entry.isDir) navigate(entry.path);
    else importPaths([entry.path], false);
  }

  function onListContext(e) {
    e.preventDefault();
    var idx = currentIndexFromEvent(e);
    if (idx < 0) return;
    var entry = S.view[idx];
    if (!entry) return;
    if (!S.sel[entry.path]) {
      clearSel();
      S.sel[entry.path] = true;
      S.anchor = idx;
      recalcSel();
      AWB.preview.show(entry);
    }
    var many = S.selCount > 1;
    var items = [
      { label: '导入到项目面板', run: function () { importPaths(selPathsOr(entry), false); }, key: '双击' },
      { label: '导入并加入当前合成', run: function () { importPaths(selPathsOr(entry), true); } },
    ];
    if (!entry.isDir && entry.kind === 'image' && core.isImageSequence(entry.name)) {
      items.push({ label: '作为图片序列导入', run: function () { importPaths([entry.path], false, { sequence: true }); } });
    }
    if (entry.kind === 'aep') {
      items.push({ label: '在 AE 中打开工程', run: function () { openProject(entry.path); } });
    }
    items.push({ sep: true });
    items.push({ label: many ? '在资源管理器中显示（首个）' : '在资源管理器中显示', run: function () { AWB.node.showInExplorer(entry.path); } });
    items.push({ label: '复制完整路径', run: function () { AWB.cep.copyText(selPathsOr(entry).join('\n')); AWB.app.toast('已复制 ' + selPathsOr(entry).length + ' 个路径', 'ok'); } });
    items.push({ label: '复制文件名', run: function () { AWB.cep.copyText(entry.name); AWB.app.toast('已复制文件名', 'ok'); } });
    if (entry.isDir) items.push({ label: '加入源库', run: function () { S.sources.push({ path: entry.path, label: entry.name }); AWB.store.set('sources', S.sources); renderSources(); AWB.app.toast('已加入源库', 'ok'); } });
    items.push({ sep: true });
    items.push({ label: '刷新当前目录', run: function () { navigate(S.curDir, false); } });
    AWB.app.contextMenu(e.clientX, e.clientY, items);
  }

  function selPathsOr(entry) {
    var paths = Object.keys(S.sel);
    if (S.sel[entry.path]) return paths;
    return [entry.path];
  }

  function onKeyDown(e) {
    if (e.target !== els.fileList) return;
    var idx = S.anchor;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!S.view.length) return;
      var next = idx < 0 ? 0 : idx + (e.key === 'ArrowDown' ? 1 : -1);
      next = Math.max(0, Math.min(S.view.length - 1, next));
      S.anchor = next;
      var entry = S.view[next];
      if (!e.shiftKey) clearSel();
      S.sel[entry.path] = true;
      recalcSel();
      fileVList.scrollToIndex(next);
      AWB.preview.show(entry);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var cur = S.view[S.anchor];
      if (!cur) return;
      if (cur.isDir) navigate(cur.path);
      else importPaths(selPathsOr(cur), false);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      goUp();
    } else if (e.key === 'Escape') {
      clearSel();
      recalcSel();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      clearSel();
      S.view.forEach(function (x) { S.sel[x.path] = true; });
      recalcSel();
    }
  }

  /* ---------------- 导入 ---------------- */
  function selFilePaths() {
    return Object.keys(S.sel).filter(function (p) {
      var f = S.view.filter(function (x) { return x.path === p; })[0];
      return f && !f.isDir;
    });
  }

  function importSelected() {
    var paths = selFilePaths();
    if (!paths.length) {
      AWB.app.toast('请先选择文件（文件夹不会被导入）', 'err');
      return;
    }
    importPaths(paths, false);
  }

  function importAll() {
    var files = S.view.filter(function (x) { return !x.isDir; });
    if (!files.length) {
      AWB.app.toast('当前列表没有文件', 'err');
      return;
    }
    if (files.length > 60) {
      AWB.app.confirm('导入 ' + files.length + ' 个文件到项目面板？', function () {
        importPaths(files.map(function (x) { return x.path; }), false);
      });
      return;
    }
    importPaths(files.map(function (x) { return x.path; }), false);
  }

  function importPaths(paths, intoComp, opts) {
    if (!paths || !paths.length) return;
    opts = opts || {};
    AWB.app.setStatus('正在导入 ' + paths.length + ' 个文件…', true);
    var fn = intoComp ? 'importIntoComp' : 'importFiles';
    var extra = opts.sequence ? '\u0001seq' : '';
    AWB.cep
      .callHost(fn, paths.join('\n') + extra)
      .then(function (body) {
        var rows = AWB.cep.parseTable(body, ['path', 'ok', 'msg']);
        var okCount = 0;
        var fails = [];
        rows.forEach(function (r) {
          if (r.ok === '1') okCount++;
          else fails.push(r.msg || r.path);
        });
        if (okCount) AWB.app.toast('已导入 ' + okCount + ' 个文件' + (fails.length ? '，' + fails.length + ' 个失败' : ''), fails.length ? 'err' : 'ok');
        else AWB.app.toast('导入失败：' + (fails[0] || '未知原因'), 'err');
        AWB.app.setStatus('导入完成：成功 ' + okCount + ' / ' + rows.length);
      })
      .catch(function (err) {
        AWB.app.toast('导入失败：' + err.message, 'err');
        AWB.app.setStatus('导入失败');
      });
  }

  function openProject(path) {
    AWB.cep
      .callHost('openProject', path)
      .then(function () {
        AWB.app.toast('已打开工程：' + path, 'ok');
      })
      .catch(function (err) {
        AWB.app.toast('打开工程失败：' + err.message, 'err');
      });
  }

  AWB.files = {
    init: init,
    navigate: navigate,
    importPaths: importPaths,
    importSelected: importSelected,
    importAll: importAll,
    openProject: openProject,
    getState: function () { return S; },
    refresh: function () { navigate(S.curDir, false); },
    addSource: addSource,
    goLibrary: function () { document.getElementById('btnGoLibrary').click(); },
  };
})();

