# KNOW Motion Workbench

KNOW Motion Workbench 是一个可停靠在 After Effects 中的 CEP 可视化工具箱。V1.3.1 包含 12 个可执行工具和完整效果资源库：递归保留 AE 官方、用户及自选目录的文件夹层级，自动按 `.ffx` 文件名生成效果卡，并将同名 PNG/WebP/JPG/GIF/MP4/WebM/MOV 绑定为静态或动态预览。没有视频的真实 FFX 在首次悬停 650ms 后，会统一把预设应用到内置的和栗薰子视频底片，交由 AE 渲染并经 FFmpeg 编码成缓存 MP4；未绑定的图片、视频、脚本、AE 工程和 MOGRT 也会作为资源卡显示。

## 目录

- `CSXS/manifest.xml`：CEP 扩展清单。
- `index.html`、`css/`、`js/`：面板界面与交互。
- `js/preset-store.js`：本地目录扫描、预设索引和持久化。
- `js/preview-renderer.js`：AE 实渲任务、FFmpeg 探测、MP4 原子缓存和生成状态。
- `assets/preset-previews/`：六张原创洛琪希主题预览图、一段动态示例及来源记录。
- `assets/preview-source/`：用户指定的和栗薰子统一 AE 实渲底片及来源记录。
- `jsx/host.jsx`：After Effects ExtendScript 功能层。
- `docs/INSTALL_CN.md`：安装与验证说明。
- `tests/static-check.mjs`：清单、目录、动作映射和 ES3 静态检测。

## 本地检测

在当前目录运行：

```powershell
npm test
```

直接在浏览器打开 `index.html` 时会进入演示模式，可检查工具页、目录树、六张预设示例卡和资源卡；本地目录对话框和 `applyPreset()` 只在 CEP/After Effects 环境可用。

## 安全约束

- 执行前验证活动合成、选中图层或选中属性。
- 每次操作使用一个 Undo Group，可一次撤销。
- 不删除图层，不保存或关闭工程，不使用网络。
- 表达式工具可能替换所选属性上的现有表达式，但不会删除关键帧。
- `.ffx` 文件不会被复制或改写；索引仅保存路径、收藏、最近使用和缩略图映射。
- 扫描目录会索引 `.ffx`、PNG/WebP/JPG/GIF、MP4/WebM/MOV、JSX/JSXBIN、AEP/AET 与 MOGRT；原文件均保持在原目录。
- 同目录、同文件名的媒体会自动成为预设预览，例如 `水波纹.ffx + 水波纹.mp4`，其中视频优先于静态图片。
- 每张卡都会标注预览来源（同名媒体、手动缩略图、目录封面、资源自身、原创演示或原创占位），不会把占位图伪装成真实效果。
- 真实 FFX 首次悬停 650ms 后自动生成预览；已存在动态预览时直接播放，不重复渲染。设置中可关闭自动生成，详情抽屉仍可手动生成。
- 实渲先确认 FFmpeg 与内置统一底片可用，再把 `waguri-kaoruko-preview.mp4` 导入临时合成，选中其视频层并调用一次 `applyPreset()`；只接受经验证的 AVI、QuickTime 或 MP4 单文件输出模板，并强制关闭渲染后导入/设为代理动作。开始前停用已有渲染队列项，结束后逐项恢复其原状态并删除导入素材、临时合成和文件夹。不会保存或关闭工程，但 AE 可能将当前工程标记为“已修改”。
- MP4 缓存位于 `%APPDATA%\KNOWMotionWorkbench\preview-cache`。每次 AE 输出进入独立 `.staging` 目录，成功或失败后整目录清理，避免序列帧或部分文件残留。FFX 修改时间或统一底片版本变化后旧缓存自动失效；编码仅用 `execFile()` 调用本地 FFmpeg，不经过 Shell。
- 从 V1.1 升级时会自动迁移旧索引并重扫已有根目录，无需重新添加效果库。
- 可在任意目录放置 `folder.json`，通过 `name`、`cover`、`category`、`order` 定义目录显示名称、封面、分类和顺序。
- 预设应用前会再次验证文件存在和当前选中图层，路径失效时停止执行并记录状态。
