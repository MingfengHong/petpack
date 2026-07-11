# 开发和发布构建

## 技术栈

- Tauri 2：桌面窗口、系统托盘、原生打包和 IPC；
- TypeScript + Vite：Studio 和桌宠运行时界面；
- Rust：宠物解析、校验、ZIP 安全、导出和窗口契约；
- Node.js + Express：Docker Web Studio；
- VitePress：社区文档站。

## 本地环境

需要 Node.js 20+、npm、Rust stable，以及当前平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/MingfengHong/petpack.git
cd petpack
npm ci
```

## 开发模式

```bash
npm run tauri dev
```

普通启动创建 Studio；导出的运行时检测到可执行文件旁边存在 `petpack.bundle` 时，只创建桌宠窗口。

## 测试

```bash
npm test
```

该命令执行 TypeScript 类型检查和 Rust/Tauri 测试。显式 Petdex 联网测试默认忽略，需要单独运行：

```bash
cargo test --manifest-path src-tauri/Cargo.toml downloads_the_petdex_boba_package -- --ignored
```

Web Studio：

```bash
cd server
npm ci
npm test
npm audit --omit=dev
```

## 当前平台构建

```bash
npm run tauri build
```

按平台限制 bundle 类型：

```bash
# Windows
npm run tauri build -- --bundles nsis

# macOS
npm run tauri build -- --bundles app,dmg

# Linux
npm run tauri build -- --bundles appimage,deb
```

构建产物位于 `src-tauri/target/<target>/release/bundle/` 或 `src-tauri/target/release/bundle/`。

## GitHub Actions 构建矩阵

`.github/workflows/build.yml` 在原生 runner 上生成：

| Job | 产物 |
| --- | --- |
| Windows x64 | NSIS EXE |
| macOS ARM64 | Apple Silicon DMG |
| macOS x64 | Intel DMG |
| Linux x64 | AppImage、DEB |

每个 job 会先运行 `npm ci` 和 `npm test`，只有测试通过才执行 Tauri release 构建。构建包作为 GitHub Actions artifacts 保存，不自动发布公开 Release。

## 组装 Release

1. 确认 `package.json`、`Cargo.toml` 和 `tauri.conf.json` 版本一致。
2. 运行完整测试。
3. 推送 `main` 或手动运行 `build` workflow。
4. 下载四个 Actions artifacts。
5. 将 NSIS、两个 DMG、AppImage 和 DEB 放入同一发布目录。
6. 生成 `SHA256SUMS.txt`。
7. 在 GitHub Release 中说明版本、架构、签名状态和主要更新。

同类错误修复使用补丁版本，例如 `0.3.0 → 0.3.1`；只有引入不兼容功能或明确的新阶段时才提升次版本。

## 文档站

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

文档源码保存在 `docs/`。推送 `main` 后，`docs.yml` 构建 VitePress 并发布到 `gh-pages` 分支。

## 代码范围

| 路径 | 说明 |
| --- | --- |
| `src/studio.ts` | Studio 界面、导入和发布交互 |
| `src/runtime.ts` | 独立桌宠窗口交互 |
| `src/sprite.ts` | 图集状态和动画播放器 |
| `src-tauri/src/pet_package.rs` | 宠物解析、校验和导出 |
| `src-tauri/src/lib.rs` | Tauri 命令、窗口、托盘和 CLI |
| `server/app.mjs` | Docker Web Studio |
| `.github/workflows/` | Studio、builder、宠物和文档构建 |
