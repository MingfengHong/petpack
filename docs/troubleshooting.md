# 常见问题与排错

## Windows 安装器被 SmartScreen 拦截

社区构建暂未配置商业代码签名。确认文件来自本仓库 Release，并核对 `SHA256SUMS.txt` 后，可以在 SmartScreen 中选择“更多信息”再决定是否运行。

不要从第三方网盘运行文件名相同但哈希不同的安装包。

## macOS 提示应用已损坏或无法验证开发者

先确认下载的架构正确：

- Apple Silicon 使用 `aarch64` DMG；
- Intel Mac 使用 `x64` / `x86_64` DMG。

社区构建使用 ad-hoc 签名，不等同于 Apple Developer ID 公证。优先在 Finder 中按住 Control 点击应用并选择“打开”。如果系统仍然阻止，确认来源和 SHA-256 后再清除下载隔离属性：

```bash
xattr -cr "/Applications/PetPack Studio.app"
```

公开分发者应配置正式签名和公证，而不是要求普通用户长期绕过 Gatekeeper。

## AppImage 双击没有反应

赋予执行权限：

```bash
chmod +x "PetPack Studio_0.3.1_amd64.AppImage"
./"PetPack Studio_0.3.1_amd64.AppImage"
```

部分发行版还需要 FUSE 2。也可以改用 DEB 包。

## 桌宠只显示一部分

0.3.1 已修复 Studio 全局最小尺寸影响桌宠运行时的问题。请确认：

1. 桌宠 EXE/App 与 `petpack.bundle` 来自同一次导出；
2. 没有只复制旧版运行程序；
3. 使用 0.3.1 或更高版本重新打包；
4. 删除旧 ZIP 后再分发新 ZIP。

## 桌宠不能拖动

拖动区域是角色底部的三点把手，不是整个透明窗口。按住把手再移动。如果工具栏覆盖把手，先把光标移开再重新进入。

## 桌宠不在任务栏

这是预期行为。独立桌宠只在系统托盘显示入口。使用悬停工具栏或托盘菜单退出。

Studio 本身应该显示在任务栏：最小化后仍可恢复，点击关闭按钮会结束进程。

## 调整大小后宠物跑出屏幕

0.3.1 会在缩放后重新检查当前显示器边界。旧版本可能混用物理像素和逻辑坐标，请使用新版本重新导出桌宠。

## 导入按钮一直禁用发布

查看“检查与预览”下方错误信息。常见原因：

- 图集尺寸不是支持的 8×9 或 8×11 网格；
- `spritesheetPath` 指向包外文件；
- 必需使用帧为空；
- 未使用单元格含有残留像素；
- ZIP 中包含多个 `pet.json`；
- 清单或图集超过大小限制。

## 跨平台构建包缺少目标 builder

构建包会优先使用随包携带的当前平台 builder；若缺少，系统入口会在首次运行从 `builder-v0.3.1` Release 自动下载。自动下载失败时，可从该 Release 手动取得对应架构压缩包并解压到 `builders/`，或使用 `build-pet.yml` 在目标平台 runner 上构建。

## Docker 无法拉取基础镜像

先检查 Docker Desktop 或 Docker daemon 的代理配置。若日志仍指向已停用的 `127.0.0.1` 代理，需要在 Docker 设置中改为有效代理或系统代理。修改全局代理前应确认不会影响其他容器。

应用级检查：

```bash
docker compose config
docker compose build
docker compose up -d
curl http://localhost:8080/healthz
```

## 如何提交问题

在 [GitHub Issues](https://github.com/MingfengHong/petpack/issues) 提供：

- Studio 版本；
- 操作系统、CPU 架构和显示缩放比例；
- 导入来源类型；
- 错误信息或截图；
- 是否能用示例宠物复现；
- 产物 SHA-256（不要上传无授权宠物素材）。
