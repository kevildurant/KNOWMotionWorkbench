/**
 * AE 资源工作台 —— AE 侧脚本（host.jsx）
 * 由 CSXS/manifest.xml 的 ScriptPath 加载，面板通过 evalScript 调用 __AWB.xxx(param)。
 *
 * 通信协议（纯字符串，不依赖 JSON，兼容 ExtendScript）：
 *   入参：字符串；多值用 \n 分隔；附加参数用 \u0001 分隔
 *   返回：'OK\n' + 行数据；或 'ERR\n' + 错误信息
 *         每条记录内字段用 \u0001 分隔
 */
var __AWB = (function () {
    var F = String.fromCharCode(1);
    var N = String.fromCharCode(10);

    function ok(s) {
        return 'OK' + N + (s === undefined || s === null ? '' : s);
    }

    function err(s) {
        return 'ERR' + N + (s === undefined || s === null ? '' : s);
    }

    function eMsg(e) {
        if (!e) return '未知错误';
        return e.message ? e.message : String(e);
    }

    function row(cells) {
        var out = [];
        for (var i = 0; i < cells.length; i++) {
            var v = cells[i];
            out.push(v === undefined || v === null ? '' : String(v));
        }
        return out.join(F);
    }

    function splitList(s) {
        var out = [];
        if (!s) return out;
        var parts = String(s).split(N);
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] !== '') out.push(parts[i]);
        }
        return out;
    }

    /** 解析 "path1\npath2\u0001mode" */
    function parseParam(param) {
        var mode = '';
        var body = param === undefined || param === null ? '' : String(param);
        var i = body.indexOf(F);
        if (i >= 0) {
            mode = body.substring(i + 1);
            body = body.substring(0, i);
        }
        return { mode: mode, paths: splitList(body) };
    }

    function activeComp() {
        try {
            if (!app.project) return null;
            var item = app.project.activeItem;
            if (item && item instanceof CompItem) return item;
        } catch (e) {
            /* ignore */
        }
        return null;
    }

    /* ---------------- info ---------------- */
    function info() {
        var project = '';
        var comp = '';
        var layers = 0;
        try {
            if (app.project) {
                if (app.project.file) project = app.project.file.fsName;
                else project = '未保存工程';
            }
        } catch (e) {
            project = '';
        }
        var ac = activeComp();
        if (ac) {
            comp = ac.name;
            layers = ac.numLayers;
        }
        return ok(row([app.version, app.project ? (app.project ? String(app.project.numItems) : '') : '', project, comp, layers]));
    }

    /* ---------------- 已安装效果 ---------------- */
    function listEffects() {
        var lines = [];
        var effects = app.effects;
        for (var i = 0; i < effects.length; i++) {
            var e = effects[i];
            var category = '';
            try {
                category = e.category ? e.category : '';
            } catch (e2) {
                category = '';
            }
            var version = '';
            try {
                version = e.version ? e.version : '';
            } catch (e3) {
                version = '';
            }
            lines.push(row([e.displayName, e.matchName, category, version]));
        }
        return ok(lines.join(N));
    }

    /* ---------------- 导入 ---------------- */
    function importOne(path, sequence) {
        var f = new File(path);
        if (!f.exists) return { ok: false, msg: '文件不存在：' + path };
        var io = new ImportOptions(f);
        if (sequence) {
            try {
                io.sequence = true;
            } catch (e) {
                /* 不是序列时会抛错，忽略 */
            }
        }
        var item = app.project.importFile(io);
        return { ok: true, item: item };
    }

    function importFiles(param) {
        var p = parseParam(param);
        if (!p.paths.length) return err('没有传入文件');
        var lines = [];
        app.beginUndoGroup('导入素材');
        for (var i = 0; i < p.paths.length; i++) {
            var path = p.paths[i];
            try {
                var r = importOne(path, p.mode === 'seq');
                lines.push(row([path, r.ok ? '1' : '0', r.msg || '']));
            } catch (e) {
                lines.push(row([path, '0', eMsg(e)]));
            }
        }
        app.endUndoGroup();
        return ok(lines.join(N));
    }

    function importIntoComp(param) {
        var p = parseParam(param);
        if (!p.paths.length) return err('没有传入文件');
        var comp = activeComp();
        var lines = [];
        app.beginUndoGroup('导入并加入合成');
        for (var i = 0; i < p.paths.length; i++) {
            var path = p.paths[i];
            try {
                var r = importOne(path, p.mode === 'seq');
                if (!r.ok) {
                    lines.push(row([path, '0', r.msg]));
                    continue;
                }
                if (comp && r.item) {
                    comp.layers.add(r.item);
                    lines.push(row([path, '1', '已加入合成']));
                } else if (r.item) {
                    lines.push(row([path, '1', '已导入（没有打开的合成）']));
                } else {
                    lines.push(row([path, '0', '导入结果为空']));
                }
            } catch (e) {
                lines.push(row([path, '0', eMsg(e)]));
            }
        }
        app.endUndoGroup();
        return ok(lines.join(N));
    }

    function openProject(path) {
        var f = new File(String(path || ''));
        if (!f.exists) return err('工程文件不存在：' + path);
        app.open(f);
        return ok('已打开工程');
    }

    /* ---------------- 应用效果 ---------------- */
    function findInstalled(matchName, displayName) {
        var effects = app.effects;
        var i;
        if (matchName) {
            for (i = 0; i < effects.length; i++) {
                if (effects[i].matchName === matchName) return effects[i];
            }
        }
        if (displayName) {
            for (i = 0; i < effects.length; i++) {
                if (effects[i].displayName === displayName) return effects[i];
            }
        }
        return null;
    }

    function applyEffect(param) {
        var parts = String(param || '').split(F);
        var matchName = parts[0] || '';
        var displayName = parts[1] || '';
        if (!app.project) return err('请先打开一个工程');
        var comp = activeComp();
        if (!comp) return err('请先打开并激活一个合成，再选中图层');
        var selected = comp.selectedLayers;
        if (!selected || !selected.length) return err('请先在合成里选中至少一个图层');

        var effect = findInstalled(matchName, displayName);
        if (!effect) return err('本机没有安装这个效果（可在效果库里点「绑定」手工指定）');

        var applied = 0;
        var failed = [];
        var effName = effect.displayName;
        app.beginUndoGroup('应用效果：' + effName);
        for (var i = 0; i < selected.length; i++) {
            var layer = selected[i];
            try {
                if (layer.locked) {
                    failed.push(layer.name + '(已锁定)');
                    continue;
                }
                layer.property('ADBE Effect Parade').addProperty(effect.matchName);
                applied++;
            } catch (e) {
                failed.push(layer.name + ':' + eMsg(e));
            }
        }
        app.endUndoGroup();

        if (!applied) return err('应用失败：' + failed.join('; '));
        var msg = 'OK';
        var layerNames = [];
        for (var k = 0; k < selected.length; k++) layerNames.push(selected[k].name);
        return ok(row([effName, layerNames.join('、'), String(applied), failed.join('; ')]));
    }

    /* ---------------- 选中图层信息（备用） ---------------- */
    function selection() {
        var comp = activeComp();
        if (!comp) return ok('');
        var sel = comp.selectedLayers;
        var lines = [];
        for (var i = 0; i < sel.length; i++) {
            lines.push(row([sel[i].name, sel[i].index, sel[i].locked ? '1' : '0']));
        }
        return ok(lines.join(N));
    }

    function ping() {
        return ok('pong');
    }

    /* ---------------- 统一入口（失败也返回可读错误） ---------------- */
    function guard(fn) {
        return function (param) {
            try {
                return fn(param);
            } catch (e) {
                return err(eMsg(e));
            }
        };
    }

    return {
        info: guard(info),
        listEffects: guard(listEffects),
        importFiles: guard(importFiles),
        importIntoComp: guard(importIntoComp),
        openProject: guard(openProject),
        applyEffect: guard(applyEffect),
        selection: guard(selection),
        ping: guard(ping)
    };
})();

