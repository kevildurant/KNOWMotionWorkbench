import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const failures = [];
const checks = [];

function check(name, condition, detail = "") {
    checks.push({ name, ok: Boolean(condition), detail });
    if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

const required = [
    "CSXS/manifest.xml",
    "index.html",
    "css/panel.css",
    "js/catalog.js",
    "js/host-bridge.js",
    "js/preset-store.js",
    "js/preview-renderer.js",
    "js/app.js",
    "jsx/host.jsx",
    "assets/preview-source/waguri-kaoruko-preview.mp4",
    "assets/preview-source/waguri-kaoruko-preview.mp4.json",
    "docs/INSTALL_CN.md",
    "README.md"
];

required.forEach((file) => check(`文件存在 ${file}`, fs.existsSync(path.join(root, file))));

const manifest = read("CSXS/manifest.xml");
const html = read("index.html");
const css = read("css/panel.css");
const catalogSource = read("js/catalog.js");
const bridgeSource = read("js/host-bridge.js");
const presetStoreSource = read("js/preset-store.js");
const previewRendererSource = read("js/preview-renderer.js");
const appSource = read("js/app.js");
const hostSource = read("jsx/host.jsx");

check("Manifest 包含唯一扩展 ID", manifest.includes('ExtensionBundleId="com.know.motionworkbench"'));
check("Manifest 目标为 After Effects", /<Host\s+Name="AEFT"\s+Version="\[18\.0,99\.9\]"\s*\/>/.test(manifest));
check("Manifest 使用 CEP 11", manifest.includes('<RequiredRuntime Name="CSXS" Version="11.0" />'));
check("Manifest 主文件路径正确", manifest.includes("<MainPath>./index.html</MainPath>"));
check("Manifest 宿主脚本路径正确", manifest.includes("<ScriptPath>./jsx/host.jsx</ScriptPath>"));
check("Manifest 开启 Node 目录访问", manifest.includes("--enable-nodejs") && manifest.includes("--mixed-context"));

const referencedFiles = ["css/panel.css", "js/catalog.js", "js/host-bridge.js", "js/preset-store.js", "js/preview-renderer.js", "js/app.js"];
referencedFiles.forEach((file) => {
    check(`HTML 引用存在 ${file}`, html.includes(file) && fs.existsSync(path.join(root, file)));
});

check("设计方向契约保留在页面", /FORM:[\s\S]*seed af5f5969/.test(html));
check("页面包含完成契约", html.includes("unreviewed and undocumented is unfinished"));
check("界面无外部资源依赖", !/https?:\/\//i.test(html + css + catalogSource + bridgeSource + appSource));
check("预设操作按钮完整", ["addPresetButton", "scanDirectoryButton", "refreshDirectoriesButton", "assignThumbnailButton"].every((id) => html.includes(`id="${id}"`)));
check("目录树与动态预览入口完整", ["folderPanel", "folderTree", "clearFolderButton", "presetDrawerVideo"].every((id) => html.includes(`id="${id}"`)));
check("AE 真实预览控制入口完整", ["renderPreviewButton", "autoPreviewToggle"].every((id) => html.includes(`id="${id}"`)) && html.includes("js/preview-renderer.js"));
check("六张原创预览图存在", ["water-ruins", "arcane-library", "ice-ridge", "crystal-cave", "mist-forest", "star-tower"].every((name) => fs.existsSync(path.join(root, "assets", "preset-previews", `roxy-${name}.webp`))));
check("动态预览示例与来源记录存在", fs.existsSync(path.join(root, "assets", "preset-previews", "roxy-water-preview.mp4")) && fs.existsSync(path.join(root, "assets", "preset-previews", "roxy-water-preview.mp4.json")));
check("资源库递归索引 FFX 与配套文件", /\.ffx/.test(presetStoreSource) && /RESOURCE_EXTENSIONS/.test(presetStoreSource) && /walk\(current/.test(presetStoreSource));
check("预设支持 PNG WebP 缩略图", /\.png/.test(presetStoreSource) && /\.webp/.test(presetStoreSource) && /assignThumbnail/.test(presetStoreSource));
check("同名动态预览优先级存在", /PREVIEW_PRIORITY/.test(presetStoreSource) && /\.mp4/.test(presetStoreSource) && /previewKind/.test(presetStoreSource));
check("目录清单与层级索引存在", /folder\.json/.test(presetStoreSource) && /getFolders/.test(presetStoreSource) && /parentPath/.test(presetStoreSource));
check("预设索引包含收藏最近与失效状态", ["favorites", "recent", "invalidReason", "lastUsed"].every((key) => presetStoreSource.includes(key)));
check("真实预览先探测 FFmpeg 再进入 AE 并安全编码", /getRenderTarget/.test(presetStoreSource) && /registerRenderedPreview/.test(presetStoreSource) && /execFile/.test(previewRendererSource) && !/\.exec\s*\(/.test(previewRendererSource) && previewRendererSource.indexOf("findFfmpeg(function (binary)") < previewRendererSource.indexOf('bridge.execute("renderPresetPreview"') && /updateFfmpegStatus/.test(appSource));
check("真实预览锁定无后动作单文件、隔离暂存并恢复用户队列", /priorQueue\.push/.test(hostSource) && /item\.render = false/.test(hostSource) && /selectSingleFileOutput/.test(hostSource) && /getSettings\(GetSettingsFormat\.STRING\)/.test(hostSource) && /settings\["Format"\]/.test(hostSource) && /settings\["Video Output"\]/.test(hostSource) && /postRenderAction = PostRenderAction\.NONE/.test(hostSource) && /stagingDirectory/.test(presetStoreSource) && /removeDirectory\(target\.stagingDirectory\)/.test(previewRendererSource) && /priorQueue\[i\]\.item\.render = priorQueue\[i\]\.render/.test(hostSource));
check("真实预览统一使用内置和栗薰子视频底片", /waguri-kaoruko-preview\.mp4/.test(previewRendererSource) && /sourcePath: sourcePath/.test(previewRendererSource) && /app\.project\.importFile\(sourceImportOptions\)/.test(hostSource) && /KNOW PREVIEW VIDEO TARGET/.test(hostSource) && /sourceItem\.remove\(\)/.test(hostSource));
check("统一底片版本变化会使旧实渲缓存失效", /RENDERED_PREVIEW_PROFILE\s*=\s*"waguri-kaoruko-v1"/.test(presetStoreSource) && /preset\.renderedPreviewProfile !== RENDERED_PREVIEW_PROFILE/.test(presetStoreSource) && /entry\.renderedPreviewProfile === RENDERED_PREVIEW_PROFILE/.test(presetStoreSource));

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
check("HTML ID 无重复", new Set(ids).size === ids.length, `${ids.length} 个 ID`);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(catalogSource, sandbox, { filename: "catalog.js" });
const catalog = sandbox.window.KNOW_CATALOG;
const categories = sandbox.window.KNOW_CATEGORIES;
check("目录包含 12 个工具", Array.isArray(catalog) && catalog.length === 12, `实际 ${catalog?.length ?? 0}`);
check("目录包含 6 个分类入口", Array.isArray(categories) && categories.length === 6, `实际 ${categories?.length ?? 0}`);

const toolIds = catalog.map((tool) => tool.id);
check("工具 ID 无重复", new Set(toolIds).size === toolIds.length);
check("每个工具都有完整元数据", catalog.every((tool) => tool.title && tool.category && tool.type && tool.description && tool.requirement && tool.art));
check("参数键在单工具内无重复", catalog.every((tool) => new Set(tool.params.map((param) => param.key)).size === tool.params.length));

const handlerBlock = hostSource.match(/var handlers\s*=\s*\{([\s\S]*?)\n\s*\};/);
const handlerIds = handlerBlock
    ? [...handlerBlock[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1])
    : [];
const missingHandlers = toolIds.filter((id) => !handlerIds.includes(id));
const orphanHandlers = handlerIds.filter((id) => !toolIds.includes(id));
check("12 个工具都有宿主动作", missingHandlers.length === 0 && handlerIds.length === 14, `缺失 ${missingHandlers.join(", ") || "无"}`);
check("宿主仅增加预设应用与真实预览动作", orphanHandlers.length === 2 && orphanHandlers[0] === "applyPreset" && orphanHandlers[1] === "renderPresetPreview", orphanHandlers.join(", "));
check("应用与预览各调用一次 applyPreset", /layers\[0\]\.applyPreset\(presetFile\)/.test(hostSource) && /target\.applyPreset\(presetFile\)/.test(hostSource) && (hostSource.match(/\.applyPreset\(presetFile\)/g) || []).length === 2);
check("预设应用前验证文件与选中图层", hostSource.includes("presetFile.exists") && hostSource.includes("comp.selectedLayers"));

const forbidden = [
    { label: "let", pattern: /\blet\b/ },
    { label: "const", pattern: /\bconst\b/ },
    { label: "class", pattern: /\bclass\b/ },
    { label: "arrow", pattern: /=>/ },
    { label: "Promise", pattern: /\bPromise\b/ },
    { label: "template literal", pattern: /`/ }
];
const violations = forbidden.filter(({ pattern }) => pattern.test(hostSource)).map(({ label }) => label);
check("ExtendScript 保持 ES3 语法", violations.length === 0, violations.join(", "));
check("宿主修改使用 Undo Group", hostSource.includes("app.beginUndoGroup") && hostSource.includes("app.endUndoGroup"));
check("宿主不保存工程且只清理 KNOW 临时项", !/\.save\s*\(/.test(hostSource) && /renderItem\.remove\(\)/.test(hostSource) && /tempFolder\.remove\(\)/.test(hostSource) && !/activeItem\.remove\(\)/.test(hostSource));

for (const [name, source] of [["host-bridge.js", bridgeSource], ["preset-store.js", presetStoreSource], ["preview-renderer.js", previewRendererSource], ["app.js", appSource], ["host.jsx", hostSource]]) {
    try {
        new Function(source);
        check(`${name} JavaScript 语法有效`, true);
    } catch (error) {
        check(`${name} JavaScript 语法有效`, false, error.message);
    }
}

const presetTemp = fs.mkdtempSync(path.join(os.tmpdir(), "know-preset-test-"));
const presetFixture = path.join(presetTemp, "library", "nested");
fs.mkdirSync(presetFixture, { recursive: true });
fs.writeFileSync(path.join(presetTemp, "library", "Alpha.ffx"), "fixture");
fs.writeFileSync(path.join(presetTemp, "library", "Alpha.webp"), "fixture");
fs.writeFileSync(path.join(presetTemp, "library", "Alpha.mp4"), "fixture");
fs.writeFileSync(path.join(presetTemp, "library", "Plain.ffx"), "fixture");
fs.writeFileSync(path.join(presetTemp, "library", "Loose.webp"), "fixture");
fs.writeFileSync(path.join(presetTemp, "library", "Guide.jsx"), "fixture");
fs.writeFileSync(path.join(presetTemp, "library", "Project.aep"), "fixture");
fs.writeFileSync(path.join(presetFixture, "Beta.FFX"), "fixture");
fs.writeFileSync(path.join(presetFixture, "Beta.png"), "fixture");
fs.writeFileSync(path.join(presetFixture, "folder.json"), JSON.stringify({ name: "水系目录", cover: "Beta.png", order: 3 }));
fs.writeFileSync(path.join(presetFixture, "ignore.txt"), "fixture");
const fakeProcess = { env: { APPDATA: path.join(presetTemp, "appdata"), USERPROFILE: presetTemp, ProgramFiles: path.join(presetTemp, "Program Files") } };
const legacyIndexDirectory = path.join(fakeProcess.env.APPDATA, "KNOWMotionWorkbench");
fs.mkdirSync(legacyIndexDirectory, { recursive: true });
fs.writeFileSync(path.join(legacyIndexDirectory, "presets.json"), JSON.stringify({
    schemaVersion: 1,
    roots: [],
    presets: [{
        id: "legacy-alpha",
        name: "Alpha",
        path: path.join(presetTemp, "library", "Alpha.ffx"),
        rootPath: path.join(presetTemp, "library"),
        folder: "library",
        source: "custom",
        thumbnail: "",
        invalid: false
    }],
    favorites: ["legacy-alpha"],
    recent: [],
    lastScan: 1
}));
const presetSandbox = {
    window: {
        cep_node: {
            require(name) {
                if (name === "fs") return fs;
                if (name === "path") return path;
                if (name === "process") return fakeProcess;
                throw new Error(`Unexpected module ${name}`);
            }
        },
        cep: { fs: { showOpenDialogEx: () => ({ err: 0, data: [path.join(presetTemp, "library")] }) } }
    },
    setTimeout
};
vm.createContext(presetSandbox);
vm.runInContext(presetStoreSource, presetSandbox, { filename: "preset-store.js" });
const presetApi = presetSandbox.window.KNOWPresetStore;
const migratedEntries = presetApi.getEntries();
const migratedAlpha = migratedEntries.find((entry) => entry.id === "legacy-alpha");
const migratedPlain = migratedEntries.find((entry) => entry.name === "Plain");
const migratedIndex = JSON.parse(fs.readFileSync(path.join(legacyIndexDirectory, "presets.json"), "utf8"));
check("V1.1 索引迁移补齐 V1.3 字段", migratedIndex.schemaVersion === 3 && migratedAlpha?.kind === "preset" && migratedAlpha.ext === ".ffx" && migratedAlpha.folderPath && migratedAlpha.relative === "Alpha.ffx" && migratedAlpha.favorite);
check("V1.1 单独预设迁移会补根目录并重扫", presetApi.getRoots().length === 1 && presetApi.getFolders().length === 2 && migratedAlpha?.previewType === "video" && migratedAlpha.previewSource === "matched" && migratedPlain?.previewSource === "placeholder");
const scanResult = await new Promise((resolve) => presetApi.chooseAndScanDirectory(resolve));
const scannedPresets = presetApi.getPresets();
const scannedEntries = presetApi.getEntries();
const scannedFolders = presetApi.getFolders();
check("递归扫描读取大小写 FFX", scanResult.ok && scannedPresets.length === 3 && scannedPresets.some((preset) => preset.name === "Beta"));
check("扫描忽略非 FFX 文件", scannedPresets.every((preset) => !preset.path.endsWith("ignore.txt")));
check("同名视频优先绑定且不重复成卡", scannedPresets.find((preset) => preset.name === "Alpha")?.previewType === "video" && scannedEntries.filter((entry) => entry.name === "Alpha").length === 1);
check("卡片明确标注预览来源", scannedPresets.find((preset) => preset.name === "Alpha")?.previewSourceLabel === "同名媒体" && scannedPresets.find((preset) => preset.name === "Plain")?.previewSourceLabel === "原创占位");
const plainPreset = scannedPresets.find((preset) => preset.name === "Plain");
const renderTarget = presetApi.getRenderTarget(plainPreset.id);
fs.writeFileSync(renderTarget.outputPath, "fake mp4 cache");
check("AE 实渲缓存登记后切换为视频卡", presetApi.registerRenderedPreview(plainPreset.id, renderTarget.outputPath) && presetApi.getPresets().find((preset) => preset.id === plainPreset.id)?.previewSource === "ae-render" && presetApi.getPresets().find((preset) => preset.id === plainPreset.id)?.previewType === "video");
const future = new Date(Date.now() + 5000);
fs.utimesSync(path.join(presetTemp, "library", "Plain.ffx"), future, future);
await new Promise((resolve) => presetApi.refreshDirectories(resolve));
check("FFX 修改后自动失效旧实渲缓存", !fs.existsSync(renderTarget.outputPath) && presetApi.getPresets().find((preset) => preset.id === plainPreset.id)?.previewSource !== "ae-render");
check("未绑定资源生成独立卡片", ["image", "script", "project"].every((kind) => scannedEntries.some((entry) => entry.kind === kind)));
check("folder.json 自定义目录名称生效", scannedFolders.some((folder) => folder.label === "水系目录" && folder.parentPath));
check("扫描结果报告预设资源与目录", scanResult.presets === 3 && scanResult.resources === 6 && scanResult.folders === 2);
fs.unlinkSync(path.join(presetFixture, "Beta.FFX"));
await new Promise((resolve) => presetApi.refreshDirectories(resolve));
check("刷新目录记录失效路径", presetApi.getPresets().some((preset) => preset.name === "Beta" && preset.invalid && preset.invalidReason));
fs.rmSync(presetTemp, { recursive: true, force: true });

for (const result of checks) {
    process.stdout.write(`${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? ` (${result.detail})` : ""}\n`);
}

process.stdout.write(`\n${checks.length - failures.length}/${checks.length} checks passed.\n`);
if (failures.length) {
    process.stderr.write(`\nFailures:\n- ${failures.join("\n- ")}\n`);
    process.exit(1);
}
