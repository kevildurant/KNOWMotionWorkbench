/**
 * 右侧预览栏：图片 / 视频 / 音频 / 文本 / 工程信息。
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});
  var core = AWB.core;
  var esc = core.escapeHtml;

  var bodyEl, headEl;
  var current = null;
  var token = 0;
  var proxyBusy = false;

  function init() {
    bodyEl = document.getElementById('previewBody');
    headEl = document.getElementById('previewHead');
    bodyEl.onclick = onClick;
    bodyEl.addEventListener('error', onMediaError, true);
    bodyEl.addEventListener('load', onImageLoad, true);
  }

  function empty(html) {
    current = null;
    bodyEl.innerHTML = '<div class="pv-empty">' + (html || '选择左侧文件查看内容<br>双击 = 导入到 AE 工程') + '</div>';
  }

  function onImageLoad(e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG' || !current) return;
    if (!t.naturalWidth) return;
    var dim = document.getElementById('pvDim');
    if (dim) dim.textContent = t.naturalWidth + ' × ' + t.naturalHeight + ' px';
  }

  function onMediaError(e) {
    var t = e.target;
    if (!t || (t.tagName !== 'VIDEO' && t.tagName !== 'IMG')) return;
    var box = bodyEl.querySelector('.pv-media');
    if (!box) return;
    if (t.tagName === 'IMG') {
      box.innerHTML = '<div class="pv-empty">无法显示该图片<br><span class="muted">' + esc(t.getAttribute('src') || '') + '</span></div>';
      return;
    }
    if (proxyBusy) return;
    proxyBusy = true;
    var entry = current;
    box.innerHTML = '<div class="pv-empty">此编码无法直接播放<br><span class="muted">正在用 ffmpeg 生成 480p 代理…</span></div>';
    AWB.node.proxyFor(entry, function (err, out) {
      proxyBusy = false;
      if (!current || current.path !== entry.path) return;
      if (err) {
        box.innerHTML = '<div class="pv-empty">生成代理失败：' + esc(err.message || String(err)) + '<br><span class="muted">可在设置里指定 ffmpeg 路径</span></div>';
        return;
      }
      box.innerHTML = '<video controls autoplay muted loop src="' + esc(AWB.node.fileUrl(out)) + '"></video>';
    });
  }

  function metaRow(k, v) {
    return '<div class="k">' + esc(k) + '</div><div class="v">' + esc(v == null ? '' : v) + '</div>';
  }

  function actions(entry) {
    var k = entry.kind;
    var html = '<div class="pv-actions">';
    html += '<button data-act="import">导入工程</button>';
    html += '<button data-act="import-comp">导入并加入合成</button>';
    if (k === 'image' && core.isImageSequence(entry.name)) {
      html += '<button data-act="import-seq">作为序列导入</button>';
    }
    if (k === 'aep') html += '<button data-act="open-project">在 AE 中打开工程</button>';
    html += '<button data-act="reveal">资源管理器</button>';
    html += '<button data-act="copy-path">复制路径</button>';
    html += '</div>';
    html += '<div class="pv-tip">双击文件 = ' + (k === 'aep' ? '导入工程' : '导入到项目面板') + '；右键更多操作</div>';
    return html;
  }

  function media(entry) {
    var url = AWB.node.fileUrl(entry.path);
    if (entry.kind === 'image') {
      return '<div class="pv-media"><img src="' + esc(url) + '" alt="" /></div>';
    }
    if (entry.kind === 'video') {
      return '<div class="pv-media"><video controls autoplay muted loop preload="metadata" src="' + esc(url) + '"></video></div>';
    }
    if (entry.kind === 'audio') {
      return '<div class="pv-media"><audio controls src="' + esc(url) + '"></audio></div>';
    }
    if (entry.kind === 'aep') {
      return '<div class="pv-media"><div class="pv-icon">🎬</div></div>';
    }
    if (entry.kind === 'folder') {
      return '<div class="pv-media"><div class="pv-icon">📁</div></div>';
    }
    return '<div class="pv-media"><div class="pv-icon">📄</div></div>';
  }

  function show(entry) {
    if (!entry) {
      empty();
      return;
    }
    current = entry;
    var my = ++token;
    proxyBusy = false;
    headEl.textContent = entry.isDir ? '文件夹' : entry.typeLabel || '文件';

    var meta = '<div class="pv-meta">';
    meta += metaRow('名称', entry.name);
    meta += metaRow('类型', entry.typeLabel || entry.ext);
    meta += metaRow('大小', entry.isDir ? '—' : core.formatBytes(entry.size));
    meta += metaRow('修改', core.formatTime(entry.mtime));
    meta += metaRow('路径', entry.path);
    meta += '</div>';

    var dim = entry.kind === 'image' ? '<div class="pv-tip" id="pvDim"></div>' : '';
    var html = media(entry) + '<div class="pv-name">' + esc(entry.name) + '</div>' + dim + meta + actions(entry);
    bodyEl.innerHTML = html;

    if (entry.kind === 'text') {
      var r = AWB.node.readText(entry.path, 131072);
      if (my !== token) return;
      var box = bodyEl.querySelector('.pv-media');
      if (r.ok) {
        box.innerHTML = '<pre>' + esc(r.text) + (r.truncated ? '\n\n… 文件较大，仅显示前 128KB' : '') + '</pre>';
      } else {
        box.innerHTML = '<div class="pv-empty">无法读取文本：' + esc(r.error) + '</div>';
      }
    } else if (entry.kind === 'folder') {
      var lr = AWB.node.listDir(entry.path);
      if (my !== token) return;
      var box2 = bodyEl.querySelector('.pv-media');
      if (lr.ok) {
        var dirs = 0;
        var files = 0;
        var size = 0;
        lr.entries.forEach(function (x) {
          if (x.isDir) dirs++;
          else {
            files++;
            size += x.size || 0;
          }
        });
        box2.innerHTML = '<div class="pv-empty"><b style="color:#d7dae0;font-size:20px">📁</b><br>' + dirs + ' 个文件夹 · ' + files + ' 个文件 · ' + core.formatBytes(size) + '<br><span class="muted">双击进入</span></div>';
      } else {
        box2.innerHTML = '<div class="pv-empty">' + esc(lr.error) + '</div>';
      }
    } else if (entry.kind === 'image') {
      // 图片尺寸由 load 事件补全
    }
  }

  function onClick(e) {
    var btn = core.closest(e.target, 'button[data-act]');
    if (!btn || !current) return;
    var act = btn.getAttribute('data-act');
    var entry = current;
    if (act === 'import') AWB.files.importPaths([entry.path], false);
    else if (act === 'import-comp') AWB.files.importPaths([entry.path], true);
    else if (act === 'import-seq') AWB.files.importPaths([entry.path], false, { sequence: true });
    else if (act === 'open-project') AWB.files.openProject(entry.path);
    else if (act === 'reveal') {
      if (AWB.node.showInExplorer(entry.path)) AWB.app.toast('已在资源管理器中定位', 'ok');
      else AWB.app.toast('无法打开资源管理器', 'err');
    }
    else if (act === 'copy-path') {
      var copied = AWB.cep.copyText(entry.path);
      AWB.app.toast(copied ? '已复制路径' : '复制失败，请手动选择', copied ? 'ok' : 'err');
    }
  }

  AWB.preview = {
    init: init,
    show: show,
    empty: empty,
  };
})();

