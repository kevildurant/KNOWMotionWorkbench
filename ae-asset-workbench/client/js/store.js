/**
 * 设置与用户数据持久化：%APPDATA%\AE-Asset-Workbench\settings.json
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});

  var DEFAULTS = {
    version: 1,
    sources: [
      { path: 'D:\\ae', label: 'D:\\ae' },
      { path: '', label: '桌面' },
    ],
    lastDir: '',
    view: 'list', // list | grid
    sortBy: 'name', // name | type | size | mtime
    sortDir: 'asc',
    recursiveSearch: false,
    libraryPath: 'D:\\ae\\bei-ae-creative-assistance\\AE学习工作台',
    ffmpegPath: '',
    fxFilter: 'all',
    thumbConcurrency: 4,
  };

  var file = function () {
    return AWB.node.path.join(AWB.node.dataDir(), 'settings.json');
  };

  function desktopPath() {
    try {
      return AWB.node.path.join(process.env.USERPROFILE || '', 'Desktop');
    } catch (e) {
      return '';
    }
  }

  function load() {
    var saved = AWB.node.readJSON(file(), null);
    var data = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      data[k] = DEFAULTS[k];
    });
    if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach(function (k) {
        if (saved[k] !== undefined) data[k] = saved[k];
      });
    }
    // 修正默认源（桌面路径按当前用户解析）
    data.sources = (data.sources || []).map(function (s) {
      if (s.path === '' && s.label === '桌面') return { path: desktopPath(), label: '桌面' };
      return s;
    });
    return data;
  }

  var data = null;
  var saveTimer = 0;

  function ensure() {
    if (!data) data = load();
    return data;
  }

  function get(key) {
    return ensure()[key];
  }

  function set(key, value) {
    ensure()[key] = value;
    scheduleSave();
  }

  function patch(obj) {
    var d = ensure();
    Object.keys(obj || {}).forEach(function (k) {
      d[k] = obj[k];
    });
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      AWB.node.writeJSON(file(), ensure());
    }, 300);
  }

  function saveNow() {
    return AWB.node.writeJSON(file(), ensure());
  }

  /* 效果名 -> matchName 的手工绑定表 */
  function mapFile() {
    return AWB.node.path.join(AWB.node.dataDir(), 'effect-map.json');
  }
  function loadMap() {
    return AWB.node.readJSON(mapFile(), {});
  }
  function saveMap(map) {
    return AWB.node.writeJSON(mapFile(), map || {});
  }

  AWB.store = {
    ensure: ensure,
    get: get,
    set: set,
    patch: patch,
    saveNow: saveNow,
    loadMap: loadMap,
    saveMap: saveMap,
    desktopPath: desktopPath,
  };
})();

