(function () {
    "use strict";

    function isHostAvailable() {
        return !!(window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === "function");
    }

    function parseResult(raw) {
        if (typeof raw !== "string") {
            return { ok: false, message: "宿主未返回有效数据" };
        }
        try {
            return JSON.parse(raw);
        } catch (error) {
            return { ok: false, message: "无法解析 AE 返回结果", detail: raw };
        }
    }

    function evalHost(script, callback) {
        if (!isHostAvailable()) {
            window.setTimeout(function () {
                callback(null);
            }, 180);
            return;
        }
        window.__adobe_cep__.evalScript(script, function (raw) {
            callback(parseResult(raw));
        });
    }

    function mockContext() {
        return {
            ok: true,
            host: false,
            demo: true,
            compName: "浏览器安全演示",
            selectedLayers: 3,
            selectedProperties: 2,
            selectedKeyedProperties: 2,
            selectedTwoKeyProperties: 2,
            selectedKeys: 4,
            time: 2.4
        };
    }

    window.KNOWHostBridge = {
        isHostAvailable: isHostAvailable,

        getContext: function (callback) {
            if (!isHostAvailable()) {
                window.setTimeout(function () {
                    callback(mockContext());
                }, 120);
                return;
            }
            evalHost("KnowHost.getContext()", callback);
        },

        execute: function (actionId, params, callback) {
            var encoded = encodeURIComponent(JSON.stringify(params || {}));
            var safeId = String(actionId).replace(/[^A-Za-z0-9_]/g, "");
            if (!isHostAvailable()) {
                window.setTimeout(function () {
                    callback({
                        ok: true,
                        demo: true,
                        affected: 1,
                        message: "演示完成：界面流程正常，未修改 AE 工程"
                    });
                }, 520);
                return;
            }
            evalHost("KnowHost.execute('" + safeId + "','" + encoded + "')", callback);
        }
    };
}());
