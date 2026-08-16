(function () {
    "use strict";

    var PREVIEWS = [
        "assets/preset-previews/roxy-water-ruins.webp",
        "assets/preset-previews/roxy-arcane-library.webp",
        "assets/preset-previews/roxy-ice-ridge.webp",
        "assets/preset-previews/roxy-crystal-cave.webp",
        "assets/preset-previews/roxy-mist-forest.webp",
        "assets/preset-previews/roxy-star-tower.webp"
    ];
    var DEMO_NAMES = ["水环入场", "魔法书辉光", "冰晶定格", "洞窟光球", "森雾流光", "星塔轨迹"];
    var PREVIEW_PRIORITY = [".mp4", ".webm", ".mov", ".gif", ".webp", ".png", ".jpg", ".jpeg"];
    var RENDERED_PREVIEW_PROFILE = "waguri-kaoruko-v1";
    var RESOURCE_EXTENSIONS = {
        ".png": "image", ".webp": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image",
        ".mp4": "video", ".webm": "video", ".mov": "video",
        ".jsx": "script", ".jsxbin": "script",
        ".aep": "project", ".aet": "project", ".mogrt": "template"
    };
    var fs = null;
    var path = null;
    var processModule = null;
    var indexPath = "";
    var data = {
        schemaVersion: 3,
        roots: [],
        folders: [],
        presets: [],
        resources: [],
        favorites: [],
        recent: [],
        lastScan: 0
    };

    function nodeRequire(name) {
        try {
            if (window.cep_node && typeof window.cep_node.require === "function") { return window.cep_node.require(name); }
            if (typeof window.require === "function") { return window.require(name); }
            if (typeof require === "function") { return require(name); }
        } catch (ignore) {}
        return null;
    }

    function initNode() {
        fs = nodeRequire("fs");
        path = nodeRequire("path");
        processModule = nodeRequire("process");
        if (!fs || !path || !processModule) { return false; }
        indexPath = path.join(processModule.env.APPDATA || processModule.env.USERPROFILE || ".", "KNOWMotionWorkbench", "presets.json");
        load();
        return true;
    }

    function ensureParent(filePath) {
        var parent = path.dirname(filePath);
        var stack = [];
        while (parent && !fs.existsSync(parent)) {
            stack.unshift(parent);
            if (path.dirname(parent) === parent) { break; }
            parent = path.dirname(parent);
        }
        stack.forEach(function (folder) {
            try { fs.mkdirSync(folder); } catch (ignore) {}
        });
    }

    function load() {
        var parsed;
        var legacy;
        if (!indexPath || !fs.existsSync(indexPath)) { return; }
        try {
            parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
            if (!parsed || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3)) { return; }
            legacy = parsed.schemaVersion === 1;
            data.roots = parsed.roots instanceof Array ? parsed.roots : [];
            data.folders = parsed.folders instanceof Array ? parsed.folders : [];
            data.presets = parsed.presets instanceof Array ? parsed.presets : [];
            data.resources = parsed.resources instanceof Array ? parsed.resources : [];
            data.favorites = parsed.favorites instanceof Array ? parsed.favorites : [];
            data.recent = parsed.recent instanceof Array ? parsed.recent : [];
            data.lastScan = parsed.lastScan || 0;
            data.schemaVersion = 3;
            if (legacy) { migrateSchemaOne(); }
            data.presets.forEach(function (preset) {
                if (preset.renderedPreviewPath && preset.renderedPreviewProfile !== RENDERED_PREVIEW_PROFILE) {
                    removeCachedPreview(preset.renderedPreviewPath);
                    preset.renderedPreviewPath = "";
                    preset.renderedPreviewModified = 0;
                    preset.renderedPreviewProfile = "";
                }
            });
            save();
        } catch (ignore) {}
    }

    function migrateSchemaOne() {
        var seen = { entries: {}, folders: {} };
        data.roots = data.roots.filter(function (root) { return !!(root && root.path); }).map(function (root) {
            root.id = root.id || "root-" + hash(root.path);
            root.source = root.source || "custom";
            root.label = root.label || path.basename(root.path);
            root.invalid = !safeStat(root.path);
            return root;
        });
        data.presets = data.presets.filter(function (preset) { return !!(preset && preset.path); }).map(function (preset) {
            var rootPath = preset.rootPath || path.dirname(preset.path);
            var rawExt = path.extname(preset.path);
            preset.id = preset.id || "ffx-" + hash(preset.path);
            preset.name = preset.name || path.basename(preset.path, rawExt);
            preset.rootPath = rootPath;
            preset.folderPath = path.dirname(preset.path);
            preset.folder = preset.folder || path.basename(preset.folderPath);
            preset.relative = path.relative(rootPath, preset.path);
            preset.source = preset.source || "custom";
            preset.kind = "preset";
            preset.ext = ".ffx";
            preset.previewPath = preset.previewPath || "";
            preset.previewKind = preset.previewKind || "";
            preset.invalid = !safeStat(preset.path);
            preset.invalidReason = preset.invalid ? "文件路径已失效" : "";
            return preset;
        });
        data.presets.forEach(function (preset) {
            rootRecord(preset.rootPath, preset.source, path.basename(preset.rootPath));
        });
        data.folders = [];
        data.resources = [];
        data.roots.forEach(function (root) { scanRoot(root, seen); });
        markInvalid(seen, data.roots);
        data.lastScan = Date.now();
    }

    function save() {
        if (!indexPath || !fs) { return; }
        try {
            ensureParent(indexPath);
            fs.writeFileSync(indexPath, JSON.stringify(data, null, 2), "utf8");
        } catch (ignore) {}
    }

    function normalized(filePath) {
        return String(filePath || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    }

    function hash(value) {
        var input = normalized(value);
        var result = 2166136261;
        var i;
        for (i = 0; i < input.length; i += 1) {
            result ^= input.charCodeAt(i);
            result += (result << 1) + (result << 4) + (result << 7) + (result << 8) + (result << 24);
        }
        return (result >>> 0).toString(36);
    }

    function previewFor(filePath) {
        var numeric = parseInt(hash(filePath), 36);
        return PREVIEWS[(isNaN(numeric) ? 0 : numeric) % PREVIEWS.length];
    }

    function fileUrl(filePath) {
        if (!filePath) { return ""; }
        if (filePath.indexOf("assets/") === 0) { return filePath; }
        return "file:///" + String(filePath).replace(/\\/g, "/").split("/").map(function (part, index) {
            return index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part);
        }).join("/");
    }

    function safeStat(filePath) {
        try { return fs.statSync(filePath); } catch (ignore) { return null; }
    }

    function previewCacheDirectory() {
        return indexPath && path ? path.join(path.dirname(indexPath), "preview-cache") : "";
    }

    function inPreviewCache(filePath) {
        var cache = normalized(previewCacheDirectory());
        var candidate = normalized(filePath);
        return !!cache && (candidate === cache || candidate.indexOf(cache + "\\") === 0);
    }

    function removeCachedPreview(filePath) {
        try {
            if (filePath && inPreviewCache(filePath) && fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
        } catch (ignore) {}
    }

    function safeManifest(folderPath) {
        var manifestPath = path.join(folderPath, "folder.json");
        var parsed;
        if (!safeStat(manifestPath)) { return {}; }
        try {
            parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (ignore) { return {}; }
    }

    function sourceLabel(source) {
        if (source === "official") { return "AE 官方"; }
        if (source === "user") { return "用户预设"; }
        if (source === "custom") { return "自选目录"; }
        return "示例资源";
    }

    function typeLabel(kind, ext) {
        if (kind === "preset") { return "FFX"; }
        if (kind === "image") { return (ext || "IMG").replace(".", "").toUpperCase(); }
        if (kind === "video") { return (ext || "VIDEO").replace(".", "").toUpperCase(); }
        if (kind === "script") { return (ext || "SCRIPT").replace(".", "").toUpperCase(); }
        if (kind === "project") { return (ext || "PROJECT").replace(".", "").toUpperCase(); }
        if (kind === "template") { return "MOGRT"; }
        return "FILE";
    }

    function rootRecord(rootPath, source, label) {
        var key = normalized(rootPath);
        var i;
        for (i = 0; i < data.roots.length; i += 1) {
            if (normalized(data.roots[i].path) === key) {
                data.roots[i].source = source || data.roots[i].source;
                data.roots[i].label = label || data.roots[i].label;
                return data.roots[i];
            }
        }
        data.roots.push({ id: "root-" + hash(rootPath), path: rootPath, source: source || "custom", label: label || path.basename(rootPath), invalid: false });
        return data.roots[data.roots.length - 1];
    }

    function findFolder(folderPath) {
        var key = normalized(folderPath);
        var i;
        for (i = 0; i < data.folders.length; i += 1) {
            if (normalized(data.folders[i].path) === key) { return data.folders[i]; }
        }
        return null;
    }

    function upsertFolder(folderPath, root) {
        var folder = findFolder(folderPath);
        var manifest = safeManifest(folderPath);
        var isRoot = normalized(folderPath) === normalized(root.path);
        var coverPath = manifest.cover ? path.resolve(folderPath, String(manifest.cover)) : "";
        if (!folder) {
            folder = {
                id: "folder-" + hash(folderPath),
                path: folderPath,
                rootPath: root.path,
                parentPath: isRoot ? "" : path.dirname(folderPath),
                name: path.basename(folderPath),
                label: path.basename(folderPath),
                relative: isRoot ? "" : path.relative(root.path, folderPath),
                source: root.source,
                category: "",
                coverPath: "",
                order: 0,
                invalid: false
            };
            data.folders.push(folder);
        }
        folder.rootPath = root.path;
        folder.parentPath = isRoot ? "" : path.dirname(folderPath);
        folder.source = root.source;
        folder.label = manifest.name ? String(manifest.name) : (isRoot ? root.label : path.basename(folderPath));
        folder.category = manifest.category ? String(manifest.category) : "";
        folder.coverPath = coverPath && safeStat(coverPath) ? coverPath : "";
        folder.order = isNaN(Number(manifest.order)) ? 0 : Number(manifest.order);
        folder.invalid = !safeStat(folderPath);
        if (isRoot && manifest.name) { root.label = String(manifest.name); }
        return folder;
    }

    function findEntry(filePath, list) {
        var key = normalized(filePath);
        var i;
        for (i = 0; i < list.length; i += 1) {
            if (normalized(list[i].path) === key) { return list[i]; }
        }
        return null;
    }

    function baseEntry(filePath, root, kind) {
        var stat = safeStat(filePath);
        var rawExt = path.extname(filePath);
        var ext = rawExt.toLowerCase();
        return {
            id: (kind === "preset" ? "ffx-" : "asset-") + hash(filePath),
            name: path.basename(filePath, rawExt),
            path: filePath,
            rootPath: root.path,
            folderPath: path.dirname(filePath),
            folder: path.basename(path.dirname(filePath)),
            relative: path.relative(root.path, filePath),
            source: root.source,
            kind: kind,
            ext: ext,
            thumbnail: "",
            previewPath: "",
            previewKind: "",
            invalid: !stat,
            invalidReason: stat ? "" : "文件不存在",
            modified: stat ? Number(stat.mtimeMs || stat.mtime.getTime()) : 0,
            addedAt: Date.now(),
            lastUsed: 0,
            useCount: 0
        };
    }

    function upsertPreset(filePath, root) {
        var preset = findEntry(filePath, data.presets);
        var fresh = baseEntry(filePath, root, "preset");
        if (!preset) { preset = fresh; data.presets.push(preset); }
        else {
            if (preset.renderedPreviewPath && Number(preset.renderedPreviewModified || 0) !== fresh.modified) {
                removeCachedPreview(preset.renderedPreviewPath);
                preset.renderedPreviewPath = "";
                preset.renderedPreviewModified = 0;
                preset.renderedPreviewProfile = "";
            }
            preset.name = fresh.name;
            preset.rootPath = fresh.rootPath;
            preset.folderPath = fresh.folderPath;
            preset.folder = fresh.folder;
            preset.relative = fresh.relative;
            preset.source = fresh.source;
            preset.ext = fresh.ext;
            preset.invalid = fresh.invalid;
            preset.invalidReason = fresh.invalidReason;
            preset.modified = fresh.modified;
        }
        preset.kind = "preset";
        return preset;
    }

    function upsertResource(filePath, root) {
        var ext = path.extname(filePath).toLowerCase();
        var kind = RESOURCE_EXTENSIONS[ext];
        var resource;
        var fresh;
        if (!kind) { return null; }
        resource = findEntry(filePath, data.resources);
        fresh = baseEntry(filePath, root, kind);
        fresh.isPreview = false;
        if (!resource) { resource = fresh; data.resources.push(resource); }
        else {
            resource.name = fresh.name;
            resource.rootPath = fresh.rootPath;
            resource.folderPath = fresh.folderPath;
            resource.folder = fresh.folder;
            resource.relative = fresh.relative;
            resource.source = fresh.source;
            resource.kind = fresh.kind;
            resource.ext = fresh.ext;
            resource.invalid = fresh.invalid;
            resource.invalidReason = fresh.invalidReason;
            resource.modified = fresh.modified;
        }
        return resource;
    }

    function walk(rootPath, fileCallback, folderCallback, depth) {
        var entries;
        var i;
        var current;
        var stat;
        if (depth > 20) { return; }
        try { entries = fs.readdirSync(rootPath); } catch (ignore) { return; }
        for (i = 0; i < entries.length; i += 1) {
            current = path.join(rootPath, entries[i]);
            stat = safeStat(current);
            if (!stat) { continue; }
            if (stat.isDirectory()) {
                folderCallback(current);
                walk(current, fileCallback, folderCallback, depth + 1);
            } else if (stat.isFile()) {
                fileCallback(current);
            }
        }
    }

    function nearestFolderCover(folderPath, rootPath) {
        var current = folderPath;
        var folder;
        while (normalized(current).indexOf(normalized(rootPath)) === 0) {
            folder = findFolder(current);
            if (folder && folder.coverPath) { return folder.coverPath; }
            if (normalized(current) === normalized(rootPath) || path.dirname(current) === current) { break; }
            current = path.dirname(current);
        }
        return "";
    }

    function linkPreviews(root) {
        var mediaByBase = {};
        data.resources.forEach(function (resource) {
            if (normalized(resource.rootPath) !== normalized(root.path)) { return; }
            resource.isPreview = false;
            if (PREVIEW_PRIORITY.indexOf(resource.ext) !== -1) {
                var key = normalized(path.join(resource.folderPath, resource.name));
                if (!mediaByBase[key]) { mediaByBase[key] = []; }
                mediaByBase[key].push(resource);
            }
        });
        data.presets.forEach(function (preset) {
            var choices;
            var selected = null;
            var key;
            if (normalized(preset.rootPath) !== normalized(root.path)) { return; }
            preset.previewPath = "";
            preset.previewKind = "";
            preset.previewSource = "";
            key = normalized(path.join(preset.folderPath, preset.name));
            choices = mediaByBase[key] || [];
            PREVIEW_PRIORITY.some(function (extension) {
                var match = choices.filter(function (resource) { return resource.ext === extension; })[0];
                if (match) { selected = match; return true; }
                return false;
            });
            choices.forEach(function (resource) { resource.isPreview = true; });
            if (selected) {
                preset.previewPath = selected.path;
                preset.previewKind = selected.kind === "video" ? "video" : "image";
                preset.previewSource = "matched";
            } else {
                preset.previewPath = nearestFolderCover(preset.folderPath, root.path);
                preset.previewKind = preset.previewPath ? "image" : "";
                preset.previewSource = preset.previewPath ? "folder" : "placeholder";
            }
        });
        data.folders.forEach(function (folder) {
            var coverResource;
            if (normalized(folder.rootPath) !== normalized(root.path) || !folder.coverPath) { return; }
            coverResource = findEntry(folder.coverPath, data.resources);
            if (coverResource) { coverResource.isPreview = true; }
        });
        data.resources.forEach(function (resource) {
            if (normalized(resource.rootPath) !== normalized(root.path) || resource.isPreview) { return; }
            if (resource.kind === "image" || resource.kind === "video") {
                resource.previewPath = resource.path;
                resource.previewKind = resource.kind === "video" ? "video" : "image";
                resource.previewSource = "resource";
            } else {
                resource.previewPath = nearestFolderCover(resource.folderPath, root.path);
                resource.previewKind = resource.previewPath ? "image" : "";
                resource.previewSource = resource.previewPath ? "folder" : "placeholder";
            }
        });
    }

    function scanRoot(root, seen) {
        var stat = safeStat(root.path);
        var counts = { presets: 0, resources: 0, folders: 0 };
        if (!stat || !stat.isDirectory()) { root.invalid = true; return counts; }
        root.invalid = false;
        upsertFolder(root.path, root);
        seen.folders[normalized(root.path)] = true;
        counts.folders += 1;
        walk(root.path, function (filePath) {
            var ext = path.extname(filePath).toLowerCase();
            if (ext === ".ffx") {
                seen.entries[normalized(filePath)] = true;
                upsertPreset(filePath, root);
                counts.presets += 1;
            } else if (RESOURCE_EXTENSIONS[ext]) {
                seen.entries[normalized(filePath)] = true;
                upsertResource(filePath, root);
                counts.resources += 1;
            }
        }, function (folderPath) {
            seen.folders[normalized(folderPath)] = true;
            upsertFolder(folderPath, root);
            counts.folders += 1;
        }, 0);
        linkPreviews(root);
        return counts;
    }

    function underRoot(item, root) {
        return normalized(item.rootPath) === normalized(root.path);
    }

    function markInvalid(seen, rootsScanned) {
        var invalid = 0;
        data.presets.concat(data.resources).forEach(function (entry) {
            var scanned = rootsScanned.some(function (root) { return underRoot(entry, root); });
            var exists = !!safeStat(entry.path);
            if ((scanned && !seen.entries[normalized(entry.path)]) || !exists) {
                entry.invalid = true;
                entry.invalidReason = exists ? "已不在扫描目录中" : "文件路径已失效";
                invalid += 1;
            } else if (exists) {
                entry.invalid = false;
                entry.invalidReason = "";
            }
        });
        data.folders.forEach(function (folder) {
            var scanned = rootsScanned.some(function (root) { return underRoot(folder, root); });
            folder.invalid = (scanned && !seen.folders[normalized(folder.path)]) || !safeStat(folder.path);
        });
        return invalid;
    }

    function discoveredAERoots() {
        var env;
        var results = [];
        var adobeRoot;
        var entries;
        if (!fs || !path || !processModule) { return results; }
        env = processModule.env;
        adobeRoot = path.join(env.ProgramFiles || "C:\\Program Files", "Adobe");
        try { entries = fs.readdirSync(adobeRoot); } catch (ignore) { entries = []; }
        entries.forEach(function (entry) {
            var presetPath;
            if (/^Adobe After Effects/i.test(entry)) {
                presetPath = path.join(adobeRoot, entry, "Support Files", "Presets");
                if (safeStat(presetPath)) { results.push({ path: presetPath, source: "official", label: entry + " 官方预设" }); }
            }
        });
        [path.join(env.USERPROFILE || "", "Documents", "Adobe", "After Effects"), path.join(env.APPDATA || "", "Adobe", "After Effects")].forEach(function (base) {
            var versions;
            try { versions = fs.readdirSync(base); } catch (ignore) { versions = []; }
            versions.forEach(function (version) {
                var userPath = path.join(base, version, "User Presets");
                if (safeStat(userPath)) { results.push({ path: userPath, source: "user", label: version + " 用户预设" }); }
            });
        });
        return results;
    }

    function performScan(roots, callback) {
        var seen = { entries: {}, folders: {} };
        var totals = { presets: 0, resources: 0, folders: 0 };
        var invalid;
        setTimeout(function () {
            roots.forEach(function (root) {
                var counts = scanRoot(root, seen);
                totals.presets += counts.presets;
                totals.resources += counts.resources;
                totals.folders += counts.folders;
            });
            invalid = markInvalid(seen, roots);
            data.lastScan = Date.now();
            save();
            callback({
                ok: true,
                found: totals.presets + totals.resources,
                presets: totals.presets,
                resources: totals.resources,
                folders: totals.folders,
                total: visibleEntries().length,
                invalid: invalid,
                roots: roots.length
            });
        }, 20);
    }

    function scanAEDirectories(callback) {
        if (!fs) { callback({ ok: false, message: "当前环境无法访问本地目录" }); return; }
        var roots = discoveredAERoots();
        roots.forEach(function (root) { rootRecord(root.path, root.source, root.label); });
        performScan(roots, callback);
    }

    function refreshDirectories(callback) {
        if (!fs) { callback({ ok: false, message: "当前环境无法访问本地目录" }); return; }
        discoveredAERoots().forEach(function (root) { rootRecord(root.path, root.source, root.label); });
        performScan(data.roots.slice(0), callback);
    }

    function chooseDialog(allowMultiple, directory, title, types, callback) {
        var result;
        try {
            if (window.cep && window.cep.fs && typeof window.cep.fs.showOpenDialogEx === "function") {
                result = window.cep.fs.showOpenDialogEx(allowMultiple, directory, title, "", types || []);
                callback(result && result.err === 0 && result.data ? result.data : []);
                return;
            }
        } catch (ignore) {}
        callback([]);
    }

    function addPresetFiles(callback) {
        chooseDialog(true, false, "选择 After Effects .ffx 预设", ["ffx"], function (files) {
            var added = 0;
            var roots = {};
            files.forEach(function (filePath) {
                var root;
                if (!path || path.extname(filePath).toLowerCase() !== ".ffx") { return; }
                root = rootRecord(path.dirname(filePath), "custom", path.basename(path.dirname(filePath)));
                roots[normalized(root.path)] = root;
                upsertFolder(root.path, root);
                upsertPreset(filePath, root);
                try {
                    fs.readdirSync(root.path).forEach(function (name) {
                        var sibling = path.join(root.path, name);
                        var ext = path.extname(sibling).toLowerCase();
                        if (RESOURCE_EXTENSIONS[ext] && path.basename(sibling, path.extname(sibling)).toLowerCase() === path.basename(filePath, path.extname(filePath)).toLowerCase()) {
                            upsertResource(sibling, root);
                        }
                    });
                } catch (ignore) {}
                added += 1;
            });
            Object.keys(roots).forEach(function (key) { linkPreviews(roots[key]); });
            save();
            callback({ ok: added > 0, added: added, found: added, total: visibleEntries().length, message: added ? "已添加 " + added + " 个预设" : "未选择 .ffx 文件" });
        });
    }

    function chooseAndScanDirectory(callback) {
        chooseDialog(false, true, "选择效果资源库（会保留所有子文件夹）", [], function (folders) {
            if (!folders.length) { callback({ ok: false, message: "未选择目录" }); return; }
            var root = rootRecord(folders[0], "custom", path.basename(folders[0]));
            performScan([root], callback);
        });
    }

    function assignThumbnail(id, callback) {
        var entry = getById(id);
        if (!entry || entry.demo || entry.kind !== "preset") { callback({ ok: false, message: "仅真实 FFX 预设可修改缩略图" }); return; }
        chooseDialog(false, false, "选择 PNG / WebP 缩略图", ["png", "webp"], function (files) {
            var ext;
            if (!files.length) { callback({ ok: false, message: "未选择缩略图" }); return; }
            ext = path.extname(files[0]).toLowerCase();
            if (ext !== ".png" && ext !== ".webp") { callback({ ok: false, message: "仅支持 PNG 或 WebP" }); return; }
            entry.thumbnail = files[0];
            save();
            callback({ ok: true, message: "缩略图已更新" });
        });
    }

    function demoFolders() {
        return [
            { id: "demo-root", path: "DEMO_LIBRARY", rootPath: "DEMO_LIBRARY", parentPath: "", label: "洛琪希效果库", source: "demo", order: 0, invalid: false },
            { id: "demo-water", path: "DEMO_LIBRARY\\水系魔法", rootPath: "DEMO_LIBRARY", parentPath: "DEMO_LIBRARY", label: "水系魔法", source: "demo", order: 1, invalid: false },
            { id: "demo-light", path: "DEMO_LIBRARY\\光影与场景", rootPath: "DEMO_LIBRARY", parentPath: "DEMO_LIBRARY", label: "光影与场景", source: "demo", order: 2, invalid: false }
        ];
    }

    function demos() {
        return DEMO_NAMES.map(function (name, index) {
            var folderPath = index < 3 ? "DEMO_LIBRARY\\水系魔法" : "DEMO_LIBRARY\\光影与场景";
            var demoPreview = index === 0 ? "assets/preset-previews/roxy-water-preview.mp4" : PREVIEWS[index];
            return {
                id: "demo-" + index,
                name: name + "（示例）",
                path: "",
                rootPath: "DEMO_LIBRARY",
                folderPath: folderPath,
                folder: index < 3 ? "水系魔法" : "光影与场景",
                source: "demo",
                kind: "preset",
                ext: ".ffx",
                thumbnail: index === 0 ? "" : PREVIEWS[index],
                previewPath: demoPreview,
                previewKind: index === 0 ? "video" : "image",
                previewSource: "demo",
                invalid: false,
                invalidReason: "",
                modified: 0,
                addedAt: 0,
                lastUsed: 0,
                useCount: 0,
                demo: true
            };
        }).concat([
            { id: "demo-resource-image", name: "魔法纹理参考", path: "", rootPath: "DEMO_LIBRARY", folderPath: "DEMO_LIBRARY\\光影与场景", folder: "光影与场景", source: "demo", kind: "image", ext: ".webp", previewPath: PREVIEWS[1], previewKind: "image", previewSource: "demo", invalid: false, demo: true, lastUsed: 0 },
            { id: "demo-resource-project", name: "星塔片头工程", path: "", rootPath: "DEMO_LIBRARY", folderPath: "DEMO_LIBRARY\\光影与场景", folder: "光影与场景", source: "demo", kind: "project", ext: ".aep", previewPath: PREVIEWS[5], previewKind: "image", previewSource: "demo", invalid: false, demo: true, lastUsed: 0 }
        ]);
    }

    function actualEntries() {
        return data.presets.concat(data.resources.filter(function (resource) { return !resource.isPreview; }));
    }

    function visibleEntries() {
        var actual = actualEntries();
        return actual.length ? actual : demos();
    }

    function copyEntry(entry) {
        var copy = {};
        var key;
        var previewPath;
        var posterPath;
        var renderedValid;
        for (key in entry) { if (entry.hasOwnProperty(key)) { copy[key] = entry[key]; } }
        renderedValid = !!(entry.renderedPreviewPath && entry.renderedPreviewProfile === RENDERED_PREVIEW_PROFILE && Number(entry.renderedPreviewModified || 0) === Number(entry.modified || 0) && safeStat(entry.renderedPreviewPath));
        posterPath = entry.thumbnail || (entry.previewKind === "image" ? entry.previewPath : "") || previewFor(entry.path || entry.id);
        previewPath = renderedValid ? entry.renderedPreviewPath : (entry.thumbnail || entry.previewPath || previewFor(entry.path || entry.id));
        copy.previewUrl = fileUrl(previewPath);
        copy.thumbnailUrl = copy.previewUrl;
        copy.posterUrl = renderedValid ? fileUrl(posterPath) : "";
        copy.previewType = renderedValid ? "video" : (entry.thumbnail ? "image" : (entry.previewKind || "image"));
        copy.previewSource = renderedValid ? "ae-render" : (entry.demo ? "demo" : (entry.thumbnail ? "manual" : (entry.previewSource || (entry.previewPath ? "matched" : "placeholder"))));
        copy.previewSourceLabel = {
            "ae-render": "AE 实渲",
            manual: "手动缩略图",
            matched: "同名媒体",
            folder: "目录封面",
            resource: "资源自身",
            demo: "原创演示",
            placeholder: "原创占位"
        }[copy.previewSource] || "原创占位";
        copy.sourceLabel = sourceLabel(entry.source);
        copy.typeLabel = typeLabel(entry.kind, entry.ext);
        copy.favorite = data.favorites.indexOf(entry.id) !== -1;
        copy.recent = data.recent.indexOf(entry.id) !== -1;
        copy.canApply = entry.kind === "preset" && !entry.demo && !entry.invalid;
        copy.canRenderPreview = entry.kind === "preset" && !entry.demo && !entry.invalid && !renderedValid && copy.previewType !== "video";
        return copy;
    }

    function getEntries() {
        return visibleEntries().map(copyEntry);
    }

    function getPresets() {
        var list = data.presets.length ? data.presets : demos().filter(function (entry) { return entry.kind === "preset"; });
        return list.map(copyEntry);
    }

    function getFolders() {
        var actual = actualEntries();
        var folders = data.folders.length ? data.folders.slice(0) : (actual.length ? [] : demoFolders());
        var entries = actual.length ? actual : demos();
        return folders.map(function (folder) {
            var copy = {};
            var key;
            for (key in folder) { if (folder.hasOwnProperty(key)) { copy[key] = folder[key]; } }
            copy.count = entries.filter(function (entry) { return entryInFolder(entry, folder.path); }).length;
            copy.directCount = entries.filter(function (entry) { return normalized(entry.folderPath) === normalized(folder.path); }).length;
            return copy;
        }).sort(function (a, b) {
            if (normalized(a.parentPath) === normalized(b.parentPath) && a.order !== b.order) { return a.order - b.order; }
            return String(a.label).localeCompare(String(b.label));
        });
    }

    function getById(id) {
        var list = actualEntries();
        var i;
        if (!list.length) { list = demos(); }
        for (i = 0; i < list.length; i += 1) { if (list[i].id === id) { return list[i]; } }
        return null;
    }

    function entryInFolder(entry, folderPath) {
        var entryFolder = normalized(entry.folderPath);
        var target = normalized(folderPath);
        return !!target && (entryFolder === target || entryFolder.indexOf(target + "\\") === 0);
    }

    function toggleFavorite(id) {
        var index = data.favorites.indexOf(id);
        if (index === -1) { data.favorites.push(id); }
        else { data.favorites.splice(index, 1); }
        save();
        return index === -1;
    }

    function recordRecent(id) {
        var entry = getById(id);
        var index = data.recent.indexOf(id);
        if (index !== -1) { data.recent.splice(index, 1); }
        data.recent.unshift(id);
        data.recent = data.recent.slice(0, 24);
        if (entry) { entry.lastUsed = Date.now(); entry.useCount = (entry.useCount || 0) + 1; }
        save();
    }

    function validatePath(id) {
        var entry = getById(id);
        var stat;
        if (!entry || entry.demo || !fs) { return !!(entry && entry.demo); }
        stat = safeStat(entry.path);
        entry.invalid = !stat;
        entry.invalidReason = stat ? "" : "文件路径已失效";
        save();
        return !!stat;
    }

    function getRenderTarget(id) {
        var entry = getById(id);
        var directory = previewCacheDirectory();
        var base;
        var stagingDirectory;
        if (!entry || entry.demo || entry.kind !== "preset" || entry.invalid || !directory) { return null; }
        try {
            ensureParent(path.join(directory, "placeholder"));
            base = entry.id + "-" + RENDERED_PREVIEW_PROFILE + "-" + String(Math.round(Number(entry.modified || 0)));
            stagingDirectory = path.join(directory, ".staging", base + "-" + String(Date.now()));
            ensureParent(path.join(stagingDirectory, "placeholder"));
            return {
                outputPath: path.join(directory, base + ".mp4"),
                rawBasePath: path.join(stagingDirectory, "preview"),
                stagingDirectory: stagingDirectory
            };
        } catch (ignore) { return null; }
    }

    function registerRenderedPreview(id, filePath) {
        var entry = getById(id);
        var stat = safeStat(filePath);
        if (!entry || entry.demo || entry.kind !== "preset" || !stat || !stat.isFile() || path.extname(filePath).toLowerCase() !== ".mp4" || !inPreviewCache(filePath)) { return false; }
        if (entry.renderedPreviewPath && normalized(entry.renderedPreviewPath) !== normalized(filePath)) { removeCachedPreview(entry.renderedPreviewPath); }
        entry.renderedPreviewPath = filePath;
        entry.renderedPreviewModified = Number(entry.modified || 0);
        entry.renderedPreviewProfile = RENDERED_PREVIEW_PROFILE;
        save();
        return true;
    }

    var available = initNode();
    window.KNOWPresetStore = {
        available: available,
        indexPath: indexPath,
        getEntries: getEntries,
        getPresets: getPresets,
        getFolders: getFolders,
        getById: getById,
        entryInFolder: entryInFolder,
        scanAEDirectories: scanAEDirectories,
        refreshDirectories: refreshDirectories,
        addPresetFiles: addPresetFiles,
        chooseAndScanDirectory: chooseAndScanDirectory,
        assignThumbnail: assignThumbnail,
        toggleFavorite: toggleFavorite,
        recordRecent: recordRecent,
        validatePath: validatePath,
        getRenderTarget: getRenderTarget,
        registerRenderedPreview: registerRenderedPreview,
        getRoots: function () { return data.roots.slice(0); },
        getLastScan: function () { return data.lastScan; },
        getStats: function () { return { presets: data.presets.length, resources: data.resources.filter(function (item) { return !item.isPreview; }).length, folders: data.folders.length }; }
    };
}());
