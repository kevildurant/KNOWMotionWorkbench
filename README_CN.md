<p align="center">
  <a href="README.md">English</a> · <strong>中文</strong>
</p>

<h1 align="center">KNOW Motion Workbench</h1>

<p align="center">
  可停靠在 <b>After Effects</b> 中的 CEP 可视化工具箱，带递归效果库索引和
  <b>AE 实渲悬停预览</b>——由 After Effects 亲自渲染真实的 <code>.ffx</code> 效果并缓存为 MP4。
</p>

<p align="center">
  <a href="https://github.com/kevildurant/KNOWMotionWorkbench/releases">
    <img src="https://img.shields.io/github/v/release/kevildurant/KNOWMotionWorkbench?style=flat-square&color=blue" alt="Latest release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/kevildurant/KNOWMotionWorkbench?style=flat-square" alt="License: MIT">
  </a>
  <a href="https://github.com/kevildurant/KNOWMotionWorkbench/releases">
    <img src="https://img.shields.io/github/downloads/kevildurant/KNOWMotionWorkbench/total?style=flat-square" alt="Downloads">
  </a>
  <img src="https://img.shields.io/badge/After%20Effects-2025-brightgreen?style=flat-square" alt="After Effects 2025">
  <img src="https://img.shields.io/badge/CEP-11%2B-9cf?style=flat-square" alt="CEP 11+">
  <img src="https://img.shields.io/badge/FFmpeg-required-orange?style=flat-square" alt="FFmpeg required">
</p>

---

## 项目简介

**KNOW Motion Workbench** 是一个 After Effects 扩展面板，把散落各处的预设库整理成可浏览、可搜索、**可预览**的工具箱。

V1.3.1 包含 **12 个可执行工具**和完整效果资源库。它递归保留 AE 官方、用户及自选目录的文件夹层级，自动按 `.ffx` 文件名生成效果卡，并将同名 PNG/WebP/JPG/GIF/MP4/WebM/MOV 绑定为静态或动态预览。

最大亮点：没有视频的真实 FFX 会**真实生成**预览。悬停卡片 650ms 后，面板把预设应用到内置 640×360 视频底片上，交给 AE 渲染，再用 FFmpeg 编码成 H.264 MP4 并原子化缓存。没有伪造缩略图——你看到的就是 AE 亲自渲染的真实效果。

未绑定的图片、视频、脚本、AE 工程和 MOGRT 会作为只读资源卡显示。

## 界面截图

<p align="center">
  <img src="assets/screenshots/presets.png" width="150" alt="效果卡网格">
  <img src="assets/screenshots/hover-preview.png" width="150" alt="AE 实渲悬停预览">
  <img src="assets/screenshots/resource-library.png" width="150" alt="资源库">
  <img src="assets/screenshots/drawer.png" width="150" alt="预设详情抽屉">
  <img src="assets/screenshots/narrow.png" width="132" alt="窄屏单列布局">
</p>

*从左到右：效果卡网格 · 真实 AE 实渲悬停预览 · 资源库 · 预设详情抽屉 · 窄屏自适应布局。*

## 功能特性

- **12 个 AE 工具动作**——每个都包裹在 Undo Group 中，任何操作一次 `Ctrl+Z` 即可撤销。
- **递归效果库索引**——保留 AE 官方、用户和自选目录的完整文件夹层级；支持 `folder.json` 元数据（`name`、`cover`、`category`、`order`）。
- **真实 FFX 悬停预览**——首次悬停（650ms）把预设应用到内置视频底片、经 AE 实渲并编码为可缓存的 MP4；已有视频预览时直接播放，不重复渲染。
- **同名媒体自动绑定**——同目录下 `水波纹.ffx` + `水波纹.mp4` 自动配对；视频优先于静态图片。
- **诚实的预览来源标注**——每张卡都标明真实来源（同名媒体、手动缩略图、目录封面、资源自身、原创演示或原创占位），绝不把占位图伪装成真实效果。
- **资源库**——图片、视频、JSX/JSXBIN、AEP/AET 和 MOGRT 作为只读资源卡显示，绝不会被误执行。
- **安全设计**——执行前验证活动合成/选中图层；不删除图层、不保存/关闭工程、不使用网络。
- **平滑升级**——V1.1/V1.2 索引自动迁移，无需重新添加效果库。

## 环境要求

