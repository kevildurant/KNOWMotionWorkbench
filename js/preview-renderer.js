(function () {
    "use strict";

    var bridge = window.KNOWHostBridge;
    var store = window.KNOWPresetStore;
    var childProcess = null;
    var fs = null;
    var path = null;
    var processModule = null;
    var activeId = "";
    var ffmpegPath = "";
    var ffmpegChecked = false;
    var ffmpegChecking = false;
    var ffmpegWaiters = [];
    var states = {};
    var listener = null;
    var PREVIEW_SOURCE_PARTS = ["assets", "preview-source", "waguri-kaoruko-preview.mp4"];

    function nodeRequire(name) {
        try {
            if (window.cep_node && typeof window.cep_node.require === "function") { return window.cep_node.require(name); }
            if (typeof window.require === "function") { return window.require(name); }
            if (typeof require === "function") { return require(name); }
        } catch (ignore) {}
        return null;
    }

    function initNode() {
        childProcess = nodeRequire("child_process");
        fs = nodeRequire("fs");
        path = nodeRequire("path");
        processModule = nodeRequire("process");
        return !!(childProcess && fs && path && processModule);
    }

    function notify(id, phase, message) {
        states[id] = { phase: phase, message: message || "" };
        if (typeof listener === "function") { listener(id, states[id]); }
    }

    function removeFile(filePath) {
        try { if (filePath && fs.existsSync(filePath)) { fs.unlinkSync(filePath); } } catch (ignore) {}
    }

    function removeDirectory(directoryPath) {
        var names;
        var child;
        var stat;
        if (!directoryPath || !fs.existsSync(directoryPath)) { return; }
        try {
            names = fs.readdirSync(directoryPath);
            names.forEach(function (name) {
                child = path.join(directoryPath, name);
                try {
                    stat = fs.lstatSync(child);
                    if (stat.isDirectory() && !stat.isSymbolicLink()) { removeDirectory(child); }
                    else { fs.unlinkSync(child); }
                } catch (ignoreChild) {}
            });
            fs.rmdirSync(directoryPath);
        } catch (ignoreDirectory) {}
    }

    function localFilePath(value) {
        var result = String(value || "");
        try { result = decodeURIComponent(result); } catch (ignoreDecode) {}
        result = result.replace(/^file:\/\//i, "");
        if (/^\/[A-Za-z]:\//.test(result)) { result = result.slice(1); }
        return result.replace(/\//g, path.sep);
    }

    function bundledPreviewSource() {
        var roots = [];
        var locationPath;
        var candidate;
        var i;
        try {
            if (window.__adobe_cep__ && typeof window.__adobe_cep__.getSystemPath === "function") {
                roots.push(localFilePath(window.__adobe_cep__.getSystemPath("extension")));
            }
        } catch (ignoreCepPath) {}
        try {
            locationPath = localFilePath(window.location && window.location.pathname);
            if (locationPath) { roots.push(path.dirname(locationPath)); }
        } catch (ignoreLocationPath) {}
        for (i = 0; i < roots.length; i += 1) {
            candidate = path.join.apply(path, [roots[i]].concat(PREVIEW_SOURCE_PARTS));
            try { if (fs.existsSync(candidate)) { return candidate; } } catch (ignoreCandidate) {}
        }
        return "";
    }

    function candidatePaths() {
        var env = processModule ? processModule.env : {};
        var list = [];
        if (env.FFMPEG_PATH) { list.push(env.FFMPEG_PATH); }
        if (env.LOCALAPPDATA) { list.push(path.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "ffmpeg.exe")); }
        if (env.ProgramFiles) { list.push(path.join(env.ProgramFiles, "ffmpeg", "bin", "ffmpeg.exe")); }
        list.push("ffmpeg");
        return list.filter(function (item, index) { return item && list.indexOf(item) === index; });
    }

    function findFfmpeg(callback) {
        var candidates;
        var index = 0;
        if (ffmpegPath) { callback(ffmpegPath); return; }
        if (ffmpegChecked) { callback(""); return; }
        ffmpegWaiters.push(callback);
        if (ffmpegChecking) { return; }
        ffmpegChecking = true;
        candidates = candidatePaths();
        function finish(binary) {
            var waiters = ffmpegWaiters.slice(0);
            ffmpegChecking = false;
            ffmpegChecked = true;
            ffmpegPath = binary || "";
            ffmpegWaiters = [];
            waiters.forEach(function (waiter) { waiter(ffmpegPath); });
        }
        function tryNext() {
            var candidate;
            if (index >= candidates.length) { finish(""); return; }
            candidate = candidates[index];
            index += 1;
            childProcess.execFile(candidate, ["-version"], { windowsHide: true, timeout: 5000 }, function (error) {
                if (!error) { finish(candidate); }
                else { tryNext(); }
            });
        }
        tryNext();
    }

    function encode(rawPath, outputPath, callback) {
        var temporary = outputPath + ".part.mp4";
        findFfmpeg(function (binary) {
            if (!binary) {
                callback({ ok: false, message: "未找到 FFmpeg；请将 ffmpeg.exe 加入 PATH 后重试" });
                return;
            }
            removeFile(temporary);
            childProcess.execFile(binary, [
                "-y", "-hide_banner", "-loglevel", "error",
                "-i", rawPath,
                "-an", "-vf", "scale=640:360:flags=lanczos,format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-movflags", "+faststart", temporary
            ], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, function (error, stdout, stderr) {
                if (error || !fs.existsSync(temporary)) {
                    removeFile(temporary);
                    callback({ ok: false, message: "FFmpeg 编码失败", detail: String(stderr || error || "") });
                    return;
                }
                try {
                    removeFile(outputPath);
                    fs.renameSync(temporary, outputPath);
                    callback({ ok: true, path: outputPath });
                } catch (renameError) {
                    removeFile(temporary);
                    callback({ ok: false, message: "无法写入预览缓存", detail: renameError.toString() });
                }
            });
        });
    }

    function request(id, callback) {
        var entry = store && store.getById(id);
        callback = typeof callback === "function" ? callback : function () {};
        if (!available || !bridge || !bridge.isHostAvailable()) {
            callback({ ok: false, message: "请在 After Effects 面板中生成真实预览" });
            return;
        }
        if (!entry || entry.demo || entry.kind !== "preset" || entry.invalid) {
            callback({ ok: false, message: "该资源不能生成 AE 真实预览" });
            return;
        }
        if (activeId) {
            callback({ ok: false, busy: true, message: "已有一个真实预览正在生成" });
            return;
        }
        activeId = id;
        notify(id, "probing", "正在确认 FFmpeg 编码器");
        findFfmpeg(function (binary) {
            var target;
            var sourcePath;
            if (!binary) {
                activeId = "";
                notify(id, "error", "未找到 FFmpeg；尚未调用 AE 渲染");
                callback({ ok: false, dependency: "ffmpeg", message: "未找到 FFmpeg；尚未调用 AE 渲染" });
                return;
            }
            sourcePath = bundledPreviewSource();
            if (!sourcePath) {
                activeId = "";
                notify(id, "error", "统一预览底片缺失；尚未调用 AE 渲染");
                callback({ ok: false, dependency: "preview-source", message: "统一预览底片缺失；请重新安装完整扩展" });
                return;
            }
            target = store.getRenderTarget(id);
            if (!target || !target.outputPath || !target.rawBasePath || !target.stagingDirectory) {
                activeId = "";
                notify(id, "error", "无法创建预览缓存路径");
                callback({ ok: false, message: "无法创建预览缓存路径" });
                return;
            }
            notify(id, "rendering", "AE 正在把预设应用到和栗薰子统一底片");
            window.setTimeout(function () {
                bridge.execute("renderPresetPreview", {
                    path: entry.path,
                    rawBasePath: target.rawBasePath,
                    sourcePath: sourcePath,
                    width: 640,
                    height: 360,
                    duration: 2.5,
                    fps: 24
                }, function (hostResult) {
                var rawPath = hostResult && hostResult.detail && hostResult.detail.rawPath;
                if (!hostResult || !hostResult.ok || !rawPath) {
                    removeDirectory(target.stagingDirectory);
                    activeId = "";
                    notify(id, "error", hostResult && hostResult.message ? hostResult.message : "AE 真实预览渲染失败");
                    callback(hostResult || { ok: false, message: "AE 真实预览渲染失败" });
                    return;
                }
                notify(id, "encoding", "正在编码 MP4 并写入本地缓存");
                encode(rawPath, target.outputPath, function (encodeResult) {
                    removeDirectory(target.stagingDirectory);
                    activeId = "";
                    if (!encodeResult.ok || !store.registerRenderedPreview(id, target.outputPath)) {
                        if (encodeResult.ok) { removeFile(target.outputPath); }
                        notify(id, "error", encodeResult.message || "真实预览缓存登记失败");
                        callback(encodeResult.ok ? { ok: false, message: "真实预览缓存登记失败" } : encodeResult);
                        return;
                    }
                    notify(id, "ready", "AE 真实预览已缓存；悬停即可播放");
                    callback({ ok: true, path: target.outputPath, message: "AE 真实预览已生成并缓存" });
                });
            });
            }, 40);
        });
    }

    var available = initNode();
    window.KNOWPreviewRenderer = {
        available: available,
        request: request,
        getState: function (id) { return states[id] || { phase: "idle", message: "" }; },
        isBusy: function () { return !!activeId; },
        setListener: function (callback) { listener = callback; },
        probeFfmpeg: function (callback) {
            if (!available) { callback({ ok: false, message: "CEP Node 不可用" }); return; }
            findFfmpeg(function (binary) { callback({ ok: !!binary, path: binary, message: binary ? "FFmpeg 已就绪" : "未找到 FFmpeg；AE 实渲不会启动" }); });
        }
    };
}());
