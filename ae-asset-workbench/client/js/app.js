/**
 * 面板外壳：标签切换、提示、弹窗、右键菜单、设置、与 AE 的连接状态。
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});
  var core = AWB.core;
  var esc = core.escapeHtml;

  var toastTimer = 0;
  var ctxEl = null;
  var hostInfo = null;
  var nodeRetryCount = 0;

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (!AWB.node.available()) {
      nodeRetryCount++;
      var status = document.getElementById('statusText');
      if (status) status.textContent = '正在等待 CEP Node 运行时…（' + nodeRetryCount + '/40）';
      if (nodeRetryCount < 40) {
        setTimeout(boot, 250);
        return;
      }
      document.body.innerHTML =
        '<div style="padding:24px;font-family:sans-serif;color:#e6e9ee;line-height:1.8">' +
        '<h3>面板缺少 Node 支持</h3>' +
        '<p>CEP Node 注入超时。请确认 manifest.xml 含 <code>--enable-nodejs</code> 和 <code>--mixed-context</code>，然后完全退出 After Effects 再打开。</p>' +
        '<p style="color:#fbbf24">如果反复出现，请检查：' + esc(String(AWB.node.lastError ? AWB.node.lastError() : 'CEP 未注入 cep_node')) + '</p>' +
        '</div>';
      return;
    }
    nodeRetryCount = 0;

    AWB.preview.init();
    AWB.files.init();
    AWB.effects.init();

    bindTabs();
    bindTop();
    bindStatusBar();
    bindGlobalKeys();

    // CEP swallows exceptions thrown from click handlers in some builds.  A
    // visible error keeps a failed action from looking like a dead button.
    window.addEventListener('error', function (e) {
      var msg = e && e.error && e.error.message ? e.error.message : (e && e.message) || '操作失败';
      toast(msg, 'err');
      setStatus('操作失败：' + msg);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var reason = e && e.reason;
      var msg = reason && reason.message ? reason.message : String(reason || '操作失败');
      toast(msg, 'err');
      setStatus('操作失败：' + msg);
    });

    window.addEventListener('beforeunload', function () {
      AWB.store.saveNow();
    });

    pingHost();
    setStatus('就绪');
  }

  /* ---------------- AE 连接 ---------------- */
  function pingHost() {
    var infoEl = document.getElementById('hostInfo');
    AWB.cep
      .callHost('info', '')
      .then(function (body) {
        var c = body.split('\u0001');
        hostInfo = {
          version: c[0] || '',
          domVersion: c[1] || '',
          project: c[2] || '',
          comp: c[3] || '',
          layers: Number(c[4] || 0),
        };
        AWB.app.hostInfo = hostInfo;
        infoEl.textContent = 'AE ' + (hostInfo.version || '?') + (hostInfo.comp ? ' · ' + hostInfo.comp : '');
        infoEl.title = '工程条目 ' + hostInfo.domVersion + '\n工程：' + (hostInfo.project || '未保存') + '\n当前合成：' + (hostInfo.comp || '无');
        if (!AWB.effects.getState().installed.length) AWB.effects.scanInstalled(false);
      })
      .catch(function (err) {
        infoEl.textContent = 'AE 未连接';
        infoEl.title = err.message;
        setStatus('AE 脚本未响应：' + err.message);
      });
  }

  function refreshHostInfo() {
    return AWB.cep
      .callHost('info', '')
      .then(function (body) {
        var c = body.split('\u0001');
        hostInfo = { version: c[0], domVersion: c[1], project: c[2], comp: c[3], layers: Number(c[4] || 0) };
        AWB.app.hostInfo = hostInfo;
        return hostInfo;
      });
  }

  /* ---------------- 标签 ---------------- */
  function bindTabs() {
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (t) {
      t.onclick = function () {
        switchTab(t.getAttribute('data-tab'));
      };
    });
  }

  // Old CEP/CEF builds have occasional issues with listeners attached during
  // panel bootstrap.  Assigning onclick is supported by all CEP versions and
  // gives every primary control one guarded, visible execution path.
  function bindButton(id, handler) {
    var el = document.getElementById(id);
    if (!el) return false;
    el.onclick = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      try {
        return handler(e);
      } catch (err) {
        var msg = err && err.message ? err.message : String(err);
        toast(msg, 'err');
        setStatus('操作失败：' + msg);
        return false;
      }
    };
    return true;
  }

  function switchTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
    document.getElementById('tab-files').classList.toggle('active', name === 'files');
    document.getElementById('tab-effects').classList.toggle('active', name === 'effects');
    var fileOnly = ['btnImportSelected', 'btnImportAll', 'btnViewToggle', 'selInfo'];
    fileOnly.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', name !== 'files');
    });
    if (name === 'files') setStatus('资源浏览');
    else setStatus('效果库');
    if (name === 'effects' && !AWB.effects.getState().rows.length) AWB.effects.init && AWB.effects.rebuild();
  }

  /* ---------------- 顶部按钮 ---------------- */
  function bindTop() {
    bindButton('btnReload', function () {
      var filesActive = document.getElementById('tab-files').classList.contains('active');
      if (filesActive) AWB.files.refresh();
      else AWB.effects.refresh();
      toast('已刷新');
    });
    bindButton('btnSettings', openSettings);
    bindButton('btnHelp', openHelp);
  }

  function bindStatusBar() {
    // btnViewToggle is owned by files.js; do not install a second listener.
  }

  /* ---------------- 全局快捷键 ---------------- */
  function bindGlobalKeys() {
    document.addEventListener('keydown', function (e) {
      var filesActive = document.getElementById('tab-files').classList.contains('active');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (filesActive) document.getElementById('searchInput').focus();
        else document.getElementById('fxSearch').focus();
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (filesActive) AWB.files.refresh();
      } else if (e.altKey && e.key === 'ArrowLeft' && filesActive) {
        e.preventDefault();
        document.getElementById('btnBack').click();
      } else if (e.altKey && e.key === 'ArrowRight' && filesActive) {
        e.preventDefault();
        document.getElementById('btnForward').click();
      }
    });
  }

  /* ---------------- 提示 ---------------- */
  function toast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (type === 'err' ? ' err' : type === 'ok' ? ' ok' : '');
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add('hidden');
    }, 2800);
  }

  function setStatus(text, busy) {
    var el = document.getElementById('statusText');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('busy', !!busy);
  }

  /* ---------------- 弹窗 ---------------- */
  function modal(opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    var buttons = opts.buttons || [{ label: '关闭' }];
    var btnHtml = buttons
      .map(function (b, i) {
        return '<button data-bi="' + i + '" class="' + (b.primary ? 'primary' : '') + '">' + esc(b.label) + '</button>';
      })
      .join('');
    wrap.innerHTML =
      '<div class="modal-box"' + (opts.width ? ' style="width:' + Number(opts.width) + 'px"' : '') + '>' +
      '<div class="modal-head"><span>' + esc(opts.title || '') + '</span><button class="icon" data-close="1" title="关闭">✕</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      '<div class="modal-foot">' + btnHtml + '</div>' +
      '</div>';
    document.getElementById('modalRoot').appendChild(wrap);

    function close() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    wrap.onclick = function (e) {
      if (e.target === wrap) close();
      var closer = core.closest(e.target, '[data-close]');
      if (closer) {
        close();
        return;
      }
      var b = core.closest(e.target, 'button[data-bi]');
      if (!b) return;
      var btn = buttons[Number(b.getAttribute('data-bi'))];
      if (!btn) return;
      if (typeof btn.onClick === 'function') {
        var r = btn.onClick(close);
        if (r === false) return;
      }
      close();
    };

    if (opts.onOpen) opts.onOpen(wrap);
    return close;
  }

  function confirm(msg, onYes) {
    modal({
      title: '请确认',
      width: 380,
      body: '<div style="line-height:1.7">' + esc(msg) + '</div>',
      buttons: [
        { label: '取消' },
        {
          label: '确定',
          primary: true,
          onClick: function () {
            if (typeof onYes === 'function') onYes();
          },
        },
      ],
    });
  }

  /* ---------------- 右键菜单 ---------------- */
  function contextMenu(x, y, items) {
    hideContextMenu();
    var el = document.getElementById('ctxMenu');
    var html = items
      .map(function (it, i) {
        if (it.sep) return '<div class="hr"></div>';
        return (
          '<div class="it' + (it.disabled ? ' disabled' : '') + '" data-i="' + i + '">' +
          '<span>' + esc(it.label) + '</span>' + (it.key ? '<span class="k">' + esc(it.key) + '</span>' : '') +
          '</div>'
        );
      })
      .join('');
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.style.left = '0px';
    el.style.top = '0px';
    var rect = el.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left = Math.min(x, vw - rect.width - 6);
    var top = Math.min(y, vh - rect.height - 6);
    el.style.left = Math.max(4, left) + 'px';
    el.style.top = Math.max(4, top) + 'px';
    ctxEl = el;

    el.onclick = function (e) {
      var it = core.closest(e.target, '[data-i]');
      if (!it) return;
      var item = items[Number(it.getAttribute('data-i'))];
      hideContextMenu();
      if (item && typeof item.run === 'function') item.run();
    };
    setTimeout(function () {
      document.addEventListener('mousedown', outsideCtx, true);
      document.addEventListener('keydown', escCtx, true);
    }, 0);
  }

  function outsideCtx(e) {
    var el = document.getElementById('ctxMenu');
    if (el && !el.contains(e.target)) hideContextMenu();
  }

  function escCtx(e) {
    if (e.key === 'Escape') hideContextMenu();
  }

  function hideContextMenu() {
    var el = document.getElementById('ctxMenu');
    if (el) {
      el.classList.add('hidden');
      el.innerHTML = '';
    }
    document.removeEventListener('mousedown', outsideCtx, true);
    document.removeEventListener('keydown', escCtx, true);
    ctxEl = null;
  }

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    var st = AWB.store.ensure();
    var view = st.view || 'list';
    modal({
      title: '设置',
      width: 520,
      body:
        '<div class="field"><label>AE 学习工作台资料库位置（同步效果名用）</label>' +
        '<input id="setLib" type="text" value="' + esc(st.libraryPath || '') + '" />' +
        '<span class="hint">可填文件夹，程序会自动寻找 resources\\app\\data.js</span></div>' +
        '<div class="field"><label>ffmpeg 路径（视频缩略图 / 代理转码）</label>' +
        '<input id="setFfmpeg" type="text" value="' + esc(st.ffmpegPath || '') + '" placeholder="留空自动查找，例如 C:\\ffmpeg\\bin\\ffmpeg.exe" />' +
        '<span class="hint">当前解析结果：' + esc(AWB.node.ffmpegPath(st.ffmpegPath) || '未找到，视频将无法生成缩略图') + '</span></div>' +
        '<div class="field"><label>默认视图</label><select id="setView">' +
        '<option value="list"' + (view === 'list' ? ' selected' : '') + '>列表</option>' +
        '<option value="grid"' + (view === 'grid' ? ' selected' : '') + '>缩略图</option></select></div>' +
        '<div class="field"><label>数据目录</label><div class="pv-tip" style="word-break:break-all">' + esc(AWB.node.dataDir()) + '</div></div>',
      buttons: [
        {
          label: '选择 ffmpeg…',
          onClick: function () {
            var p = AWB.cep.pickFile('选择 ffmpeg.exe');
            if (p) document.getElementById('setFfmpeg').value = p;
            return false;
          },
        },
        {
          label: '打开数据目录',
          onClick: function () {
            AWB.node.showInExplorer(AWB.node.dataDir());
            return false;
          },
        },
        {
          label: '清理缓存',
          onClick: function () {
            toast('已清理 ' + AWB.node.clearCache() + ' 个缓存文件', 'ok');
            return false;
          },
        },
        { label: '取消' },
        {
          label: '保存',
          primary: true,
          onClick: function () {
            AWB.store.patch({
              libraryPath: document.getElementById('setLib').value.trim(),
              ffmpegPath: document.getElementById('setFfmpeg').value.trim(),
              view: document.getElementById('setView').value,
            });
            AWB.store.saveNow();
            toast('设置已保存（视图切换在「资源」页生效）', 'ok');
          },
        },
      ],
    });
  }

  function openHelp() {
    modal({
      title: '使用说明',
      width: 560,
      body:
        '<div style="line-height:1.9">' +
        '<b>资源</b>：左侧「源库」是常用文件夹，点 ＋ 添加；中间是文件列表，双击文件夹进入、双击文件导入到 AE 工程项目面板；右侧预览图片 / 视频 / 文本；右键有更多操作（导入并加入合成、资源管理器、复制路径）。' +
        '<br><b>效果库</b>：收录 951 条 AE 插件汉化名资料。<b>单击行 = 复制效果名</b>；点「应用」把效果加到当前选中图层；灰色「未安装」说明本机没装该插件或名称没对上，点「绑定」手工指到已安装效果。' +
        '<br><b>快捷键</b>：Ctrl+F 搜索，F5 刷新，Alt+←/→ 后退前进，Backspace 上一级，Enter 导入所选，方向键移动选择。' +
        '<br><b>提示</b>：面板只读，不会删除或改名你的素材；缩略图和代理缓存在数据目录，可随时清理。' +
        '</div>',
      buttons: [{ label: '知道了', primary: true }],
    });
  }

  AWB.app = {
    boot: boot,
    toast: toast,
    setStatus: setStatus,
    modal: modal,
    confirm: confirm,
    contextMenu: contextMenu,
    switchTab: switchTab,
    bindButton: bindButton,
    hostInfo: hostInfo,
    refreshHostInfo: refreshHostInfo,
  };

  // The panel document is already present because this script is at the end
  // of index.html.  Run immediately and keep a DOMContentLoaded fallback for
  // CEP builds that report an early readyState.  boot() is idempotent.
  var started = false;
  var startOnce = function () {
    if (started) return;
    try {
      boot();
      started = true;
    } catch (err) {
      var msg = err && err.message ? err.message : String(err);
      document.body.innerHTML = '<div style="padding:24px;color:#fecaca;font-family:sans-serif;line-height:1.8"><h3>面板启动失败</h3><p>' + esc(msg) + '</p><p>请重启 After Effects；如果仍失败，请把这段错误信息发给我。</p></div>';
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startOnce);
    setTimeout(startOnce, 0);
  } else startOnce();
})();

