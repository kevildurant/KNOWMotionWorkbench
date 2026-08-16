(function () {
    "use strict";

    var catalog = window.KNOW_CATALOG || [];
    var categories = window.KNOW_CATEGORIES || [];
    var bridge = window.KNOWHostBridge;
    var presetStore = window.KNOWPresetStore;
    var previewRenderer = window.KNOWPreviewRenderer;
    var hoverTimers = {};
    var presetCategories = [
        { id: "all", label: "全部资源", icon: "grid" },
        { id: "official", label: "AE 官方", icon: "layers" },
        { id: "user", label: "用户目录", icon: "wave" },
        { id: "custom", label: "自选目录", icon: "folder" },
        { id: "favorites", label: "收藏", icon: "star" },
        { id: "recent", label: "最近使用", icon: "clock" },
        { id: "invalid", label: "失效路径", icon: "alert" }
    ];
    var state = {
        mode: "tools",
        category: "all",
        query: "",
        folderPath: "",
        expandedFolders: readStore("know.expandedFolders", []),
        selectedToolId: null,
        selectedPresetId: null,
        context: null,
        favorites: readStore("know.favorites", []),
        recent: readStore("know.recent", []),
        params: {},
        motion: readStore("know.motion", true),
        compact: readStore("know.compact", false),
        autoPreview: readStore("know.autoPreview", true),
        ffmpeg: { checked: false, ok: false, path: "", message: "正在检测 FFmpeg" },
        hoveredPresetId: ""
    };

    var dom = {};

    function readStore(key, fallback) {
        try {
            var value = window.localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }

    function writeStore(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            return;
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function nowText() {
        var date = new Date();
        function part(value) { return value < 10 ? "0" + value : String(value); }
        return part(date.getHours()) + ":" + part(date.getMinutes()) + ":" + part(date.getSeconds());
    }

    function setStatus(tone, title, message) {
        dom.statusBar.setAttribute("data-tone", tone || "neutral");
        dom.statusTitle.textContent = title || "READY";
        dom.statusMessage.textContent = message || "";
        dom.statusTime.textContent = nowText();
    }

    function iconSvg(name) {
        var paths = {
            grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
            star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
            clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
            wave: '<path d="M3 12h3c1.5 0 1.8-6 3.4-6s1.8 12 3.5 12 2-9 3.6-9c1.2 0 1.5 3 2.5 3h2"/>',
            keys: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2.2"/><circle cx="16" cy="17" r="2.2"/>',
            layers: '<path d="m12 4 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/>'
            ,folder: '<path d="M3.5 6.5h6l2 2h9v10h-17v-12Z"/>'
            ,alert: '<path d="M12 3 21 20H3L12 3Z"/><path d="M12 8v6m0 3h.01"/>'
        };
        return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.grid) + '</svg>';
    }

    function favoriteSvg() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>';
    }

    function artSvg(name) {
        var art = {
            elastic: '<path class="secondary" d="M7 48h106M17 14v44M39 14v44M61 14v44M83 14v44M105 14v44"/><path class="primary" d="M8 48c12 0 12-28 25-28s11 38 24 38 10-31 22-31 8 23 18 23 7-12 16-12"/><circle class="fill-primary" cx="33" cy="20" r="3"/><circle class="fill-primary" cx="79" cy="27" r="2.5"/>',
            loop: '<path class="secondary" d="M20 18h78v36H20z"/><path class="primary" d="M45 26c-17 0-24 8-24 18s8 17 22 17c22 0 33-36 52-36 13 0 21 8 21 18s-8 18-23 18c-17 0-26-13-35-25"/><path class="primary" d="m91 18 7 7-8 5"/>',
            wiggle: '<path class="secondary" d="M8 40h104M17 16v48M42 16v48M67 16v48M92 16v48"/><path class="primary" d="m8 43 11-20 9 29 12-13 8 18 12-38 9 32 11-22 9 26 10-17 14 6"/><circle class="fill-secondary" cx="28" cy="52" r="3"/><circle class="fill-primary" cx="60" cy="19" r="3"/><circle class="fill-secondary" cx="89" cy="55" r="3"/>',
            smooth: '<path class="secondary" d="m8 53 13-29 12 32 13-24 12 18 12-28 13 31 12-24 15 19"/><path class="primary" d="M8 51c17 0 18-20 33-20 16 0 18 17 34 17s19-13 37-13"/><path class="secondary" d="M8 63h104"/>',
            stagger: '<path class="secondary" d="M12 17h32v11H12zm19 16h32v11H31zm19 16h32v11H50zm19 16h32v4H69z"/><path class="primary" d="M12 28h32M31 44h32M50 60h32"/><circle class="fill-primary" cx="44" cy="28" r="3"/><circle class="fill-primary" cx="63" cy="44" r="3"/><circle class="fill-primary" cx="82" cy="60" r="3"/>',
            remove: '<path class="secondary" d="M8 39h104M16 20v38M36 20v38M56 20v38M76 20v38M96 20v38"/><path class="primary" d="m8 42 11-17 13 28 14-22 13 20 14-29 15 26 13-17 11 13"/><path class="primary" d="M34 16 88 62M88 16 34 62"/>',
            ease: '<path class="secondary" d="M16 62V15m0 47h88"/><path class="primary" d="M16 61c7-1 13 0 20-3 19-7 10-35 34-35 20 0 14 31 34 39"/><circle class="fill-primary" cx="16" cy="61" r="3"/><circle class="fill-primary" cx="70" cy="23" r="3"/><circle class="fill-primary" cx="104" cy="62" r="3"/><path class="secondary" d="M16 61 70 23l34 39"/>',
            sequence: '<rect class="secondary" x="8" y="15" width="35" height="14"/><rect class="secondary" x="42" y="32" width="35" height="14"/><rect class="secondary" x="76" y="49" width="35" height="14"/><path class="primary" d="M8 29h35M42 46h35M76 63h35"/><path class="primary" d="M18 10v56"/>',
            anchor: '<rect class="secondary" x="28" y="13" width="64" height="52" rx="4"/><path class="primary" d="M60 19v40M40 39h40"/><circle class="primary" cx="60" cy="39" r="9"/><circle class="fill-primary" cx="60" cy="39" r="3"/><path class="secondary" d="m22 18 8-5m68 5-6-5M22 60l6 5m70-5-6 5"/>',
            control: '<path class="secondary" d="M24 14v52M60 14v52M96 14v52"/><rect class="primary" x="16" y="26" width="16" height="9" rx="2"/><rect class="primary" x="52" y="47" width="16" height="9" rx="2"/><rect class="primary" x="88" y="19" width="16" height="9" rx="2"/><path class="secondary" d="M13 65h94"/>',
            rename: '<rect class="secondary" x="14" y="14" width="92" height="14" rx="3"/><rect class="secondary" x="14" y="33" width="92" height="14" rx="3"/><rect class="secondary" x="14" y="52" width="92" height="14" rx="3"/><path class="primary" d="M23 21h10m-10 19h18m-18 19h26"/><path class="primary" d="m84 19 5 5 9-10m-14 24 5 5 9-10m-14 24 5 5 9-10"/>',
            marker: '<path class="secondary" d="M8 55h104M17 18v44M38 18v44M59 18v44M80 18v44M101 18v44"/><path class="primary" d="M67 14v48"/><path class="fill-primary" d="m67 14 15 8-15 8Z"/><circle class="fill-secondary" cx="38" cy="55" r="3"/><circle class="fill-secondary" cx="101" cy="55" r="3"/>'
        };
        return '<svg viewBox="0 0 120 78" aria-hidden="true">' + (art[name] || art.sequence) + '</svg>';
    }

    function getTool(id) {
        var i;
        for (i = 0; i < catalog.length; i += 1) {
            if (catalog[i].id === id) { return catalog[i]; }
        }
        return null;
    }

    function getPreset(id) {
        var entries = presetStore ? presetStore.getEntries() : [];
        var i;
        for (i = 0; i < entries.length; i += 1) {
            if (entries[i].id === id) { return entries[i]; }
        }
        return null;
    }

    function isPresetReady(preset) {
        return !!(preset && preset.kind === "preset" && !preset.demo && !preset.invalid && state.context && state.context.ok && state.context.selectedLayers >= 1);
    }

    function presetList() {
        var query = state.query.toLowerCase().replace(/^\s+|\s+$/g, "");
        var presets = presetStore ? presetStore.getEntries() : [];
        return presets.filter(function (preset) {
            var categoryMatch = state.category === "all" ||
                (state.category === "favorites" && preset.favorite) ||
                (state.category === "recent" && preset.recent) ||
                (state.category === "invalid" && preset.invalid) ||
                preset.source === state.category;
            var folderMatch = !state.folderPath || presetStore.entryInFolder(preset, state.folderPath);
            var haystack = (preset.name + " " + preset.folder + " " + preset.sourceLabel + " " + preset.typeLabel + " " + preset.path).toLowerCase();
            return categoryMatch && folderMatch && (!query || haystack.indexOf(query) !== -1);
        }).sort(function (a, b) {
            if (state.category === "recent") { return (b.lastUsed || 0) - (a.lastUsed || 0); }
            if (a.invalid !== b.invalid) { return a.invalid ? 1 : -1; }
            return a.name.localeCompare(b.name);
        });
    }

    function isFavorite(id) {
        return state.favorites.indexOf(id) !== -1;
    }

    function isRecent(id) {
        return state.recent.indexOf(id) !== -1;
    }

    function isReady(tool) {
        var context = state.context;
        if (!context || !context.ok) { return false; }
        switch (tool.requires) {
        case "activeComp": return !!context.compName && !context.noComp;
        case "selectedLayers": return context.selectedLayers >= 1;
        case "selectedMultipleLayers": return context.selectedLayers >= 2;
        case "selectedProperties": return context.selectedProperties >= 1;
        case "selectedKeyedProperties": return context.selectedKeyedProperties >= 1;
        case "selectedTwoKeyProperties": return context.selectedTwoKeyProperties >= 1;
        case "selectedKeys": return context.selectedKeys >= 1;
        default: return true;
        }
    }

    function filteredTools() {
        var query = state.query.toLowerCase().replace(/^\s+|\s+$/g, "");
        return catalog.filter(function (tool) {
            var categoryMatch = state.category === "all" ||
                (state.category === "favorites" && isFavorite(tool.id)) ||
                (state.category === "recent" && isRecent(tool.id)) ||
                tool.category === state.category;
            var haystack = (tool.title + " " + tool.caption + " " + tool.description + " " + tool.category + " " + tool.type).toLowerCase();
            return categoryMatch && (!query || haystack.indexOf(query) !== -1);
        }).sort(function (a, b) {
            if (state.category === "recent") {
                return state.recent.indexOf(a.id) - state.recent.indexOf(b.id);
            }
            return catalog.indexOf(a) - catalog.indexOf(b);
        });
    }

    function categoryCount(categoryId) {
        if (state.mode === "presets") {
            var presets = presetStore ? presetStore.getEntries() : [];
            if (categoryId === "all") { return presets.length; }
            if (categoryId === "favorites") { return presets.filter(function (preset) { return preset.favorite; }).length; }
            if (categoryId === "recent") { return presets.filter(function (preset) { return preset.recent; }).length; }
            if (categoryId === "invalid") { return presets.filter(function (preset) { return preset.invalid; }).length; }
            return presets.filter(function (preset) { return preset.source === categoryId; }).length;
        }
        if (categoryId === "all") { return catalog.length; }
        if (categoryId === "favorites") { return state.favorites.length; }
        if (categoryId === "recent") { return state.recent.length; }
        return catalog.filter(function (tool) { return tool.category === categoryId; }).length;
    }

    function renderCategories() {
        var activeCategories = state.mode === "presets" ? presetCategories : categories;
        dom.categoryNav.innerHTML = "";
        activeCategories.forEach(function (category) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "category-button";
            button.setAttribute("data-category", category.id);
            button.setAttribute("aria-current", state.category === category.id ? "page" : "false");
            button.innerHTML = iconSvg(category.icon) + '<span>' + escapeHtml(category.label) + '</span><small>' + categoryCount(category.id) + '</small>';
            button.addEventListener("click", function () {
                state.category = category.id;
                renderAll();
            });
            dom.categoryNav.appendChild(button);
        });
    }

    function uiPath(value) {
        return String(value || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    }

    function folderExpanded(folder, depth) {
        return depth === 0 || state.expandedFolders.indexOf(folder.id) !== -1;
    }

    function toggleFolderExpanded(folder) {
        var index = state.expandedFolders.indexOf(folder.id);
        if (index === -1) { state.expandedFolders.push(folder.id); }
        else { state.expandedFolders.splice(index, 1); }
        writeStore("know.expandedFolders", state.expandedFolders);
    }

    function renderFolderTree() {
        var folders = presetStore ? presetStore.getFolders() : [];
        var byParent = {};
        var byPath = {};
        dom.folderPanel.hidden = state.mode !== "presets";
        dom.folderTree.innerHTML = "";
        if (state.mode !== "presets") { return; }
        folders.forEach(function (folder) { byPath[uiPath(folder.path)] = folder; });
        folders.forEach(function (folder) {
            var parentKey = uiPath(folder.parentPath);
            if (!folder.parentPath || !byPath[parentKey]) { parentKey = "__root__"; }
            if (!byParent[parentKey]) { byParent[parentKey] = []; }
            byParent[parentKey].push(folder);
        });
        function appendNodes(parentKey, depth) {
            (byParent[parentKey] || []).forEach(function (folder) {
                var childKey = uiPath(folder.path);
                var children = byParent[childKey] || [];
                var expanded = folderExpanded(folder, depth);
                var button = document.createElement("button");
                button.type = "button";
                button.className = "folder-node";
                button.style.setProperty("--folder-depth", depth);
                button.setAttribute("data-selected", String(uiPath(state.folderPath) === childKey));
                button.setAttribute("data-invalid", String(!!folder.invalid));
                if (children.length) { button.setAttribute("aria-expanded", String(expanded)); }
                button.innerHTML = '<i aria-hidden="true"></i><span>' + escapeHtml(folder.label) + '</span><small>' + folder.count + '</small>';
                button.addEventListener("click", function () {
                    state.folderPath = folder.path;
                    if (children.length) { toggleFolderExpanded(folder); }
                    renderAll();
                    setStatus(folder.invalid ? "warning" : "neutral", "FOLDER", folder.label + " · " + folder.count + " 项资源");
                });
                dom.folderTree.appendChild(button);
                if (children.length && expanded) { appendNodes(childKey, depth + 1); }
            });
        }
        appendNodes("__root__", 0);
        dom.folderPanel.setAttribute("data-empty", String(folders.length === 0));
    }

    function renderCard(tool, visibleIndex) {
        var article = document.createElement("article");
        var hit = document.createElement("button");
        var favorite = document.createElement("button");
        var ready = isReady(tool);
        var number = visibleIndex + 1;
        article.className = "tool-card";
        article.setAttribute("data-tool-id", tool.id);
        article.setAttribute("data-ready", String(ready));
        article.setAttribute("data-selected", String(state.selectedToolId === tool.id));
        article.style.setProperty("--accent", tool.accent);
        article.style.setProperty("--art-2", tool.art2);
        article.style.setProperty("--art-bg", tool.artBg);

        hit.type = "button";
        hit.className = "card-hit";
        hit.setAttribute("aria-label", tool.title + "，" + tool.caption + "，" + (ready ? "当前选择已就绪" : "当前选择未满足要求：" + tool.requirement));
        hit.innerHTML =
            '<div class="card-art"><span class="card-index">CUE ' + (number < 10 ? "0" + number : number) + '</span>' +
            artSvg(tool.art) + '<span class="card-type">' + escapeHtml(tool.type) + '</span></div>' +
            '<div class="card-copy"><div><strong>' + escapeHtml(tool.title) + '</strong><span>' + escapeHtml(tool.caption) + '</span></div><div class="readiness-state" title="' + (ready ? "当前选择可执行" : "当前选择未满足要求") + '"><i class="readiness-dot"></i><small>' + (ready ? "就绪" : "需选择") + '</small></div></div>';
        hit.addEventListener("click", function () { selectTool(tool.id); });
        hit.addEventListener("dblclick", function () {
            selectTool(tool.id);
            if (isReady(tool)) { executeSelectedTool(); }
        });

        favorite.type = "button";
        favorite.className = "favorite-button";
        favorite.setAttribute("aria-label", (isFavorite(tool.id) ? "取消收藏 " : "收藏 ") + tool.title);
        favorite.setAttribute("data-active", String(isFavorite(tool.id)));
        favorite.innerHTML = favoriteSvg();
        favorite.addEventListener("click", function (event) {
            event.stopPropagation();
            toggleFavorite(tool.id);
        });

        article.appendChild(hit);
        article.appendChild(favorite);
        return article;
    }

    function reducedMotion() {
        return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }

    function playPreviewVideo(article) {
        var video = article ? article.querySelector("video") : null;
        var playResult;
        if (!video || !state.motion || reducedMotion()) { return; }
        playResult = video.play();
        if (playResult && typeof playResult.catch === "function") { playResult.catch(function () {}); }
    }

    function stopPreviewVideo(article) {
        var video = article ? article.querySelector("video") : null;
        if (!video) { return; }
        video.pause();
        try { video.currentTime = 0; } catch (ignore) {}
    }

    function previewStateMarkup(preset, renderState) {
        var phase = renderState.phase || "idle";
        if (phase === "probing" || phase === "rendering" || phase === "encoding") {
            return '<span class="preview-generation-state" data-phase="' + phase + '"><i aria-hidden="true"></i>' + (phase === "probing" ? "检查编码器" : (phase === "rendering" ? "AE 实渲中" : "编码 MP4")) + '</span>';
        }
        if (phase === "error") {
            return '<span class="preview-generation-state" data-phase="error">生成失败</span>';
        }
        if (preset.canRenderPreview) {
            return '<span class="preview-generation-state" data-phase="idle">悬停实渲</span>';
        }
        return "";
    }

    function updatePreviewCardState(id, renderState) {
        var article = dom.toolGrid.querySelector('[data-preset-id="' + id + '"]');
        var art;
        var oldState;
        var preset = getPreset(id);
        if (!article || !preset) { return; }
        article.setAttribute("data-preview-state", renderState.phase || "idle");
        art = article.querySelector(".preset-art");
        oldState = article.querySelector(".preview-generation-state");
        if (oldState) { oldState.parentNode.removeChild(oldState); }
        if (art) { art.insertAdjacentHTML("beforeend", previewStateMarkup(preset, renderState)); }
    }

    function requestRenderedPreview(preset, reason) {
        if (!preset || !previewRenderer || !preset.canRenderPreview) { return; }
        setStatus("working", "AE PREVIEW", (reason === "hover" ? "首次悬停：" : "") + "正在为 “" + preset.name + "” 生成真实效果预览；完成后自动缓存");
        previewRenderer.request(preset.id, function (result) {
            if (result && result.ok) {
                setStatus("success", "PREVIEW READY", preset.name + " · AE 真实预览已缓存");
                renderAll();
                window.setTimeout(function () {
                    var card = dom.toolGrid.querySelector('[data-preset-id="' + preset.id + '"]');
                    if (state.hoveredPresetId === preset.id) { playPreviewVideo(card); }
                }, 80);
            } else if (result && result.busy) {
                setStatus("warning", "PREVIEW BUSY", result.message);
            } else {
                setStatus("error", "PREVIEW FAILED", result && result.message ? result.message : "真实预览生成失败");
                updateDrawer();
            }
        });
    }

    function scheduleRenderedPreview(preset) {
        if (!state.autoPreview || !preset.canRenderPreview || !previewRenderer || !previewRenderer.available || !bridge.isHostAvailable() || (state.ffmpeg.checked && !state.ffmpeg.ok)) { return; }
        window.clearTimeout(hoverTimers[preset.id]);
        hoverTimers[preset.id] = window.setTimeout(function () {
            if (state.hoveredPresetId === preset.id) { requestRenderedPreview(getPreset(preset.id), "hover"); }
        }, 650);
    }

    function renderPresetCard(preset, visibleIndex) {
        var article = document.createElement("article");
        var hit = document.createElement("button");
        var favorite = document.createElement("button");
        var ready = isPresetReady(preset);
        var number = visibleIndex + 1;
        var stateLabel = ready ? "就绪" : (preset.invalid ? "失效" : (preset.kind === "preset" ? (preset.demo ? "示例" : "需图层") : "资源"));
        var stateTitle = ready ? "可应用到当前图层" : (preset.invalid ? "文件路径失效" : (preset.kind === "preset" ? (preset.demo ? "示例预览" : "请选择 AE 图层") : "已录入资源文件"));
        var mediaMarkup;
        var renderState = previewRenderer ? previewRenderer.getState(preset.id) : { phase: "idle", message: "" };
        var poster = preset.posterUrl || (preset.previewSource === "demo" ? "assets/preset-previews/roxy-water-ruins.webp" : "");
        article.className = "tool-card preset-card";
        article.setAttribute("data-preset-id", preset.id);
        article.setAttribute("data-ready", String(ready));
        article.setAttribute("data-invalid", String(!!preset.invalid));
        article.setAttribute("data-selected", String(state.selectedPresetId === preset.id));
        article.setAttribute("data-kind", preset.kind || "preset");
        article.setAttribute("data-preview-type", preset.previewType || "image");
        article.setAttribute("data-preview-source", preset.previewSource || "placeholder");
        article.setAttribute("data-preview-state", renderState.phase || "idle");

        if (preset.previewType === "video") {
            mediaMarkup = '<video class="preset-media" src="' + escapeHtml(preset.previewUrl) + '"' + (poster ? ' poster="' + escapeHtml(poster) + '"' : '') + ' muted loop preload="metadata"></video>' +
                '<span class="motion-badge"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2.5 5 3.5-5 3.5v-7Z"/></svg>动态 · ' + escapeHtml(preset.previewSourceLabel) + '</span>';
        } else {
            mediaMarkup = '<img class="preset-media" src="' + escapeHtml(preset.previewUrl) + '" alt="" loading="lazy">' +
                '<span class="preview-source-badge">' + escapeHtml(preset.previewSourceLabel) + '</span>';
        }

        hit.type = "button";
        hit.className = "card-hit";
        hit.setAttribute("aria-label", preset.name + "，" + preset.typeLabel + "，" + preset.sourceLabel + "，预览来源：" + preset.previewSourceLabel + (preset.invalid ? "，路径失效" : ""));
        hit.innerHTML =
            '<div class="card-art preset-art">' + mediaMarkup +
            '<span class="card-index">' + escapeHtml(preset.typeLabel) + ' ' + (number < 10 ? "0" + number : number) + '</span>' +
            '<span class="preset-source">' + escapeHtml(preset.sourceLabel) + '</span>' +
            (preset.invalid ? '<span class="invalid-badge">路径失效</span>' : '') + previewStateMarkup(preset, renderState) + '</div>' +
            '<div class="card-copy"><div><strong>' + escapeHtml(preset.name) + '</strong><span>' + escapeHtml(preset.folder || "未分类") + '</span></div>' +
            '<div class="readiness-state" title="' + escapeHtml(stateTitle) + '"><i class="readiness-dot"></i><small>' + escapeHtml(stateLabel) + '</small></div></div>';
        hit.addEventListener("click", function () { selectPreset(preset.id); });
        hit.addEventListener("dblclick", function () {
            selectPreset(preset.id);
            if (preset.kind === "preset" && isPresetReady(preset)) { executeSelectedPreset(); }
        });

        article.addEventListener("mouseenter", function () {
            state.hoveredPresetId = preset.id;
            if (preset.previewType === "video") { playPreviewVideo(article); }
            else { scheduleRenderedPreview(preset); }
        });
        article.addEventListener("mouseleave", function () {
            window.clearTimeout(hoverTimers[preset.id]);
            if (state.hoveredPresetId === preset.id) { state.hoveredPresetId = ""; }
            stopPreviewVideo(article);
        });
        if (preset.previewType !== "video") {
            hit.querySelector("img").addEventListener("error", function () {
                var badge = hit.querySelector(".preview-source-badge");
                this.src = "assets/preset-previews/roxy-water-ruins.webp";
                article.setAttribute("data-preview-source", "placeholder");
                if (badge) { badge.textContent = "原创占位"; }
            });
        }

        favorite.type = "button";
        favorite.className = "favorite-button";
        favorite.setAttribute("aria-label", (preset.favorite ? "取消收藏 " : "收藏 ") + preset.name);
        favorite.setAttribute("data-active", String(preset.favorite));
        favorite.innerHTML = favoriteSvg();
        favorite.addEventListener("click", function (event) {
            event.stopPropagation();
            togglePresetFavorite(preset.id);
        });
        article.appendChild(hit);
        article.appendChild(favorite);
        return article;
    }

    function renderGrid() {
        var tools = state.mode === "presets" ? presetList() : filteredTools();
        dom.toolGrid.innerHTML = "";
        tools.forEach(function (tool, index) {
            dom.toolGrid.appendChild(state.mode === "presets" ? renderPresetCard(tool, index) : renderCard(tool, index));
        });
        dom.resultCount.textContent = tools.length + " 项";
        dom.emptyState.hidden = tools.length !== 0;
        dom.toolGrid.hidden = tools.length === 0;
        dom.emptyPresetActions.hidden = state.mode !== "presets" || tools.length !== 0;
        dom.emptyState.querySelector("strong").textContent = state.mode === "presets" ? "没有匹配的资源" : "没有匹配的工具";
        dom.emptyState.querySelector("p").textContent = state.mode === "presets" ? "可添加 .ffx，或扫描包含预设、图片、视频与工程文件的完整目录。" : "尝试缩短关键词，或切换到“全部工具”。";
    }

    function renderAll() {
        renderCategories();
        renderFolderTree();
        renderGrid();
        updateDrawer();
        dom.presetActions.hidden = state.mode !== "presets";
        dom.toolCount.textContent = state.mode === "presets" ? (presetStore ? presetStore.getEntries().length : 0) + " FILES" : catalog.length + " TOOLS";
    }

    function selectTool(id) {
        state.selectedToolId = id;
        renderGrid();
        updateDrawer();
        dom.detailDrawer.setAttribute("aria-hidden", "false");
        setStatus("neutral", "SELECTED", getTool(id).title + " · 检查参数后执行");
    }

    function selectPreset(id) {
        var preset = getPreset(id);
        state.selectedPresetId = id;
        renderGrid();
        updateDrawer();
        dom.detailDrawer.setAttribute("aria-hidden", "false");
        setStatus(preset && preset.invalid ? "warning" : "neutral", preset && preset.kind === "preset" ? "PRESET" : "RESOURCE", preset ? preset.name + (preset.invalid ? " · 路径已失效" : (preset.kind === "preset" ? " · 选择图层后应用" : " · 已录入资源库")) : "资源未找到");
    }

    function closeDrawer() {
        if (dom.presetDrawerVideo) { dom.presetDrawerVideo.pause(); }
        dom.detailDrawer.setAttribute("aria-hidden", "true");
        setStatus("neutral", "READY", state.mode === "presets" ? "选择一张效果或资源卡查看详情" : "选择一张工具卡查看参数");
    }

    function parameterValue(tool, param) {
        if (!state.params[tool.id]) { state.params[tool.id] = {}; }
        if (typeof state.params[tool.id][param.key] === "undefined") {
            state.params[tool.id][param.key] = param.value;
        }
        return state.params[tool.id][param.key];
    }

    function updateDrawer() {
        if (state.mode === "presets") {
            updatePresetDrawer();
            return;
        }
        var tool = getTool(state.selectedToolId);
        var ready;
        if (!tool) { return; }
        ready = isReady(tool);
        dom.drawerType.textContent = tool.type;
        dom.drawerTitle.textContent = tool.title;
        dom.drawerDescription.textContent = tool.description;
        dom.drawerRequirement.textContent = (ready ? "当前选择已就绪 · " : "等待满足条件 · ") + tool.requirement;
        dom.drawerRequirement.setAttribute("data-ready", String(ready));
        dom.executeButton.disabled = !ready;
        dom.favoriteDrawerButton.textContent = isFavorite(tool.id) ? "取消收藏" : "加入收藏";
        dom.presetDrawerPreview.hidden = true;
        dom.presetDrawerVideo.pause();
        dom.parameterForm.hidden = false;
        dom.executeButton.querySelector("span").textContent = "执行工具";
        dom.parameterForm.innerHTML = "";
        if (!tool.params.length) {
            dom.parameterForm.innerHTML = '<p class="parameter-empty">此工具无需额外参数。</p>';
        } else {
            tool.params.forEach(function (param) {
                var label = document.createElement("label");
                var input = document.createElement("input");
                label.className = "parameter-field";
                label.innerHTML = '<span>' + escapeHtml(param.label) + '</span>';
                input.type = param.type;
                input.name = param.key;
                input.value = parameterValue(tool, param);
                if (typeof param.min !== "undefined") { input.min = param.min; }
                if (typeof param.max !== "undefined") { input.max = param.max; }
                if (typeof param.step !== "undefined") { input.step = param.step; }
                input.addEventListener("change", function () {
                    state.params[tool.id][param.key] = param.type === "number" ? Number(input.value) : input.value;
                });
                label.appendChild(input);
                dom.parameterForm.appendChild(label);
            });
        }
    }

    function updatePresetDrawer() {
        var preset = getPreset(state.selectedPresetId);
        var ready;
        var isFfx;
        var renderState;
        if (!preset) { return; }
        isFfx = preset.kind === "preset";
        ready = isPresetReady(preset);
        renderState = previewRenderer ? previewRenderer.getState(preset.id) : { phase: "idle", message: "" };
        dom.drawerType.textContent = isFfx ? "FFX PRESET" : preset.typeLabel + " RESOURCE";
        dom.drawerTitle.textContent = preset.name;
        dom.drawerDescription.textContent = preset.demo ? (isFfx ? "效果卡示例。录入目录后会自动匹配同名图片或视频预览。" : "资源卡示例。图片、视频、脚本、工程与模板会保留原目录层级。") : preset.sourceLabel + " · " + (preset.folder || "未分类") + " · " + preset.typeLabel;
        dom.drawerRequirement.textContent = (preset.invalid ? "路径失效 · 点击“刷新目录”重新检测" : (!isFfx ? "资源文件已录入 · 当前版本不会直接执行或导入该文件" : (preset.demo ? "示例预览，不会写入 AE" : (ready ? "当前图层已就绪 · 将调用 layer.applyPreset()" : "请在 AE 当前合成中选择至少一个图层")))) + " · 预览来源：" + preset.previewSourceLabel;
        dom.drawerRequirement.setAttribute("data-ready", String(ready));
        dom.executeButton.disabled = !ready;
        dom.executeButton.querySelector("span").textContent = isFfx ? "应用预设" : "仅供浏览";
        dom.favoriteDrawerButton.textContent = preset.favorite ? "取消收藏" : "加入收藏";
        dom.parameterForm.hidden = true;
        dom.parameterForm.innerHTML = "";
        dom.presetDrawerPreview.hidden = false;
        dom.renderPreviewButton.hidden = !isFfx;
        dom.renderPreviewButton.disabled = !!preset.demo || !!preset.invalid || preset.previewType === "video" || renderState.phase === "probing" || renderState.phase === "rendering" || renderState.phase === "encoding" || !bridge.isHostAvailable() || !state.ffmpeg.checked || !state.ffmpeg.ok;
        dom.renderPreviewButton.textContent = !state.ffmpeg.checked ? "正在检测 FFmpeg" : (!state.ffmpeg.ok ? "缺少 FFmpeg" : (renderState.phase === "probing" ? "正在检查编码器" : (renderState.phase === "rendering" ? "AE 正在实渲" : (renderState.phase === "encoding" ? "正在编码 MP4" : (preset.previewSource === "ae-render" ? "AE 真实预览已缓存" : (preset.previewType === "video" ? "已有动态预览" : "生成 AE 真实预览"))))));
        if (preset.previewType === "video") {
            dom.presetDrawerImage.hidden = true;
            dom.presetDrawerVideo.hidden = false;
            dom.presetDrawerVideo.src = preset.previewUrl;
            dom.presetDrawerVideo.poster = preset.posterUrl || "";
            dom.presetDrawerVideo.load();
        } else {
            dom.presetDrawerVideo.pause();
            dom.presetDrawerVideo.hidden = true;
            dom.presetDrawerImage.hidden = false;
            dom.presetDrawerImage.src = preset.previewUrl;
            dom.presetDrawerImage.alt = preset.name + " 缩略图";
            dom.presetDrawerImage.onerror = function () { this.src = "assets/preset-previews/roxy-water-ruins.webp"; };
        }
        dom.presetPath.textContent = preset.demo ? (isFfx ? "真实 FFX 首次悬停会由 AE 自动生成预览" : "目录资源展示示例") : preset.path;
        dom.assignThumbnailButton.disabled = !!preset.demo || !isFfx;
    }

    function toggleFavorite(id) {
        var index = state.favorites.indexOf(id);
        if (index === -1) {
            state.favorites.push(id);
            setStatus("success", "SAVED", getTool(id).title + " 已加入收藏");
        } else {
            state.favorites.splice(index, 1);
            setStatus("neutral", "REMOVED", getTool(id).title + " 已取消收藏");
        }
        writeStore("know.favorites", state.favorites);
        renderAll();
    }

    function togglePresetFavorite(id) {
        var preset = getPreset(id);
        var added;
        if (!presetStore || !preset) { return; }
        added = presetStore.toggleFavorite(id);
        setStatus(added ? "success" : "neutral", added ? "SAVED" : "REMOVED", preset.name + (added ? " 已加入收藏" : " 已取消收藏"));
        renderAll();
    }

    function recordRecent(id) {
        var index = state.recent.indexOf(id);
        if (index !== -1) { state.recent.splice(index, 1); }
        state.recent.unshift(id);
        state.recent = state.recent.slice(0, 8);
        writeStore("know.recent", state.recent);
    }

    function executeSelectedTool() {
        var tool = getTool(state.selectedToolId);
        var params = {};
        if (!tool || !isReady(tool)) {
            setStatus("warning", "WAITING", tool ? tool.requirement : "请先选择工具");
            return;
        }
        tool.params.forEach(function (param) {
            params[param.key] = parameterValue(tool, param);
        });
        dom.executeButton.disabled = true;
        dom.executeButton.setAttribute("data-loading", "true");
        dom.executeButton.querySelector("span").textContent = "正在执行";
        setStatus("working", "PROCESSING", "正在检查选择并执行 “" + tool.title + "”");
        bridge.execute(tool.id, params, function (result) {
            dom.executeButton.setAttribute("data-loading", "false");
            dom.executeButton.querySelector("span").textContent = "执行工具";
            dom.executeButton.disabled = false;
            if (result && result.ok) {
                recordRecent(tool.id);
                setStatus("success", result.demo ? "DEMO OK" : "DONE", result.message || (tool.title + " 已完成"));
                refreshContext(false);
                renderCategories();
            } else {
                setStatus("error", "FAILED", result && result.message ? result.message : "执行失败，请检查 AE 选择状态");
            }
        });
    }

    function executeSelectedPreset() {
        var preset = getPreset(state.selectedPresetId);
        if (preset && preset.kind !== "preset") {
            setStatus("neutral", "RESOURCE", "该文件已录入目录，但不是可直接应用的 FFX 预设");
            return;
        }
        if (!preset || !presetStore || !presetStore.validatePath(preset.id)) {
            setStatus("error", "INVALID PATH", "预设文件不存在；请刷新目录或重新添加文件");
            renderAll();
            return;
        }
        if (!isPresetReady(getPreset(preset.id))) {
            setStatus("warning", "WAITING", "请在 AE 当前合成中选择至少一个图层");
            return;
        }
        dom.executeButton.disabled = true;
        dom.executeButton.setAttribute("data-loading", "true");
        dom.executeButton.querySelector("span").textContent = "正在应用";
        setStatus("working", "APPLYING", "正在应用 “" + preset.name + "”");
        bridge.execute("applyPreset", { path: preset.path }, function (result) {
            dom.executeButton.setAttribute("data-loading", "false");
            dom.executeButton.querySelector("span").textContent = "应用预设";
            if (result && result.ok) {
                presetStore.recordRecent(preset.id);
                setStatus("success", result.demo ? "DEMO OK" : "APPLIED", result.message || "预设已应用");
                refreshContext(false);
                renderAll();
            } else {
                dom.executeButton.disabled = false;
                setStatus("error", "FAILED", result && result.message ? result.message : "预设应用失败");
            }
        });
    }

    function updateContextDisplay() {
        var context = state.context;
        var isHost = bridge.isHostAvailable();
        dom.hostBadge.setAttribute("data-host", String(isHost));
        dom.hostBadge.querySelector("b").textContent = isHost ? "AE LIVE" : "演示模式";
        if (!context || !context.ok) {
            dom.contextTitle.textContent = "未检测到活动合成";
            dom.layerCount.textContent = "0";
            dom.propertyCount.textContent = "0";
            return;
        }
        dom.contextTitle.textContent = context.compName || "未打开活动合成";
        dom.layerCount.textContent = context.selectedLayers || 0;
        dom.propertyCount.textContent = context.selectedProperties || 0;
    }

    function refreshContext(announce) {
        dom.refreshButton.disabled = true;
        if (announce !== false) { setStatus("working", "SCANNING", "正在读取 AE 当前合成与选择"); }
        bridge.getContext(function (context) {
            state.context = context || { ok: false };
            dom.refreshButton.disabled = false;
            updateContextDisplay();
            renderGrid();
            updateDrawer();
            if (announce !== false) {
                if (context && context.ok) {
                    setStatus("success", context.demo ? "DEMO READY" : "SYNCED", context.demo ? "浏览器安全演示模式已就绪" : "AE 选择状态已刷新");
                } else {
                    setStatus("warning", "NO COMP", "请在 After Effects 中打开合成并选择目标");
                }
            }
        });
    }

    function clearFilters() {
        state.category = "all";
        state.folderPath = "";
        state.query = "";
        dom.searchInput.value = "";
        renderAll();
        dom.searchInput.focus();
    }

    function switchMode(mode) {
        state.mode = mode === "presets" ? "presets" : "tools";
        dom.app.setAttribute("data-mode", state.mode);
        state.category = "all";
        state.folderPath = "";
        state.query = "";
        dom.searchInput.value = "";
        dom.searchInput.placeholder = state.mode === "presets" ? "搜索效果、资源、目录或来源" : "搜索工具、用途或分类";
        Array.prototype.forEach.call(document.querySelectorAll(".library-switch button"), function (button) {
            button.setAttribute("aria-pressed", String(button.getAttribute("data-mode") === state.mode));
        });
        dom.detailDrawer.setAttribute("aria-hidden", "true");
        renderAll();
        setStatus("neutral", state.mode === "presets" ? "RESOURCE LIBRARY" : "TOOL LIBRARY", state.mode === "presets" ? "真实 FFX 首次悬停会自动生成并缓存 AE 效果预览" : "选择一张工具卡查看参数");
    }

    function reportScan(result, actionName) {
        if (result && result.ok) {
            setStatus(result.invalid ? "warning" : "success", result.invalid ? "PATH CHECK" : "INDEXED", actionName + "：" + (typeof result.presets === "number" ? result.presets + " 个 FFX、" + result.resources + " 个资源、" + result.folders + " 个目录" : "新增 " + (result.found || result.added || 0) + " 项") + (result.invalid ? "，失效 " + result.invalid + " 项" : ""));
        } else {
            setStatus("warning", "CANCELLED", result && result.message ? result.message : "未选择文件或目录");
        }
        renderAll();
    }

    function addPresetFiles() {
        if (!presetStore || !presetStore.available) { setStatus("warning", "CEP ONLY", "请在 After Effects 面板中添加本地预设"); return; }
        setStatus("working", "ADDING", "请选择一个或多个 .ffx 文件");
        presetStore.addPresetFiles(function (result) { reportScan(result, "添加预设"); });
    }

    function scanDirectory() {
        if (!presetStore || !presetStore.available) { setStatus("warning", "CEP ONLY", "请在 After Effects 面板中扫描本地目录"); return; }
        setStatus("working", "SCANNING", "将录入完整目录层级、FFX、图片、视频、脚本、工程与模板");
        presetStore.chooseAndScanDirectory(function (result) { reportScan(result, "扫描目录"); });
    }

    function refreshDirectories() {
        if (!presetStore || !presetStore.available) { setStatus("warning", "CEP ONLY", "请在 After Effects 面板中刷新目录"); return; }
        setStatus("working", "REFRESHING", "正在重新扫描 AE 与已添加目录");
        presetStore.refreshDirectories(function (result) { reportScan(result, "刷新目录"); });
    }

    function assignThumbnail() {
        var preset = getPreset(state.selectedPresetId);
        if (!presetStore || !preset) { return; }
        presetStore.assignThumbnail(preset.id, function (result) {
            setStatus(result.ok ? "success" : "warning", result.ok ? "THUMBNAIL" : "CANCELLED", result.message);
            renderAll();
        });
    }

    function renderSelectedPreview() {
        var preset = getPreset(state.selectedPresetId);
        if (!preset || !preset.canRenderPreview) {
            setStatus("neutral", "PREVIEW", preset && preset.previewType === "video" ? "该预设已有动态预览" : "该资源不能生成 AE 真实预览");
            return;
        }
        requestRenderedPreview(preset, "button");
    }

    function toggleSettings(forceOpen) {
        var shouldOpen = typeof forceOpen === "boolean" ? forceOpen : dom.settingsPopover.hidden;
        dom.settingsPopover.hidden = !shouldOpen;
        dom.settingsButton.setAttribute("aria-expanded", String(shouldOpen));
    }

    function applyPreferences() {
        dom.app.classList.toggle("motion-on", state.motion);
        dom.app.classList.toggle("compact", state.compact);
        dom.motionToggle.checked = state.motion;
        dom.compactToggle.checked = state.compact;
        dom.autoPreviewToggle.checked = state.autoPreview;
    }

    function updateFfmpegStatus(result) {
        state.ffmpeg = {
            checked: true,
            ok: !!(result && result.ok),
            path: result && result.path ? result.path : "",
            message: result && result.message ? result.message : "未找到 FFmpeg；AE 实渲不会启动"
        };
        if (!bridge.isHostAvailable()) {
            dom.settingsNote.textContent = "浏览器演示模式 · AE 实渲与 FFmpeg 探测仅在面板内启用。";
        } else if (state.ffmpeg.ok) {
            dom.settingsNote.textContent = "FFmpeg 可用 · " + state.ffmpeg.path + " · 生成前已完成依赖检查。";
        } else {
            dom.settingsNote.textContent = "FFmpeg 缺失 · AE 实渲不会启动。请配置 PATH 或 FFMPEG_PATH 后重启 AE。";
        }
        if (state.selectedPresetId) { updateDrawer(); }
    }

    function bindEvents() {
        dom.searchInput.addEventListener("input", function () {
            state.query = dom.searchInput.value;
            renderGrid();
        });
        dom.refreshButton.addEventListener("click", function () { refreshContext(true); });
        dom.clearFiltersButton.addEventListener("click", clearFilters);
        dom.clearFolderButton.addEventListener("click", function () {
            state.folderPath = "";
            renderAll();
            setStatus("neutral", "ALL FOLDERS", "正在显示所有已录入目录中的资源");
        });
        dom.closeDrawerButton.addEventListener("click", closeDrawer);
        dom.executeButton.addEventListener("click", function () {
            if (state.mode === "presets") { executeSelectedPreset(); }
            else { executeSelectedTool(); }
        });
        dom.favoriteDrawerButton.addEventListener("click", function () {
            if (state.mode === "presets" && state.selectedPresetId) { togglePresetFavorite(state.selectedPresetId); }
            else if (state.selectedToolId) { toggleFavorite(state.selectedToolId); }
        });
        Array.prototype.forEach.call(document.querySelectorAll(".library-switch button"), function (button) {
            button.addEventListener("click", function () { switchMode(button.getAttribute("data-mode")); });
        });
        dom.addPresetButton.addEventListener("click", addPresetFiles);
        dom.emptyAddPresetButton.addEventListener("click", addPresetFiles);
        dom.scanDirectoryButton.addEventListener("click", scanDirectory);
        dom.emptyScanDirectoryButton.addEventListener("click", scanDirectory);
        dom.refreshDirectoriesButton.addEventListener("click", refreshDirectories);
        dom.assignThumbnailButton.addEventListener("click", assignThumbnail);
        dom.renderPreviewButton.addEventListener("click", renderSelectedPreview);
        dom.settingsButton.addEventListener("click", function () { toggleSettings(); });
        dom.closeSettingsButton.addEventListener("click", function () { toggleSettings(false); });
        dom.motionToggle.addEventListener("change", function () {
            state.motion = dom.motionToggle.checked;
            writeStore("know.motion", state.motion);
            applyPreferences();
        });
        dom.compactToggle.addEventListener("change", function () {
            state.compact = dom.compactToggle.checked;
            writeStore("know.compact", state.compact);
            applyPreferences();
        });
        dom.autoPreviewToggle.addEventListener("change", function () {
            state.autoPreview = dom.autoPreviewToggle.checked;
            writeStore("know.autoPreview", state.autoPreview);
            setStatus("neutral", "AUTO PREVIEW", state.autoPreview ? "真实 FFX 首次悬停将自动生成并缓存 MP4" : "已关闭自动生成；仍可在详情中手动生成");
        });
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                Array.prototype.forEach.call(document.querySelectorAll("video"), function (video) {
                    video.pause();
                    try { video.currentTime = 0; } catch (ignore) {}
                });
            }
        });
        document.addEventListener("keydown", function (event) {
            var targetName = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
            if (event.key === "/" && targetName !== "input") {
                event.preventDefault();
                dom.searchInput.focus();
            }
            if (event.key === "Escape") {
                if (!dom.settingsPopover.hidden) { toggleSettings(false); }
                else if (dom.detailDrawer.getAttribute("aria-hidden") === "false") { closeDrawer(); }
            }
        });
    }

    function cacheDom() {
        [
            "app", "hostBadge", "refreshButton", "settingsButton", "contextTitle", "layerCount", "propertyCount",
            "categoryNav", "toolCount", "searchInput", "resultCount", "toolGrid", "emptyState", "clearFiltersButton",
            "detailDrawer", "drawerType", "drawerTitle", "drawerDescription", "drawerRequirement", "parameterForm",
            "closeDrawerButton", "favoriteDrawerButton", "executeButton", "statusBar", "statusTitle", "statusMessage",
            "statusTime", "settingsPopover", "closeSettingsButton", "motionToggle", "compactToggle", "autoPreviewToggle", "settingsNote",
            "presetActions", "addPresetButton", "scanDirectoryButton", "refreshDirectoriesButton", "emptyPresetActions",
            "emptyAddPresetButton", "emptyScanDirectoryButton", "presetDrawerPreview", "presetDrawerImage", "presetPath",
            "assignThumbnailButton", "renderPreviewButton", "folderPanel", "folderTree", "clearFolderButton", "presetDrawerVideo"
        ].forEach(function (id) { dom[id] = document.getElementById(id); });
    }

    function init() {
        cacheDom();
        dom.app.setAttribute("data-mode", state.mode);
        applyPreferences();
        bindEvents();
        if (previewRenderer) {
            previewRenderer.setListener(function (id, renderState) {
                updatePreviewCardState(id, renderState);
                if (state.selectedPresetId === id) { updateDrawer(); }
                if (renderState.phase === "encoding") { setStatus("working", "ENCODING", renderState.message); }
                if (renderState.phase === "error") { setStatus("error", "PREVIEW FAILED", renderState.message); }
            });
            if (previewRenderer.available) {
                previewRenderer.probeFfmpeg(updateFfmpegStatus);
            } else {
                updateFfmpegStatus({ ok: false, message: "CEP Node 不可用" });
            }
        } else {
            updateFfmpegStatus({ ok: false, message: "预览渲染器不可用" });
        }
        dom.toolCount.textContent = catalog.length + " TOOLS";
        renderAll();
        refreshContext(true);
        if (presetStore && presetStore.available && presetStore.getRoots().length === 0) {
            presetStore.scanAEDirectories(function () { if (state.mode === "presets") { renderAll(); } });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}());
