/**
 * CEP / ExtendScript 桥接层。
 * 与 host.jsx 的协议：字符串参数 + "OK/ERR + 换行 + 行数据(字段以 \u0001 分隔)"。
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});
  // CEP exposes the evalScript bridge as __adobe_cep__, while file dialogs
  // are exposed by the global `cep` object.  Some AE/CEP builds only expose
  // one of them, so keep both handles and use whichever is available.
  var cep = window.__adobe_cep__ || null;
  var cepFs = (window.cep && window.cep.fs ? window.cep : null) || (cep && cep.fs ? cep : null);

  var HOST_TIMEOUT = 30000;

  function hasCep() {
    return !!cep;
  }

  function evalScript(script, timeout) {
    return new Promise(function (resolve, reject) {
      if (!cep || typeof cep.evalScript !== 'function') {
        reject(new Error('当前不在 AE 面板环境（缺少 CEP 接口），请在 AE 的「窗口 > 扩展」中打开本面板。'));
        return;
      }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('AE 脚本调用超时'));
      }, timeout || HOST_TIMEOUT);
      try {
        cep.evalScript(script, function (res) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(res);
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  /** 调用 host.jsx 里的 __AWB.<fn>(param)，param 为纯字符串 */
  function callHost(fn, param) {
    var script = '__AWB.' + fn + '(' + JSON.stringify(param == null ? '' : String(param)) + ')';
    return evalScript(script).then(function (raw) {
      if (raw === 'EvalScript error.' || raw == null || raw === '') {
        throw new Error('AE 侧脚本未响应，请重启 After Effects 后再试（host.jsx 未加载）');
      }
      var nl = raw.indexOf('\n');
      var head = nl < 0 ? raw : raw.slice(0, nl);
      var body = nl < 0 ? '' : raw.slice(nl + 1);
      if (head === 'OK') return body;
      if (head === 'ERR') throw new Error(body || 'AE 返回错误');
      throw new Error('无法识别的返回：' + String(raw).slice(0, 300));
    });
  }

  /** 把表格式返回解析成对象数组 */
  function parseTable(body, fields) {
    if (!body) return [];
    var lines = String(body).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var cells = lines[i].split('\u0001');
      var obj = {};
      for (var k = 0; k < fields.length; k++) obj[fields[k]] = cells[k] == null ? '' : cells[k];
      out.push(obj);
    }
    return out;
  }

  function extensionPath() {
    try {
      if (cep && typeof cep.getSystemPath === 'function') return cep.getSystemPath('extension');
    } catch (e) {
      /* ignore */
    }
    try {
      var p = decodeURIComponent(window.location.pathname).replace(/^\//, '').replace(/\//g, '\\');
      return p.replace(/\\client\\index\.html$/i, '');
    } catch (e2) {
      return null;
    }
  }

  function copyText(text) {
    text = String(text == null ? '' : text);
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /** 选文件夹对话框，返回路径或 null */
  function pickFolder(title) {
    try {
      if (cepFs && cepFs.fs && cepFs.fs.showOpenDialogEx) {
        var r = cepFs.fs.showOpenDialogEx(false, true, title || '选择文件夹', '');
        if (r && r.data && r.data.length) return r.data[0];
        return null;
      }
    } catch (e) {
      /* fallthrough */
    }
    return null;
  }

  /** 选文件（资料库 data.js 之类） */
  function pickFile(title, filterList) {
    try {
      if (cepFs && cepFs.fs && cepFs.fs.showOpenDialogEx) {
        var r = cepFs.fs.showOpenDialogEx(false, false, title || '选择文件', '', filterList || '');
        if (r && r.data && r.data.length) return r.data[0];
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  AWB.cep = {
    hasCep: hasCep,
    evalScript: evalScript,
    callHost: callHost,
    parseTable: parseTable,
    extensionPath: extensionPath,
    copyText: copyText,
    pickFolder: pickFolder,
    pickFile: pickFile,
  };
})();

