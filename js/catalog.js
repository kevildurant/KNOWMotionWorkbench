(function () {
    "use strict";

    window.KNOW_CATEGORIES = [
        { id: "all", label: "全部工具", icon: "grid" },
        { id: "favorites", label: "收藏", icon: "star" },
        { id: "recent", label: "最近使用", icon: "clock" },
        { id: "expression", label: "表达式", icon: "wave" },
        { id: "animation", label: "动画工具", icon: "keys" },
        { id: "layer", label: "图层工具", icon: "layers" }
    ];

    window.KNOW_CATALOG = [
        {
            id: "elasticBounce",
            title: "弹性回弹",
            caption: "关键帧后的速度回弹",
            category: "expression",
            type: "EXPRESSION",
            description: "读取最近关键帧的进入速度，在原有动画结果上叠加逐渐衰减的弹性运动。不会删除关键帧。",
            requirement: "至少选中 1 个带关键帧、可写表达式的属性",
            requires: "selectedKeyedProperties",
            art: "elastic",
            accent: "#f08a6c",
            art2: "#f2d3a7",
            artBg: "#35201d",
            params: [
                { key: "amplitude", label: "回弹幅度", type: "number", value: 0.06, min: 0, step: 0.01 },
                { key: "frequency", label: "频率", type: "number", value: 4, min: 0.1, step: 0.1 },
                { key: "decay", label: "衰减", type: "number", value: 6, min: 0.1, step: 0.1 }
            ]
        },
        {
            id: "loopCycle",
            title: "完整循环",
            caption: "首尾连续重复关键帧",
            category: "expression",
            type: "EXPRESSION",
            description: "为所选属性写入 Cycle 循环。适用于位置、缩放、旋转、不透明度和大多数可关键帧属性。",
            requirement: "至少选中 1 个包含两个关键帧的属性",
            requires: "selectedTwoKeyProperties",
            art: "loop",
            accent: "#8fcdb9",
            art2: "#c9efe2",
            artBg: "#17302c",
            params: []
        },
        {
            id: "wiggle",
            title: "随机抖动",
            caption: "叠加可控随机运动",
            category: "expression",
            type: "EXPRESSION",
            description: "在当前值或关键帧动画之上叠加随机变化。频率控制每秒变化次数，幅度使用属性自身单位。",
            requirement: "选中 1 个或多个数值型属性",
            requires: "selectedProperties",
            art: "wiggle",
            accent: "#e8bd65",
            art2: "#f4e5af",
            artBg: "#332b17",
            params: [
                { key: "frequency", label: "每秒频率", type: "number", value: 2, min: 0, step: 0.1 },
                { key: "amplitude", label: "抖动幅度", type: "number", value: 25, min: 0, step: 1 }
            ]
        },
        {
            id: "smoothMotion",
            title: "平滑运动",
            caption: "对动画结果进行时间采样",
            category: "expression",
            type: "EXPRESSION",
            description: "使用 AE 的 smooth() 对属性结果做时间窗口采样，降低突变和细小抖动，同时保留原关键帧。",
            requirement: "选中 1 个或多个数值型属性",
            requires: "selectedProperties",
            art: "smooth",
            accent: "#9fb1e8",
            art2: "#e2e7f7",
            artBg: "#20263a",
            params: [
                { key: "width", label: "采样宽度/秒", type: "number", value: 0.2, min: 0.01, step: 0.01 },
                { key: "samples", label: "采样数量", type: "number", value: 5, min: 2, max: 50, step: 1 }
            ]
        },
        {
            id: "staggerExpression",
            title: "图层交错延迟",
            caption: "按图层编号延后动画",
            category: "expression",
            type: "EXPRESSION",
            description: "让每个图层按 index 延后读取同一套关键帧动画，适合批量复制的元素依次入场。",
            requirement: "在多个图层上选中对应的动画属性",
            requires: "selectedProperties",
            art: "stagger",
            accent: "#d9a5c5",
            art2: "#f2d9e8",
            artBg: "#312231",
            params: [
                { key: "delay", label: "每层延迟/秒", type: "number", value: 0.08, min: 0, step: 0.01 },
                { key: "startIndex", label: "起始图层编号", type: "number", value: 1, min: 1, step: 1 }
            ]
        },
        {
            id: "removeExpressions",
            title: "移除表达式",
            caption: "保留关键帧并清空表达式",
            category: "expression",
            type: "SAFE CLEANUP",
            description: "清空所选属性的表达式代码，不删除关键帧，也不会处理没有表达式的属性。",
            requirement: "选中 1 个或多个包含表达式的属性",
            requires: "selectedProperties",
            art: "remove",
            accent: "#e47777",
            art2: "#f4c0ba",
            artBg: "#371c20",
            params: []
        },
        {
            id: "easyEaseKeys",
            title: "关键帧缓动",
            caption: "统一设置选中关键帧影响",
            category: "animation",
            type: "KEYFRAME",
            description: "对时间轴中选中的关键帧应用 Easy Ease，并使用指定影响强度。空间属性会使用单维时间缓动。",
            requirement: "至少选中 1 个关键帧",
            requires: "selectedKeys",
            art: "ease",
            accent: "#78b9d0",
            art2: "#d5edf4",
            artBg: "#19303a",
            params: [
                { key: "influence", label: "缓动影响/%", type: "number", value: 70, min: 1, max: 100, step: 1 }
            ]
        },
        {
            id: "sequenceLayers",
            title: "顺序排列图层",
            caption: "从当前时间依次衔接",
            category: "animation",
            type: "TIMELINE",
            description: "按照时间轴索引顺序移动所选图层，使第一层从当前时间开始，后续图层依次衔接。",
            requirement: "至少选中 2 个图层",
            requires: "selectedMultipleLayers",
            art: "sequence",
            accent: "#d5b778",
            art2: "#f1dfbd",
            artBg: "#302919",
            params: [
                { key: "gapFrames", label: "间隔帧数", type: "number", value: 0, min: 0, step: 1 }
            ]
        },
        {
            id: "centerAnchor",
            title: "内容居中锚点",
            caption: "文字与形状层快速居中",
            category: "layer",
            type: "TRANSFORM",
            description: "根据 sourceRectAtTime 将文字层或形状层的锚点移到内容中心，并对二维位置进行补偿。",
            requirement: "选中 1 个或多个文字层或形状层",
            requires: "selectedLayers",
            art: "anchor",
            accent: "#e5a777",
            art2: "#f6ddc7",
            artBg: "#33251e",
            params: []
        },
        {
            id: "createController",
            title: "创建控制器",
            caption: "空对象与常用表达式控件",
            category: "layer",
            type: "CONTROL",
            description: "在活动合成中创建 KNOW_CONTROL 空对象，并添加幅度、频率和延迟帧三个滑块控件。",
            requirement: "打开一个活动合成",
            requires: "activeComp",
            art: "control",
            accent: "#a9c783",
            art2: "#e4efd4",
            artBg: "#26301f",
            params: []
        },
        {
            id: "renameLayers",
            title: "批量重命名",
            caption: "前缀、序号与原名称",
            category: "layer",
            type: "LAYER",
            description: "按图层索引排序，为所选图层添加统一前缀和两位序号，同时保留原名称便于识别。",
            requirement: "选中 1 个或多个图层",
            requires: "selectedLayers",
            art: "rename",
            accent: "#a99ed6",
            art2: "#e4def5",
            artBg: "#28243a",
            params: [
                { key: "prefix", label: "名称前缀", type: "text", value: "MOTION" }
            ]
        },
        {
            id: "addTimeMarkers",
            title: "当前时间标记",
            caption: "为所选图层写入 Marker",
            category: "layer",
            type: "MARKER",
            description: "在当前合成时间为每个所选图层添加标记，便于记录动画节点、交付检查点或修改备注。",
            requirement: "选中 1 个或多个图层",
            requires: "selectedLayers",
            art: "marker",
            accent: "#db907f",
            art2: "#f2d0c8",
            artBg: "#35221e",
            params: [
                { key: "comment", label: "标记内容", type: "text", value: "KNOW Cue" }
            ]
        }
    ];
}());
