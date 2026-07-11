# PetPack Studio 0.3.1 测试报告

测试日期：2026-07-11
结论：Windows x64 Release、NSIS 安装包、Studio 导出的独立桌宠、轻量 builder 接力链路、Docker Web API 和 Linux x64 AppImage/DEB 均通过可在本机完成的测试。Linux 已在 Ubuntu 26.04 LTS x86_64 上完成原生构建、依赖检查和启动探测；macOS 已配置原生构建矩阵，但本报告不把其他平台的编译结果冒充 macOS 原生运行验收。

## 测试环境

- Windows 11 专业版 64-bit，10.0.26200
- Node.js 22.14.0，npm 10.9.2
- Rust/Cargo 1.97.0
- Tauri 2、WebView2、200% 显示缩放环境
- 输入：`pet-example/luofulai`、Petdex `boba`、同一宠物 ZIP
- Ubuntu 26.04 LTS x86_64，kernel 7.0.0-27-generic
- Linux Node.js 22.22.1，npm 9.2.0，Rust/Cargo 1.93.1
- Linux Tauri 依赖：GTK 3、WebKitGTK 4.1、Ayatana AppIndicator、librsvg、patchelf、FUSE 2 兼容库
- Linux 图形会话：`DISPLAY=:0`、`WAYLAND_DISPLAY=wayland-0`

## 本轮缺陷与修复

1. 桌宠只显示左上四分之一：全局 Studio CSS 的 `min-width: 900px` / `min-height: 680px` 误作用到 260×270 运行时。运行时现在独立使用 100vw/100vh、零最小尺寸和缩放容器。
2. 桌宠固定在右下角且位置在高 DPI 下不可靠：原代码混用了物理显示器像素和逻辑窗口坐标。现在显示器位置和尺寸都按窗口 DPI 转成逻辑坐标，并保留可见边距。
3. 不易拖动：底部拖动区域扩大为 68×20，并由真实 `pointerdown` 调用 Tauri `startDragging()`。
4. 不能调大小：加入 70%–140% 缩放、界面 `−/＋`、托盘小/标准/大三档、持久化和屏幕边界夹取。
5. Studio 最小化后消失：Studio 明确使用普通 decorated/AppWindow 窗口，不再托盘化；最小化保留任务栏，关闭事件直接退出进程。
6. 跨平台分发：加入接力包、轻量 `petpack-builder` CLI、三平台 builder 工作流和按宠物三平台构建工作流。
7. 服务器部署：加入无持久化上传的 Docker Web Studio、格式/尺寸/路径校验和 builder 目录挂载。
8. 交互栏：默认完全隐藏，只有光标进入宠物或键盘聚焦时出现；移除了“托盘运行中 · 不占任务栏”说明文字。
9. 发布区域 UI/UX：将原先含义重叠的两条大按钮重构为“确认应用信息 → 选择发布方式 → 查看成功结果”。明确区分“当前平台成品”和“跨平台构建包”，根据宿主系统生成平台文案，校验通过前禁用发布、通过后显示就绪状态，成功后高亮对应方案并给出可打开的输出路径；删除导入区的离线提示框。

## 自动化回归

| 项目 | 结果 |
| --- | --- |
| TypeScript `tsc --noEmit` | 通过 |
| Vite production build | 通过 |
| Rust/Tauri 单元与集成测试 | 11 passed，0 failed，1 ignored |
| 显式 Petdex `boba` 联网测试 | 1 passed，0 failed |
| Node Web Server 测试 | 3 passed，0 failed |
| `npm audit --omit=dev` | 0 vulnerabilities |
| GitHub Actions YAML 解析 | 3 个 workflow 全部通过 |
| `docker compose config` | 通过 |
| Windows Rust release + NSIS | 通过 |
| Linux AppImage + DEB 原生打包 | 通过 |
| Linux release binary / AppImage 启动探测 | 通过 |

0.3.1 真实 Studio 窗口额外验证：Windows 平台标签和按钮文案正确；未导入时两种发布按钮均禁用；导入 `luofulai` 后字段可编辑、按钮启用、状态变为“可以发布”；从新版界面生成 Windows 桌宠成功，当前平台卡片进入完成状态并显示 ZIP 路径与“打开输出文件夹”。

Rust 回归覆盖父目录单宠物解析、清单路径穿越、错误图集、嵌套 ZIP、ZIP 路径穿越/多宠物、Codex v2 样例、自包含导出、跨平台接力包和高 DPI/非零显示器原点窗口定位。

## Linux 本机验收

