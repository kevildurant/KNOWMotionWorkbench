/* KNOW Motion Workbench - After Effects host bridge (ExtendScript ES3) */
var KnowHost = (function () {
    var SCRIPT_NAME = "KNOW Motion Workbench";

    function quote(value) {
        return '"' + String(value)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .replace(/\t/g, "\\t") + '"';
    }

    function stringify(value) {
        var type = typeof value;
        var parts;
        var key;
        var i;
        if (value === null || typeof value === "undefined") { return "null"; }
        if (type === "string") { return quote(value); }
        if (type === "number") { return isFinite(value) ? String(value) : "null"; }
        if (type === "boolean") { return value ? "true" : "false"; }
        if (value instanceof Array) {
            parts = [];
            for (i = 0; i < value.length; i += 1) { parts.push(stringify(value[i])); }
            return "[" + parts.join(",") + "]";
        }
        parts = [];
        for (key in value) {
            if (value.hasOwnProperty(key) && typeof value[key] !== "function") {
                parts.push(quote(key) + ":" + stringify(value[key]));
            }
        }
        return "{" + parts.join(",") + "}";
    }

    function ok(message, affected, detail) {
        return { ok: true, message: message, affected: affected || 0, detail: detail || "" };
    }

    function fail(message, detail) {
        return { ok: false, message: message, affected: 0, detail: detail || "" };
    }

    function numberValue(value, fallback, minimum, maximum) {
        var result = Number(value);
        if (isNaN(result)) { result = fallback; }
        if (typeof minimum === "number" && result < minimum) { result = minimum; }
        if (typeof maximum === "number" && result > maximum) { result = maximum; }
        return result;
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function activeComp() {
        var item = app.project ? app.project.activeItem : null;
        return item && item instanceof CompItem ? item : null;
    }

    function leafSelectedProperties(comp) {
        var output = [];
        var layers = comp ? comp.selectedLayers : [];
        var properties;
        var i;
        var j;
        var prop;
        for (i = 0; i < layers.length; i += 1) {
            properties = layers[i].selectedProperties;
            for (j = 0; j < properties.length; j += 1) {
                prop = properties[j];
                try {
                    if (prop.propertyType === PropertyType.PROPERTY) { output.push(prop); }
                } catch (ignore) {}
            }
        }
        return output;
    }

    function contextObject() {
        var comp = activeComp();
        var props;
        var keyed = 0;
        var twoKeyed = 0;
        var selectedKeys = 0;
        var i;
        if (!comp) {
            return {
                ok: true,
                host: true,
                noComp: true,
                compName: "",
                selectedLayers: 0,
                selectedProperties: 0,
                selectedKeyedProperties: 0,
                selectedTwoKeyProperties: 0,
                selectedKeys: 0,
                time: 0
            };
        }
        props = leafSelectedProperties(comp);
        for (i = 0; i < props.length; i += 1) {
            try {
                if (props[i].numKeys >= 1) { keyed += 1; }
                if (props[i].numKeys >= 2) { twoKeyed += 1; }
                if (props[i].selectedKeys) { selectedKeys += props[i].selectedKeys.length; }
            } catch (ignore) {}
        }
        return {
            ok: true,
            host: true,
            noComp: false,
            compName: comp.name,
            selectedLayers: comp.selectedLayers.length,
            selectedProperties: props.length,
            selectedKeyedProperties: keyed,
            selectedTwoKeyProperties: twoKeyed,
            selectedKeys: selectedKeys,
            time: comp.time
        };
    }

    function parseParams(encoded) {
        var decoded;
        try {
            decoded = decodeURIComponent(encoded || "%7B%7D");
            return eval("(" + decoded + ")");
        } catch (error) {
            return {};
        }
    }

    function applyExpression(builder, params, minimumKeys) {
        var comp = activeComp();
        var props;
        var applied = 0;
        var skipped = 0;
        var originalCode;
        var originalEnabled;
        var code;
        var i;
        if (!comp) { return fail("请先打开一个活动合成"); }
        props = leafSelectedProperties(comp);
        if (!props.length) { return fail("请在时间轴中选中可应用表达式的属性"); }
        for (i = 0; i < props.length; i += 1) {
            try {
                if (!props[i].canSetExpression || (minimumKeys && props[i].numKeys < minimumKeys)) {
                    skipped += 1;
                    continue;
                }
                originalCode = props[i].expression;
                originalEnabled = props[i].expressionEnabled;
                code = builder(params);
                props[i].expression = code;
                props[i].expressionEnabled = true;
                if (props[i].expressionError && props[i].expressionError !== "") {
                    props[i].expression = originalCode;
                    props[i].expressionEnabled = originalEnabled;
                    skipped += 1;
                } else {
                    applied += 1;
                }
            } catch (error) {
                try {
                    props[i].expression = originalCode;
                    props[i].expressionEnabled = originalEnabled;
                } catch (restoreError) {}
                skipped += 1;
            }
        }
        if (!applied) { return fail("所选属性不兼容，或关键帧数量不足", "跳过 " + skipped + " 个属性"); }
        return ok("已为 " + applied + " 个属性应用表达式" + (skipped ? "，跳过 " + skipped + " 个" : ""), applied);
    }

    function elasticCode(params) {
        var amplitude = numberValue(params.amplitude, 0.06, 0);
        var frequency = numberValue(params.frequency, 4, 0.1);
        var decay = numberValue(params.decay, 6, 0.1);
        return [
            "// KNOW / Elastic Bounce",
            "amp=" + amplitude + "; freq=" + frequency + "; decay=" + decay + ";",
            "n=0;",
            "if(numKeys>0){n=nearestKey(time).index;if(key(n).time>time){n--;}}",
            "if(n>0){",
            "  t=time-key(n).time;",
            "  v=velocityAtTime(key(n).time-thisComp.frameDuration/10);",
            "  value+v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);",
            "}else{value;}"
        ].join("\n");
    }

    function loopCode() {
        return "// KNOW / Loop Cycle\nnumKeys>1 ? loopOut(\"cycle\") : value;";
    }

    function wiggleCode(params) {
        var frequency = numberValue(params.frequency, 2, 0);
        var amplitude = numberValue(params.amplitude, 25, 0);
        return "// KNOW / Wiggle\nwiggle(" + frequency + "," + amplitude + ");";
    }

    function smoothCode(params) {
        var width = numberValue(params.width, 0.2, 0.01);
        var samples = Math.round(numberValue(params.samples, 5, 2, 50));
        return "// KNOW / Smooth Motion\nsmooth(" + width + "," + samples + ");";
    }

    function staggerCode(params) {
        var delay = numberValue(params.delay, 0.08, 0);
        var startIndex = Math.round(numberValue(params.startIndex, 1, 1));
        return "// KNOW / Layer Stagger\nvalueAtTime(time-Math.max(0,thisLayer.index-" + startIndex + ")*" + delay + ");";
    }

    function actionElastic(params) { return applyExpression(elasticCode, params, 1); }
    function actionLoop(params) { return applyExpression(loopCode, params, 2); }
    function actionWiggle(params) { return applyExpression(wiggleCode, params, 0); }
    function actionSmooth(params) { return applyExpression(smoothCode, params, 0); }
    function actionStagger(params) { return applyExpression(staggerCode, params, 0); }

    function actionRemoveExpressions() {
        var comp = activeComp();
        var props;
        var count = 0;
        var i;
        if (!comp) { return fail("请先打开一个活动合成"); }
        props = leafSelectedProperties(comp);
        if (!props.length) { return fail("请选中包含表达式的属性"); }
        for (i = 0; i < props.length; i += 1) {
            try {
                if (props[i].canSetExpression && props[i].expression !== "") {
                    props[i].expression = "";
                    count += 1;
                }
            } catch (ignore) {}
        }
        if (!count) { return fail("所选属性没有可移除的表达式"); }
        return ok("已移除 " + count + " 个表达式，关键帧保持不变", count);
    }

    function easeDimensions(prop) {
        var type = prop.propertyValueType;
        if (type === PropertyValueType.TwoD_SPATIAL || type === PropertyValueType.ThreeD_SPATIAL) { return 1; }
        if (type === PropertyValueType.TwoD) { return 2; }
        if (type === PropertyValueType.ThreeD) { return 3; }
        if (type === PropertyValueType.COLOR) { return 4; }
        return 1;
    }

    function actionEasyEase(params) {
        var comp = activeComp();
        var props;
        var influence = numberValue(params.influence, 70, 1, 100);
        var count = 0;
        var keys;
        var inEase;
        var outEase;
        var dimensions;
        var i;
        var j;
        var k;
        if (!comp) { return fail("请先打开一个活动合成"); }
        props = leafSelectedProperties(comp);
        for (i = 0; i < props.length; i += 1) {
            try {
                keys = props[i].selectedKeys;
                dimensions = easeDimensions(props[i]);
                for (j = 0; j < keys.length; j += 1) {
                    inEase = [];
                    outEase = [];
                    for (k = 0; k < dimensions; k += 1) {
                        inEase.push(new KeyframeEase(0, influence));
                        outEase.push(new KeyframeEase(0, influence));
                    }
                    props[i].setTemporalEaseAtKey(keys[j], inEase, outEase);
                    count += 1;
                }
            } catch (ignore) {}
        }
        if (!count) { return fail("请在时间轴中选中至少一个可缓动的关键帧"); }
        return ok("已为 " + count + " 个关键帧设置 " + Math.round(influence) + "% 缓动", count);
    }

    function actionSequenceLayers(params) {
        var comp = activeComp();
        var layers;
        var gap;
        var cursor;
        var shift;
        var i;
        if (!comp) { return fail("请先打开一个活动合成"); }
        layers = comp.selectedLayers;
        if (layers.length < 2) { return fail("请至少选中两个图层"); }
        layers.sort(function (a, b) { return a.index - b.index; });
        gap = Math.round(numberValue(params.gapFrames, 0, 0)) * comp.frameDuration;
        cursor = comp.time;
        for (i = 0; i < layers.length; i += 1) {
            shift = cursor - layers[i].inPoint;
            layers[i].startTime += shift;
            cursor = layers[i].outPoint + gap;
        }
        return ok("已从当前时间顺序排列 " + layers.length + " 个图层", layers.length);
    }

    function actionCenterAnchor() {
        var comp = activeComp();
        var layers;
        var layer;
        var rect;
        var anchor;
        var position;
        var scale;
        var rotation;
        var oldAnchor;
        var newAnchor;
        var oldPosition;
        var dx;
        var dy;
        var radians;
        var count = 0;
        var skipped = 0;
        var i;
        if (!comp) { return fail("请先打开一个活动合成"); }
        layers = comp.selectedLayers;
        if (!layers.length) { return fail("请选择文字层或形状层"); }
        for (i = 0; i < layers.length; i += 1) {
            layer = layers[i];
            try {
                if (layer.threeDLayer || !layer.sourceRectAtTime) { skipped += 1; continue; }
                anchor = layer.property("ADBE Transform Group").property("ADBE Anchor Point");
                position = layer.property("ADBE Transform Group").property("ADBE Position");
                scale = layer.property("ADBE Transform Group").property("ADBE Scale").value;
                rotation = layer.property("ADBE Transform Group").property("ADBE Rotate Z").value;
                if (position.dimensionsSeparated || anchor.numKeys > 0 || position.numKeys > 0) { skipped += 1; continue; }
                rect = layer.sourceRectAtTime(comp.time, false);
                oldAnchor = anchor.value;
                oldPosition = position.value;
                newAnchor = [rect.left + rect.width / 2, rect.top + rect.height / 2];
                dx = (newAnchor[0] - oldAnchor[0]) * scale[0] / 100;
                dy = (newAnchor[1] - oldAnchor[1]) * scale[1] / 100;
                radians = rotation * Math.PI / 180;
                anchor.setValue(newAnchor);
                position.setValue([
                    oldPosition[0] + dx * Math.cos(radians) - dy * Math.sin(radians),
                    oldPosition[1] + dx * Math.sin(radians) + dy * Math.cos(radians)
                ]);
                count += 1;
            } catch (error) {
                skipped += 1;
            }
        }
        if (!count) { return fail("没有可处理的二维文字层或形状层"); }
        return ok("已居中 " + count + " 个图层的锚点" + (skipped ? "，跳过 " + skipped + " 个" : ""), count);
    }

    function uniqueLayerName(comp, base) {
        var name = base;
        var suffix = 2;
        var found;
        var i;
        do {
            found = false;
            for (i = 1; i <= comp.numLayers; i += 1) {
                if (comp.layer(i).name === name) { found = true; break; }
            }
            if (found) { name = base + "_" + suffix; suffix += 1; }
        } while (found);
        return name;
    }

    function addSlider(layer, name, value) {
        var effect = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        effect.name = name;
        effect.property(1).setValue(value);
    }

    function actionCreateController() {
        var comp = activeComp();
        var layer;
        if (!comp) { return fail("请先打开一个活动合成"); }
        layer = comp.layers.addNull(comp.duration);
        layer.name = uniqueLayerName(comp, "KNOW_CONTROL");
        layer.label = 9;
        layer.guideLayer = true;
        layer.inPoint = comp.displayStartTime;
        layer.outPoint = comp.displayStartTime + comp.duration;
        addSlider(layer, "Amplitude", 25);
        addSlider(layer, "Frequency", 2);
        addSlider(layer, "Delay Frames", 3);
        layer.selected = true;
        return ok("已创建控制器 “" + layer.name + "” 和 3 个滑块", 1);
    }

    function pad(value) {
        return value < 10 ? "0" + value : String(value);
    }

    function actionRenameLayers(params) {
        var comp = activeComp();
        var layers;
        var prefix = trim(params.prefix || "MOTION");
        var i;
        if (!comp) { return fail("请先打开一个活动合成"); }
        layers = comp.selectedLayers;
        if (!layers.length) { return fail("请至少选中一个图层"); }
        if (!prefix) { return fail("名称前缀不能为空"); }
        layers.sort(function (a, b) { return a.index - b.index; });
        for (i = 0; i < layers.length; i += 1) {
            layers[i].name = prefix + "_" + pad(i + 1) + "_" + layers[i].name;
        }
        return ok("已重命名 " + layers.length + " 个图层", layers.length);
    }

    function actionAddMarkers(params) {
        var comp = activeComp();
        var layers;
        var comment = trim(params.comment || "KNOW Cue");
        var marker;
        var markerProp;
        var count = 0;
        var i;
        if (!comp) { return fail("请先打开一个活动合成"); }
        layers = comp.selectedLayers;
        if (!layers.length) { return fail("请至少选中一个图层"); }
        for (i = 0; i < layers.length; i += 1) {
            try {
                marker = new MarkerValue(comment || "KNOW Cue");
                markerProp = layers[i].property("ADBE Marker");
                markerProp.setValueAtTime(comp.time, marker);
                count += 1;
            } catch (ignore) {}
        }
        if (!count) { return fail("无法在所选图层写入标记"); }
        return ok("已在当前时间为 " + count + " 个图层添加标记", count);
    }

    function actionApplyPreset(params) {
        var comp = activeComp();
        var presetPath = trim(params.path || "");
        var presetFile;
        var layers;
        if (!comp) { return fail("请先打开一个活动合成"); }
        if (!presetPath) { return fail("预设路径为空"); }
        presetFile = new File(presetPath);
        if (!presetFile.exists) { return fail("预设文件路径已失效", presetPath); }
        if (String(presetFile.name).toLowerCase().slice(-4) !== ".ffx") { return fail("仅支持 .ffx 预设文件"); }
        layers = comp.selectedLayers;
        if (!layers.length) { return fail("请在当前合成中至少选择一个图层"); }
        try {
            /* AE applies a preset to every selected layer in the containing comp. */
            layers[0].applyPreset(presetFile);
        } catch (error) {
            return fail("预设无法应用到所选图层", error.toString());
        }
        return ok("已将预设应用到 " + layers.length + " 个选中图层", layers.length);
    }

    function singleFileFormat(formatName) {
        var value = String(formatName || "").toLowerCase();
        if (value.indexOf("avi") !== -1) { return { format: String(formatName), extension: ".avi" }; }
        if (value.indexOf("quicktime") !== -1 || value.indexOf("quick time") !== -1) { return { format: String(formatName), extension: ".mov" }; }
        if (value.indexOf("h.264") !== -1 || value.indexOf("h264") !== -1 || value.indexOf("mpeg-4") !== -1 || value.indexOf("mpeg4") !== -1) { return { format: String(formatName), extension: ".mp4" }; }
        return null;
    }

    function selectSingleFileOutput(outputModule) {
        var templates = outputModule.templates || [];
        var ordered = [];
        var templateName;
        var lowerName;
        var format;
        var settings;
        var videoOutput;
        var match;
        var i;
        for (i = 0; i < templates.length; i += 1) {
            templateName = String(templates[i]);
            lowerName = templateName.toLowerCase();
            if (lowerName.indexOf("lossless") !== -1 || lowerName.indexOf("无损") !== -1 || lowerName.indexOf("quicktime") !== -1 || lowerName.indexOf("avi") !== -1) {
                ordered.unshift(templateName);
            } else {
                ordered.push(templateName);
            }
        }
        for (i = 0; i < ordered.length; i += 1) {
            try {
                outputModule.applyTemplate(ordered[i]);
                settings = outputModule.getSettings(GetSettingsFormat.STRING);
                format = settings && settings["Format"] ? settings["Format"] : outputModule.getSetting("Format");
                videoOutput = settings && settings["Video Output"] !== undefined ? String(settings["Video Output"]).toLowerCase() : "true";
                match = singleFileFormat(format);
                if (match && videoOutput === "true") {
                    match.template = ordered[i];
                    return match;
                }
            } catch (ignoreTemplate) {}
        }
        return null;
    }

    function actionRenderPresetPreview(params) {
        var presetPath = trim(params.path || "");
        var rawBasePath = trim(params.rawBasePath || "");
        var sourcePath = trim(params.sourcePath || "");
        var width = Math.round(numberValue(params.width, 640, 320, 1280));
        var height = Math.round(numberValue(params.height, 360, 180, 720));
        var duration = numberValue(params.duration, 2.5, 1, 5);
        var fps = numberValue(params.fps, 24, 12, 30);
        var presetFile;
        var sourceFile = null;
        var sourceImportOptions = null;
        var sourceItem = null;
        var sourceScale = 100;
        var sourceMode = "fallback-text";
        var tempFolder = null;
        var comp = null;
        var backgroundSource = null;
        var plateSource = null;
        var background;
        var plate;
        var target;
        var textProperty;
        var textDocument;
        var textRect;
        var renderQueue = app.project ? app.project.renderQueue : null;
        var priorQueue = [];
        var renderItem = null;
        var outputModule;
        var singleFileOutput;
        var rawFile = null;
        var suppressing = false;
        var result;
        var item;
        var i;
        if (!app.project || !renderQueue) { return fail("AE 工程尚未就绪"); }
        if (renderQueue.rendering) { return fail("AE 渲染队列正在工作，请稍后再生成预览"); }
        if (!presetPath || !rawBasePath) { return fail("真实预览参数不完整"); }
        presetFile = new File(presetPath);
        if (!presetFile.exists || String(presetFile.name).toLowerCase().slice(-4) !== ".ffx") { return fail("预设文件路径无效", presetPath); }
        try {
            app.beginSuppressDialogs();
            suppressing = true;
            for (i = 1; i <= renderQueue.numItems; i += 1) {
                item = renderQueue.item(i);
                priorQueue.push({ item: item, render: item.render });
                try { item.render = false; } catch (ignoreDisable) {}
            }
            tempFolder = app.project.items.addFolder("[KNOW Preview Temp " + String(new Date().getTime()) + "]");
            comp = app.project.items.addComp("KNOW_PREVIEW_" + String(new Date().getTime()), width, height, 1, duration, fps);
            comp.parentFolder = tempFolder;
            comp.bgColor = [0.025, 0.035, 0.05];
            comp.motionBlur = true;
            sourceFile = sourcePath ? new File(sourcePath) : null;
            if (sourceFile && sourceFile.exists) {
                sourceImportOptions = new ImportOptions(sourceFile);
                if (sourceImportOptions.canImportAs(ImportAsType.FOOTAGE)) { sourceImportOptions.importAs = ImportAsType.FOOTAGE; }
                sourceItem = app.project.importFile(sourceImportOptions);
                sourceItem.parentFolder = tempFolder;
                target = comp.layers.add(sourceItem);
                target.name = "KNOW PREVIEW VIDEO TARGET";
                target.startTime = 0;
                target.inPoint = 0;
                target.outPoint = duration;
                sourceScale = Math.max(width / sourceItem.width, height / sourceItem.height) * 100;
                target.property("ADBE Transform Group").property("ADBE Scale").setValue([sourceScale, sourceScale]);
                target.property("ADBE Transform Group").property("ADBE Position").setValue([width / 2, height / 2]);
                sourceMode = "waguri-kaoruko-video";
            } else {
                background = comp.layers.addSolid([0.025, 0.035, 0.05], "KNOW PREVIEW BACKGROUND", width, height, 1, duration);
                backgroundSource = background.source;
                backgroundSource.parentFolder = tempFolder;
                plate = comp.layers.addSolid([0.05, 0.24, 0.3], "KNOW PREVIEW PLATE", Math.round(width * 0.72), Math.round(height * 0.5), 1, duration);
                plateSource = plate.source;
                plateSource.parentFolder = tempFolder;
                plate.property("ADBE Transform Group").property("ADBE Opacity").setValue(34);
                plate.property("ADBE Transform Group").property("ADBE Position").setValue([width / 2, height / 2]);
                target = comp.layers.addText("KNOW\rMOTION");
                target.name = "KNOW PREVIEW FALLBACK TARGET";
                textProperty = target.property("ADBE Text Properties").property("ADBE Text Document");
                textDocument = textProperty.value;
                textDocument.fontSize = Math.round(height * 0.19);
                textDocument.applyFill = true;
                textDocument.fillColor = [0.88, 0.94, 0.98];
                textDocument.applyStroke = false;
                textDocument.justification = ParagraphJustification.CENTER_JUSTIFY;
                textProperty.setValue(textDocument);
                textRect = target.sourceRectAtTime(0, false);
                target.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([textRect.left + textRect.width / 2, textRect.top + textRect.height / 2]);
                target.property("ADBE Transform Group").property("ADBE Position").setValue([width / 2, height / 2]);
            }
            for (i = 1; i <= comp.numLayers; i += 1) { comp.layer(i).selected = false; }
            target.selected = true;
            target.applyPreset(presetFile);
            renderItem = renderQueue.items.add(comp);
            renderItem.timeSpanStart = 0;
            renderItem.timeSpanDuration = duration;
            outputModule = renderItem.outputModule(1);
            singleFileOutput = selectSingleFileOutput(outputModule);
            if (!singleFileOutput) { throw new Error("没有可用的 AVI、QuickTime 或 MP4 单文件输出模板"); }
            outputModule.postRenderAction = PostRenderAction.NONE;
            rawFile = new File(rawBasePath + singleFileOutput.extension);
            if (rawFile.exists) { try { rawFile.remove(); } catch (ignoreOldRaw) {} }
            outputModule.file = rawFile;
            renderItem.render = true;
            renderQueue.render();
            if (!rawFile.exists || rawFile.length < 1) { result = fail("AE 未输出可编码的预览文件"); }
            else { result = ok("AE 临时预览已渲染", 1, { rawPath: rawFile.fsName, bytes: rawFile.length, duration: duration, fps: fps, sourceMode: sourceMode, sourcePath: sourceFile && sourceFile.exists ? sourceFile.fsName : "", outputFormat: singleFileOutput.format, outputTemplate: singleFileOutput.template }); }
        } catch (error) {
            result = fail("真实预览渲染失败", error.toString());
        } finally {
            if ((!result || !result.ok) && rawFile && rawFile.exists) {
                try { rawFile.remove(); } catch (ignorePartialRaw) {}
            }
            try { if (renderItem) { renderItem.remove(); } } catch (ignoreRenderItem) {}
            for (i = 0; i < priorQueue.length; i += 1) {
                try { priorQueue[i].item.render = priorQueue[i].render; } catch (ignoreRestore) {}
            }
            try { if (comp) { comp.remove(); } } catch (ignoreComp) {}
            try { if (sourceItem) { sourceItem.remove(); } } catch (ignoreSourceItem) {}
            try { if (backgroundSource) { backgroundSource.remove(); } } catch (ignoreBackground) {}
            try { if (plateSource) { plateSource.remove(); } } catch (ignorePlate) {}
            try { if (tempFolder) { tempFolder.remove(); } } catch (ignoreFolder) {}
            if (suppressing) { try { app.endSuppressDialogs(false); } catch (ignoreDialogs) {} }
        }
        return result || fail("真实预览渲染未完成");
    }

    var handlers = {
        elasticBounce: actionElastic,
        loopCycle: actionLoop,
        wiggle: actionWiggle,
        smoothMotion: actionSmooth,
        staggerExpression: actionStagger,
        removeExpressions: actionRemoveExpressions,
        easyEaseKeys: actionEasyEase,
        sequenceLayers: actionSequenceLayers,
        centerAnchor: actionCenterAnchor,
        createController: actionCreateController,
        renameLayers: actionRenameLayers,
        addTimeMarkers: actionAddMarkers,
        applyPreset: actionApplyPreset,
        renderPresetPreview: actionRenderPresetPreview
    };

    function getContext() {
        try {
            return stringify(contextObject());
        } catch (error) {
            return stringify(fail("读取 AE 状态失败", error.toString()));
        }
    }

    function execute(actionId, encodedParams) {
        var action = handlers[actionId];
        var result;
        var undoOpen = false;
        if (!action) { return stringify(fail("未知工具：" + actionId)); }
        try {
            if (actionId !== "renderPresetPreview") {
                app.beginUndoGroup(SCRIPT_NAME + " - " + actionId);
                undoOpen = true;
            }
            result = action(parseParams(encodedParams));
        } catch (error) {
            result = fail("执行失败，请检查当前选择", error.toString());
        } finally {
            if (undoOpen) {
                try { app.endUndoGroup(); } catch (ignore) {}
            }
        }
        return stringify(result);
    }

    return {
        getContext: getContext,
        execute: execute
    };
}());