| 依赖 | 用途 | 说明 |
|---|---|---|
| **After Effects** | 宿主程序 | 已在 AE 2025 上验证 |
| **CEP 11+ 运行时** | 扩展宿主 | 新版 AE 自带 |
| **FFmpeg** | 把 AE 输出编码为 MP4 | 仅自动生成悬停预览时需要。自动从 `PATH`、`FFMPEG_PATH`、WinGet 安装目录或 `%ProgramFiles%\ffmpeg\bin\` 检测 |

面板**不需要联网**——扫描、渲染、缓存全部在本地完成。

## 安装

> 完整中文安装与检测指南见 [`docs/INSTALL_CN.md`](docs/INSTALL_CN.md)。Release 下载请到[发布页](https://github.com/kevildurant/KNOWMotionWorkbench/releases)获取 `KNOWMotionWorkbench_vX.Y.Z.zip`。

1. **下载并解压**[发布页](https://github.com/kevildurant/KNOWMotionWorkbench/releases)的安装包。
2. **复制** `KNOWMotionWorkbench` 文件夹到 CEP 扩展目录：

   ```
   C:\Users\你的用户名\AppData\Roaming\Adobe\CEP\extensions\
   ```

3. **启用未签名扩展**（开发模式，`PlayerDebugMode` 设置见 `docs/INSTALL_CN.md`），重启 After Effects。
4. 通过 **窗口 → 扩展（旧版）→ KNOW Motion Workbench** 打开面板。
5. 在 **After Effects → 首选项 → 脚本和表达式** 中启用 *"允许脚本写入文件和访问网络"*，以便面板读取本地目录。

## 快速实机检测

1. 新建合成和一个形状层，为**位置**添加两个关键帧并选中该属性。
2. 打开**弹性回弹**工具并执行——位置属性应出现回弹表达式，可播放且能一次 `Ctrl+Z` 撤销。
3. 切换到**预设**，悬停真实 `.ffx` 卡片至少 650ms，观看真实 AE 实渲预览生成。
4. 扫描一个含子文件夹的效果库，确认完整目录树出现且每个 `.ffx` 生成一张效果卡。
5. 缩窄面板——卡片自动切为单列，无横向溢出。

## 本地开发

在当前目录运行静态检测：

```powershell
npm test
```

该套件校验 CEP 清单、HTML/CSS/JS 完整性、12 个工具动作映射、ExtendScript 宿主的 ES3 兼容性、递归 `.ffx` 扫描、预览缓存规则等（当前 **72/72 通过**）。完整验证记录见 [`docs/VALIDATION.md`](docs/VALIDATION.md)。

直接在浏览器打开 `index.html` 会进入**演示模式**——工具页、目录树、预设卡和资源卡都可浏览，但本地目录对话框和 `applyPreset()` 只在 CEP/After Effects 环境可用。

## 项目结构

```
KNOWMotionWorkbench/
├── CSXS/manifest.xml        # CEP 扩展清单
├── index.html               # 面板界面外壳
├── css/panel.css            # 面板样式
├── js/
│   ├── app.js               # 面板应用逻辑
│   ├── catalog.js           # 工具目录
│   ├── host-bridge.js       # 通往 ExtendScript 宿主的 CSInterface 桥接
│   ├── preset-store.js      # 目录扫描、预设索引与持久化
│   └── preview-renderer.js  # AE 实渲任务、FFmpeg 探测、MP4 缓存
├── jsx/host.jsx             # After Effects ExtendScript 功能层
├── assets/
│   ├── preset-previews/     # 原创洛琪希主题预览图 + 动态演示
│   ├── preview-source/      # 内置 AE 实渲视频底片
│   └── screenshots/         # README 截图
├── docs/
│   ├── INSTALL_CN.md        # 安装与验证指南
│   └── VALIDATION.md        # 验证记录
└── tests/static-check.mjs   # 静态检测套件
```

## 安全约束

- 执行前验证活动合成、选中图层或选中属性。
- 每次操作使用一个 **Undo Group**，可一次撤销。
- 不删除图层，不保存或关闭工程，不使用网络。
- 表达式工具可能替换所选属性上的现有表达式，但不会删除关键帧。
- `.ffx` 文件不会被复制或改写；索引仅保存路径、收藏、最近使用和缩略图映射。
- 实渲使用临时合成和渲染队列项，事后完整清理；你原有的渲染队列会恢复原状。
- MP4 缓存位于 `%APPDATA%\KNOWMotionWorkbench\preview-cache`，源 `.ffx` 变化后自动失效。

## 已知边界

- 未签名 CEP 扩展需要开发模式（或签名后）才能加载。
- "内容居中锚点"仅处理未分离位置、且位置与锚点没有关键帧的二维文字层和形状层；复杂父级、3D 或关键帧场景会安全跳过。
- 浏览器演示模式只验证界面，不等同于 AE 宿主实机测试。
- 部分预设（文字、摄像机、音频、第三方插件、特定图层类型或多图层结构）可能无法生成有代表性的预览；此类请提供同名视频。

## 参与贡献

欢迎提交 Bug 报告、功能建议和 Pull Request。提交 PR 前请确保本地 `npm test` 通过。

## 许可证

[MIT](LICENSE) © 2026 kevildurant
