# AE 资源工作台

After Effects CEP 面板，用于浏览本地素材、导入工程、预览文件，并搜索和应用效果名称。

## 安装

优先双击 `release/AE资源工作台安装.exe`。安装包内置 `data/effects-library.json`，包含 951 条效果资料和 13 个分类。安装完成后完全退出并重新打开 After Effects，再从“窗口 → 扩展”打开面板。

也可以在 PowerShell 运行 `install.ps1`。面板需要 CEP 调试模式，安装脚本会设置当前用户的 `PlayerDebugMode`。

## 开发验证

```powershell
node test/core.test.js
node test/nodeapi.test.js
node test/dom.smoke.test.js
```

当前测试结果为 36 项逻辑、15 项 Node、18 项面板启动测试全部通过。

