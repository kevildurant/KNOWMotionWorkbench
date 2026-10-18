/**
 * 定高虚拟列表：只渲染可视区域 + 上下各若干行。
 */
(function () {
  'use strict';
  var AWB = (window.AWB = window.AWB || {});

  function VList(el, opts) {
    this.el = el;
    this.rowHeight = opts.rowHeight || 26;
    this.render = opts.render || function () { return ''; };
    this.emptyHtml = opts.emptyHtml || '<div class="pv-empty">空文件夹</div>';
    this.items = [];
    this.pad = opts.pad == null ? 6 : opts.pad;
    this._raf = 0;

    el.classList.add('vlist');
    el.innerHTML = '<div class="vspacer"></div><div class="vwindow"></div>';
    this.spacer = el.querySelector('.vspacer');
    this.win = el.querySelector('.vwindow');

    var self = this;
    el.addEventListener('scroll', function () {
      if (self._raf) return;
      self._raf = requestAnimationFrame(function () {
        self._raf = 0;
        self.paint();
      });
    });
    try {
      this._ro = new ResizeObserver(function () {
        self.paint();
      });
      this._ro.observe(el);
    } catch (e) {
      window.addEventListener('resize', function () {
        self.paint();
      });
    }
  }

  VList.prototype.setItems = function (items, keepScroll) {
    this.items = items || [];
    this.spacer.style.height = this.items.length * this.rowHeight + 'px';
    if (!keepScroll) this.el.scrollTop = 0;
    this.paint();
  };

  VList.prototype.setEmptyHtml = function (html) {
    this.emptyHtml = html;
    this.paint();
  };

  VList.prototype.paint = function () {
    var n = this.items.length;
    if (!n) {
      this.spacer.style.height = '0px';
      this.win.style.transform = 'translateY(0px)';
      this.win.innerHTML = this.emptyHtml;
      return;
    }
    var h = this.el.clientHeight || 300;
    var top = this.el.scrollTop || 0;
    var start = Math.max(0, Math.floor(top / this.rowHeight) - this.pad);
    var visible = Math.ceil(h / this.rowHeight) + this.pad * 2;
    var end = Math.min(n, start + visible);
    var html = [];
    for (var i = start; i < end; i++) html.push(this.render(this.items[i], i));
    this.win.style.transform = 'translateY(' + start * this.rowHeight + 'px)';
    this.win.innerHTML = html.join('');
  };

  VList.prototype.scrollToIndex = function (index) {
    var y = index * this.rowHeight;
    var top = this.el.scrollTop;
    var h = this.el.clientHeight;
    if (y < top) this.el.scrollTop = y - this.rowHeight;
    else if (y + this.rowHeight > top + h) this.el.scrollTop = y - h + this.rowHeight * 2;
  };

  AWB.VList = VList;
})();

