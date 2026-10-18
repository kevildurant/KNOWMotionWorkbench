/**
 * Node 层（CEP --enable-nodejs）：目录读取、缓存、ffmpeg、本地文件系统。
 * 所有函数都做了 try/catch，失败返回 {ok:false, error}，不让面板白屏。
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});

  function req(name) {
    try {
      if (window.cep_node && window.cep_node.require) return window.cep_node.require(name);
    } catch (e) {
      /* ignore */
    }
    try {
      if (typeof require === 'function') return require(name);
    } catch (e2) {
      /* ignore */
    }
    try {
      if (window.require && typeof window.require === 'function') return window.require(name);
    } catch (e3) {
      /* ignore */
    }
    try {
      // In a few CEP builds cep_node is injected as a bare global after the
      // document scripts have started.  typeof keeps this safe in strict mode.
      if (typeof cep_node !== 'undefined' && cep_node && cep_node.require) return cep_node.require(name);
    } catch (e4) {
      /* ignore */
    }
    return null;
  }

  var fs = null;
  var path = null;
  var os = null;
  var cp = null;
  var crypto = null;

  function ensureNode() {
    if (!fs) fs = req('fs');
    if (!path) path = req('path');
    if (!os) os = req('os');
    if (!cp) cp = req('child_process');
    if (!crypto) crypto = req('crypto');
    // The public object is created after this function declaration.  Sync the
    // late-resolved modules into it so callers do not keep the initial null
    // values captured during CEP startup.
    if (AWB.node) {
      AWB.node.fs = fs;
      AWB.node.path = path;
      AWB.node.os = os;
      AWB.node.cp = cp;
      AWB.node.crypto = crypto;
    }
    return !!(fs && path);
  }

  function available() {
    return ensureNode();
  }

  var extRoot = null;
  function extensionRoot() {
    if (extRoot) return extRoot;
    extRoot = AWB.cep.extensionPath() || '';
    return extRoot;
  }

  var dataRoot = null;
  function dataDir() {
    if (dataRoot) return dataRoot;
    var base = '';
    try {
      base = process.env.APPDATA || '';
    } catch (e) {
      base = '';
    }
    if (!base) base = os ? os.homedir() : extensionRoot();
    dataRoot = path.join(base, 'AE-Asset-Workbench');
    return dataRoot;
  }

  function ensureDir(dir) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  function cacheDir(sub) {
    var d = path.join(dataDir(), sub || 'cache');
    ensureDir(d);
    return d;
  }

  /* ---------------- JSON 读写 ---------------- */
  function readJSON(file, fallback) {
    try {
      if (!fs.existsSync(file)) return fallback;
      var txt = fs.readFileSync(file, 'utf8');
      if (!txt.trim()) return fallback;
      return JSON.parse(txt);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(file, obj) {
    try {
      ensureDir(path.dirname(file));
      var tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
      fs.renameSync(tmp, file);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  function readText(file, maxBytes) {
    try {
      var st = fs.statSync(file);
      var cap = Math.min(st.size, maxBytes || 262144);
      var buf = Buffer.alloc(cap);
      var fd = fs.openSync(file, 'r');
      var read = fs.readSync(fd, buf, 0, cap, 0);
      fs.closeSync(fd);
      return { ok: true, text: buf.slice(0, read).toString('utf8'), truncated: st.size > cap, size: st.size };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  /* ---------------- 目录 ---------------- */
  function entryInfo(fullPath, name) {
    var info = { name: name, path: fullPath, isDir: false, size: 0, mtime: 0, ext: '', kind: 'other', typeLabel: '' };
    try {
      var st = fs.lstatSync(fullPath);
      info.isDir = st.isDirectory();
      info.size = st.size;
      info.mtime = st.mtimeMs || st.mtime.getTime();
      var cls = AWB.core.classify(name, info.isDir);
      info.ext = cls.ext;
      info.kind = cls.kind;
      info.typeLabel = cls.label;
      if (st.isSymbolicLink() && !info.isDir) {
        try {
          var st2 = fs.statSync(fullPath);
          info.isDir = st2.isDirectory();
          info.size = st2.size;
        } catch (e) {
          /* broken link */
        }
      }
    } catch (e) {
      info.typeLabel = '无权限';
      info.error = String(e && e.message ? e.message : e);
    }
    return info;
  }

  function listDir(dir, limit) {
    try {
      var st = fs.statSync(dir);
      if (!st.isDirectory()) return { ok: false, error: '不是文件夹：' + dir };
    } catch (e) {
      return { ok: false, error: '无法访问：' + dir + '（' + (e && e.message ? e.message : e) + '）' };
    }
    try {
      var names = fs.readdirSync(dir);
      var max = limit || 20000;
      var out = [];
      var parent = dir.replace(/[\\/]+$/, '');
      parent = parent.slice(0, Math.max(parent.lastIndexOf('\\'), parent.lastIndexOf('/')));
      if (/^[a-zA-Z]:$/.test(parent)) parent = parent + '\\';
      if (!parent) parent = null;
      for (var i = 0; i < names.length && out.length < max; i++) {
        out.push(entryInfo(path.join(dir, names[i]), names[i]));
      }
      return { ok: true, dir: dir, parent: parent || null, entries: out, truncated: names.length > max };
    } catch (e) {
      return { ok: false, error: '读取目录失败：' + (e && e.message ? e.message : e) };
    }
  }

  function statOne(fullPath) {
    return entryInfo(fullPath, path.basename(fullPath));
  }

  function exists(p) {
    try {
      return fs.existsSync(p);
    } catch (e) {
      return false;
    }
  }

  /** 递归扫描（分块回调），返回取消函数 */
  function walk(root, onBatch, opts) {
    opts = opts || {};
    var cancelled = false;
    var total = 0;
    var queue = [root];
    var batch = [];
    var timer = 0;

    function flush() {
      timer = 0;
      if (cancelled) return;
      if (batch.length) {
        var b = batch;
        batch = [];
        onBatch(b, total);
      }
      if (!queue.length) {
        onBatch([], total, true);
        return;
      }
      step();
    }

    function step() {
      if (cancelled) return;
      var dir = queue.shift();
      try {
        var names = fs.readdirSync(dir);
        for (var i = 0; i < names.length; i++) {
          var full = path.join(dir, names[i]);
          var info = entryInfo(full, names[i]);
          total++;
          batch.push(info);
          if (info.isDir && !opts.noRecurse && total < (opts.maxFiles || 200000)) queue.push(full);
        }
      } catch (e) {
        /* 跳过不可读目录 */
      }
      timer = setTimeout(flush, 0);
    }

    step();
    return function cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }

  /* ---------------- 文件地址 ---------------- */
  function fileUrl(p) {
    var s = String(p || '').replace(/\\/g, '/');
    if (!/^[a-zA-Z]:/.test(s)) s = '/' + s;
    var parts = s.split('/');
    for (var i = 0; i < parts.length; i++) parts[i] = encodeURIComponent(parts[i]).replace(/%3A/gi, ':');
    return 'file:///' + parts.join('/').replace(/^\/+/, '');
  }

  /* ---------------- 资源管理器 ---------------- */
  function showInExplorer(p) {
    try {
      var isDir = false;
      try {
        isDir = fs.statSync(p).isDirectory();
      } catch (e) {
        isDir = false;
      }
      if (isDir) cp.spawn('explorer.exe', [p], { detached: true }).unref();
      else cp.spawn('explorer.exe', ['/select,', p], { detached: true }).unref();
      return true;
    } catch (e) {
      return false;
    }
  }

  function listDrives() {
    var out = [];
    for (var i = 67; i <= 90; i++) {
      var d = String.fromCharCode(i) + ':\\';
      if (exists(d)) out.push(String.fromCharCode(i) + ':');
    }
    return out;
  }

  /* ---------------- ffmpeg ---------------- */
  var ffmpegCache = null;
  function ffmpegPath(override) {
    if (override) return override;
    if (ffmpegCache !== null) return ffmpegCache;
    var candidates = [];
    try {
      if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
    } catch (e) {
      /* ignore */
    }
    candidates.push('C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\ffmpeg\\ffmpeg.exe', 'ffmpeg');
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c === 'ffmpeg') continue;
      if (exists(c)) {
        ffmpegCache = c;
        return c;
      }
    }
    // 最后尝试 PATH 里的 ffmpeg
    try {
      cp.execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 4000 });
      ffmpegCache = 'ffmpeg';
      return 'ffmpeg';
    } catch (e2) {
      ffmpegCache = '';
      return '';
    }
  }

  function run(bin, args, timeout, cb) {
    var done = false;
    var child = null;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      try {
        if (child) child.kill();
      } catch (e) {
        /* ignore */
      }
      cb(new Error('ffmpeg 超时'));
    }, timeout || 60000);
    try {
      child = cp.execFile(bin, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 8 }, function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cb(err || null);
      });
    } catch (e) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        cb(e);
      }
    }
  }

  function hash(str) {
    try {
      return crypto.createHash('md5').update(String(str)).digest('hex');
    } catch (e) {
      var h = 0;
      for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) | 0;
      return 'h' + Math.abs(h).toString(16);
    }
  }

  function thumbFor(info, cb) {
    var ff = ffmpegPath(AWB.store.get('ffmpegPath'));
    if (!ff) {
      cb(new Error('未找到 ffmpeg'));
      return;
    }
    var key = hash(info.path + '|' + info.mtime + '|' + info.size + '|320');
    var out = path.join(cacheDir('thumbs'), key + '.jpg');
    if (exists(out)) {
      cb(null, out);
      return;
    }
    var args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', info.path, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', out];
    run(ff, args, 25000, function (err) {
      if (!err && exists(out)) cb(null, out);
      else cb(err || new Error('抽帧失败'));
    });
  }

  function proxyFor(info, cb) {
    var ff = ffmpegPath(AWB.store.get('ffmpegPath'));
    if (!ff) {
      cb(new Error('未找到 ffmpeg'));
      return;
    }
    var key = hash(info.path + '|' + info.mtime + '|' + info.size + '|proxy480');
    var out = path.join(cacheDir('proxies'), key + '.mp4');
    if (exists(out)) {
      cb(null, out);
      return;
    }
    var args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', info.path, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out];
    run(ff, args, 120000, function (err) {
      if (!err && exists(out)) cb(null, out);
      else cb(err || new Error('转码失败'));
    });
  }

  function clearCache() {
    var root = path.join(dataDir());
    var removed = 0;
    ['thumbs', 'proxies'].forEach(function (sub) {
      var d = path.join(root, sub);
      try {
        if (fs.existsSync(d)) {
          fs.readdirSync(d).forEach(function (f) {
            try {
              fs.unlinkSync(path.join(d, f));
              removed++;
            } catch (e) {
              /* ignore */
            }
          });
        }
      } catch (e) {
        /* ignore */
      }
    });
    return removed;
  }

  AWB.node = {
    available: available,
    fs: fs,
    path: path,
    extensionRoot: extensionRoot,
    dataDir: dataDir,
    ensureDir: ensureDir,
    cacheDir: cacheDir,
    readJSON: readJSON,
    writeJSON: writeJSON,
    readText: readText,
    listDir: listDir,
    statOne: statOne,
    exists: exists,
    walk: walk,
    fileUrl: fileUrl,
    showInExplorer: showInExplorer,
    listDrives: listDrives,
    ffmpegPath: ffmpegPath,
    thumbFor: thumbFor,
    proxyFor: proxyFor,
    clearCache: clearCache,
    hash: hash,
  };
})();

