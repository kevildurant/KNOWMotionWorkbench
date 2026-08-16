# 验证记录

验证日期：2026-08-16

## 自动静态检测

命令：`npm test`

结果：`68/68 checks passed`

覆盖内容：

- CEP `manifest.xml` 的扩展 ID、AEFT 主机范围、CEP 11 运行时与入口路径。
- HTML、CSS、前端脚本与 ExtendScript 文件完整性。
- 12 个工具目录 ID 与 12 个宿主动作一一对应。
- ExtendScript 未使用 `let`、`const`、箭头函数、Class、Promise 或模板字符串。
- 宿主动作包含 Undo Group，且没有自动保存或删除工程项的调用。
- 前端与宿主 JavaScript 语法检查。
- `.ffx` 大小写扩展名递归扫描、完整目录树、`folder.json` 元数据和刷新后的失效路径记录。
- 六张 WebP 缩略图、一段 MP4 动态预览、同名媒体自动匹配优先级、收藏/最近使用字段和 `applyPreset()` 宿主映射。
- PNG/WebP/JPG/GIF、MP4/WebM/MOV、JSX/JSXBIN、AEP/AET 与 MOGRT 资源卡索引；已与预设绑定的预览媒体不会重复生成资源卡。
- V1.1/V1.2 索引自动迁移到 schema 3：保留收藏、最近使用、目录和资源，并补齐真实预览缓存字段。
- 卡片显式标注“手动缩略图 / 同名媒体 / 目录封面 / 资源自身 / 原创演示 / 原创占位”，避免将占位图误认为真实 FFX 效果。
- 宿主只调用一次 `layers[0].applyPreset()`，由 AE 原生语义处理全部选中图层，避免多选时重复叠加。
- 真实预览链路：650ms 悬停延迟、手动生成按钮、单任务互斥、AE 调用前 FFmpeg 预检、H.264/yuv420p/faststart 编码和 `.part.mp4` 原子写入。
- AE 临时渲染隔离：已有渲染队列项先记录/停用，结束后恢复；输出模块只接受 AVI、QuickTime 或 MP4 单文件格式；每个任务使用独立暂存目录并在成功/失败后整目录清理。
- FFX 修改时间变化后生成缓存失效并删除；缓存注册仅接受 `%APPDATA%\KNOWMotionWorkbench\preview-cache` 内的 MP4。

## 浏览器渲染检测

- `430 × 700`：双列卡片，12 张工具卡，无横向溢出。
- `300 × 600`：单列卡片，保留“图层/属性”两项上下文计数，无横向溢出。
- 参数抽屉：默认值、收藏按钮、执行按钮和安全演示结果正常。
- 搜索：关键词“重命名”正确筛选为 1 个结果。
- 控制台：没有 warning 或 error。
- `430 × 700` 资源页：8 张演示卡、完整文件夹树、三项目录操作和资源详情抽屉无横向溢出；图片均加载成功。
- `300 × 600` 资源页：卡片切为单列，目录层级与名称未截断，页面宽度与视口均为 300px。
- 目录筛选：选择“水系魔法”后由 8 张卡正确筛选为 3 张。
- 资源抽屉：WebP 资源显示“仅供浏览”，不会误调用 `applyPreset()`。
- 动态预览：MP4 卡片悬停约 0.9 秒后仍在播放，移出后暂停并将播放头归零。
- V1.3 修复后复测：真实鼠标悬停后 MP4 `currentTime=0.923s` 且 `paused=false`；移出后 `currentTime=0` 且 `paused=true`。
- `430 × 700`：设置面板完整位于视口内，明确显示浏览器演示模式中的 FFmpeg 探测边界；页面宽度 430px，无溢出。
- `300 × 600`：单列 192px 卡片、页面宽度 300px，无横向溢出且目录名称无裁切。
- 预设搜索：“森雾”筛选为 1 张卡；收藏后侧栏计数从 0 更新为 1。
- 次要文字最低对比度：`#8b9090` 在 `#171a1d` 上为 `5.40:1`。

截图位于项目工作区：

- `.impeccable/review/desktop.png`
- `.impeccable/review/mobile.png`
- `.impeccable/review/drawer.png`
- `.impeccable/review/presets-430x700.png`
- `.impeccable/review/presets-300x600.png`
- `.impeccable/review/preset-drawer-430x700.png`
- `.impeccable/review/resource-library-430x700.png`
- `.impeccable/review/resource-drawer-430x700.png`
- `.impeccable/review/resource-library-video-430x700.png`
- `.impeccable/review/preset-real-preview-v1.3.png`
- `.impeccable/review/preset-real-preview-v1.3-430.png`
- `.impeccable/review/preset-real-preview-v1.3-300.png`
- `.impeccable/review/ae-preview-real-smoke.png`