本轮在 Ubuntu 26.04 LTS x86_64 上补齐 Rust/Cargo 和 Tauri Linux 构建依赖后完成原生验证。首次 Rust 编译时 `/tmp` tmpfs 配额不足导致 `rustc` 临时文件写入失败；将 `TMPDIR` 指向仓库内 `.tmp` 后，代码和打包流程均正常通过。该问题属于本机测试环境限制，不需要项目代码修复。

| 项目 | 方法与证据 | 结果 |
| --- | --- | --- |
| TypeScript 与 Rust 回归 | \`env TMPDIR=$PWD/.tmp npm test\` | 11 passed，0 failed，1 ignored |
| Petdex 联网测试 | `cargo test ... downloads_the_petdex_boba_package -- --ignored` | 1 passed，0 failed |
| Linux 打包 | \`env TMPDIR=$PWD/.tmp npm run tauri build -- --bundles appimage,deb --ci\` | 生成 AppImage 与 DEB |
| 动态依赖 | `ldd src-tauri/target/release/petpack-studio` | 无 `not found` 依赖 |
| DEB 元数据 | `dpkg-deb --field ... Package Version Architecture Depends` | `pet-pack-studio` 0.3.1，amd64，依赖 `libayatana-appindicator3-1`、`libwebkit2gtk-4.1-0`、`libgtk-3-0` |
| DEB 包内容 | `dpkg-deb -c` / `dpkg-deb --info` | 包含 `/usr/bin/petpack-studio`、桌面入口和 32/128/256@2 图标 |
| DEB 安装 | `pkexec /usr/bin/dpkg -i ...` 后 `dpkg -s pet-pack-studio` | `install ok installed`，版本 0.3.1，amd64 |
| 桌面入口 | `desktop-file-validate /usr/share/applications/PetPack Studio.desktop` | 通过，无校验错误 |
| 启动探测 | `timeout 8` 分别启动 release binary 与 AppImage | 二者均保持运行至超时，无 stderr 崩溃输出 |
| 安装版启动 | `timeout 8 /usr/bin/petpack-studio` | 保持运行至超时，无 stderr 崩溃输出 |
| 进程清理 | `pgrep -af petpack-studio` | 无残留进程 |
| DEB 卸载 | `pkexec /usr/bin/dpkg -r pet-pack-studio` 后复查 | 包、`/usr/bin/petpack-studio` 和桌面入口均已移除 |

Linux 产物：

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `PetPack Studio_0.3.1_amd64.AppImage` | 85,789,176 | `6BC64B5213BCA297E8D579F90F53C2C0CA364624C936E5899536F57F28FF3FE4` |
| `PetPack Studio_0.3.1_amd64.deb` | 6,300,164 | `45ACCA470013C8E82E65DE87F74F16355F08D767639189D242368D343A4FA7B2` |
| `petpack-studio` | 17,447,984 | `78ABCEC7904C2D4719FF839B7320449DCC18F15B037BC2642544A00C91D13B7D` |

## 最终 Windows 桌宠实测

最终测试文件：`artifacts-final/luofulai-desktop-pet-windows-x64/luofulai.exe`。

| 项目 | 方法与证据 | 结果 |
| --- | --- | --- |
| 完整显示 | 真实桌面截图与 Win32 `GetWindowRect` | 初始 260×270，角色、透明区和拖动把手完整，无四分之一裁切 |
| 高 DPI 定位 | 200% 缩放显示器实际启动 | 初始位置保留右/下边距，窗口全部位于屏幕内 |
| 默认工具栏 | 光标在其他窗口时截图与无障碍树 | `−/＋/Hi/跳跃/置顶/退出` 均隐藏，只有宠物和拖动把手 |
| 悬停工具栏 | 光标进入宠物后截图与无障碍树 | 六个控件出现；没有托盘状态说明文字 |
| 缩放 | 实际点击放大 | 260×270 变为 299×311，即 1.15 倍，内容仍完整 |
| 拖动 | 从底部把手执行真实鼠标拖动 | 窗口左上角从 (1156,558) 移到 (1133,526) |
| 无边框 | 正式样式 `GWL_STYLE=0x14000000` | 无 Caption、无 Border |
| 不进任务栏 | 正式样式 `GWL_EXSTYLE=0x98`，桌面窗口枚举无该项 | `AppWindow=false`、`ToolWindow=true` |
| 置顶 | `0x98` 包含 TopMost，实际覆盖普通窗口 | 通过 |
| 动画/交互 | 播放器、动作事件、指针注视与最终 v2 图集 | 待机、挥手、跳跃和 16 向注视路径通过 |
| 退出 | 界面/托盘退出路径与进程检查 | 通过 |

为了让自动化输入工具能选择本来故意不进任务栏的 ToolWindow，拖动/缩放测试期间只对测试进程临时加入 AppWindow 样式；发布文件未改动。输入完成后恢复 `0x14000000/0x98` 并再次确认窗口枚举中不存在任务栏项。

## 图集与 ZIP

`hatch-pet validate_atlas.py --require-v2` 对最终包内图集的结果：

- `ok=true`
- WEBP、RGBA、1536×2288、8×11、`spriteVersionNumber=2`
- 透明 RGB 残留 0
- 0 errors、0 warnings
- 使用单元格均有内容，未使用单元格全透明

最终桌宠 ZIP：7 个条目，0 个绝对路径、盘符路径或 `..` 路径，包含 EXE、manifest、运行时标记、spritesheet、README 和第三方声明。

## Studio 安装生命周期

1. 最终 NSIS 静默安装到隔离目录：exit code 0。
2. `petpack-studio.exe` 与 `uninstall.exe` 存在；FileVersion/ProductVersion 均为 0.3.1。
3. 安装版真实窗口为 1122×810，正常装饰、可最小化。
4. 使用真实 Windows 输入最小化后：进程仍运行、`IsIconic=true`、`AppWindow=true`、`ToolWindow=false`。
5. 恢复后关闭窗口：窗口枚举为空、安装目录内 Studio 进程数为 0。
6. 静默卸载：exit code 0；安装目录不存在。

## 跨平台接力测试

- `exports_a_cross_platform_relay_kit` 单元测试验证接力 ZIP 包含 `petpack.bundle`、`build-request.json`、Windows/macOS/Linux 指引和当前平台 builder。
- 模拟收件人目录只放宠物数据和 `builders/windows-x64/petpack-builder.exe`，运行 `build-pet --source petpack.bundle --output recipient-output` 成功。
- 收件人生成的 Windows 桌宠 ZIP 与 Studio 最终导出 ZIP 字节级一致，SHA-256 都是 `20A41A...C5E5E`。
- `.github/workflows/build-builders.yml` 和 `.github/workflows/build-pet.yml` 均通过 YAML 解析；后者在目标平台原生 runner 上构建，不宣称 Linux 容器能生成签名 macOS 应用。

## Docker Web 版

- `/healthz` 返回 `{"ok":true}`。
- 使用真实 `luofulai` ZIP 调用 `/api/package`，返回约 2.05 MB、包含 manifest 和构建脚本的接力 ZIP。
- 上传由 multer 内存处理；路径穿越、多个 manifest、超限文件、非 PNG/WebP 和错误尺寸会被拒绝。
- Dockerfile、Compose 配置、非 root 用户、healthcheck 和只读 builder 挂载已验证。
- 本机没有缓存 `node:22-alpine`，Docker Desktop 又配置了不可达的全局代理 `127.0.0.1:10090`，因此本机镜像拉取被外部代理设置阻断。没有为了测试擅自修改用户的 Docker 全局代理；应用 API 已在同一 Node 22 运行时完成端到端测试。

## 最终产物与 SHA-256

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `PetPack Studio_0.3.1_x64-setup.exe` | 3,340,869 | `8298FC2B490353E8B3E0CFD8CE1D74F3194BB43729D7BF76D3DFCEE92BB3AE18` |
| `luofulai-desktop-pet-windows-x64.zip` | 6,731,180 | `11C388D9F19F427495DDB8468B12096BBFE767C5FFAF70DEF02B0BDC13B7EBB2` |
| `luofulai.exe` | 13,586,944 | `28318C8CBF0B5D55DFF670A4B7EA60A1AAA60D809D008529151E5E0395855B24` |
| `PetPack Studio_0.3.1_amd64.AppImage` | 85,789,176 | `6BC64B5213BCA297E8D579F90F53C2C0CA364624C936E5899536F57F28FF3FE4` |
| `PetPack Studio_0.3.1_amd64.deb` | 6,300,164 | `45ACCA470013C8E82E65DE87F74F16355F08D767639189D242368D343A4FA7B2` |
| `petpack-studio` Linux x64 release binary | 17,447,984 | `78ABCEC7904C2D4719FF839B7320449DCC18F15B037BC2642544A00C91D13B7D` |

## 尚需目标平台验收的边界

macOS 窗口使用同一逻辑尺寸、DPI 转换、缩放、拖动和边界夹取代码，并在原生 runner 上构建。但透明窗口、托盘和窗口管理器行为最终仍应在真实 macOS 上验收；代码签名、公证也必须在 macOS 完成。Linux 已在 Ubuntu 26.04 LTS 上完成 AppImage/DEB 构建和启动探测，仍建议在目标发行版与桌面环境上补充安装、托盘和窗口管理器验收。