真实 AE 预览证据：

- `.impeccable/review/ae-preview-real-smoke.mp4`
- `.impeccable/review/ae-smoke-result.json`
- `.impeccable/review/ae-output-templates.json`

## 本机目录只读验证

检测到 `C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\Presets`，递归统计为 `742` 个 `.ffx`。这证明默认目录发现规则与本机安装布局一致；面板首次打开时会在后台建立索引。

## 本机 After Effects 2025 实机验证

通过 AE 菜单实际运行最新 `host.jsx` 与一份官方文字动画 FFX，测试工程中预先放置 1 个已排队项目。结果：

- AE 使用本机“无损”模板输出 AVI 单文件，`20,744,400` 字节，`640×360`、24fps、1.25 秒。
- `applyPreset()`、`renderQueue.render()` 和 Output Module 模板枚举均在 AE 2025 中实际执行成功。
- 测试前后渲染队列均为 1 项；已有项目的 `render=true` 已恢复，状态保持排队，未被预览任务渲染。
- `host.jsx` 调用前后工程项目项数量一致，`tempItemsRemaining=0`，没有 KNOW 临时合成、固态源或渲染项残留。
- 本机中文 AE 的 `getSetting("Format")` 返回数字代码；已据实机数据改用 `getSettings(GetSettingsFormat.STRING)["Format"]`，并验证“无损”模板得到 `AVI`。
- 使用面板相同 FFmpeg 参数编码得到 H.264/yuv420p MP4，`83,181` 字节、`640×360`、1.25 秒；编码后暂存目录数量为 0。
- 浏览器读取 MP4 的 `readyState=4`，自动播放时 `currentTime=0.701s`、`paused=false`，动态画面截图见上方证据。

## 独立视觉复审

V1.1 第一次结论：`fix`。修正了次要文字对比度、卡片非颜色就绪状态和 300px 图层计数后，最终结论为 `ship`。

V1.2 首轮复审发现旧索引迁移和占位图来源标识不足；修正 schema 1 根目录回填/同步重扫、六类预览来源标签与真实视频 poster 后，再次复审结论为 `ship`。

V1.3 独立复审两次指出并推动修正：先于 AE 的 FFmpeg 预检、单文件模板验证、独立暂存目录清理，以及强制 `PostRenderAction.NONE`。真实 AE 冒烟验证随后发现中文 AE 格式设置返回数字代码，已改用 STRING 设置表并实机通过。最终结论为 `ship`。

## V1.3.1 统一视频底片

- 用户提供的 `XW-和栗薰子-6.mp4` 已规范化为内置 `assets/preview-source/waguri-kaoruko-preview.mp4`：H.264/yuv420p、640×360、24fps、2.5 秒、无音频，文件大小 `261,205` 字节。
- 来源与变换参数写入相邻 JSON；原文件 SHA-256 为 `38E47DDE440EE401F53718A72899954222FFBBC10F85602D7A9417B7FB772155`，内置副本 SHA-256 为 `F1A5C9DD557169EFA2F491934A4C76B69211915464FF46C778FBF00AF8E1C752`。
- 真实预览在调用 AE 前同时验证 FFmpeg 和内置底片；底片缺失时不会启动渲染。宿主导入底片并只选中该视频层调用一次 `applyPreset()`，最终删除导入素材、临时合成、渲染项和临时文件夹。
- 缓存记录加入 `waguri-kaoruko-v1` 配置标识。旧文字场景缓存、底片配置不匹配缓存及 FFX 修改前缓存均会失效并重建。
- 静态与数据流检测更新为 `72/72` 通过；规范化视频经 `ffprobe` 验证参数与时长正确。
- 尝试启动 After Effects 2025 进行 V1.3.1 实机复测时出现“系统兼容性报告”。由于继续处理该警告需要用户明确确认，本轮没有绕过警告；V1.3 已完成的真实队列、输出模块和清理验证仍保留在上节。

## 尚未覆盖的检测

以下内容仍需安装扩展后完成：

- CEP 未签名扩展在本机 AE 版本中的加载。
- V1.3.1 和栗薰子底片在通过本机 AE 兼容性提示后的完整实渲。
- `CSInterface.evalScript` 到 `host.jsx` 的实际通信。
- 除预览渲染与 FFX 应用外，其余 12 个工具动作对真实 AE 图层、属性和关键帧的逐项执行。

实机步骤见 `INSTALL_CN.md`。首次安装后建议优先测试“弹性回弹”、递归扫描、为卡片指定缩略图、应用 `.ffx` 和一次撤销。
