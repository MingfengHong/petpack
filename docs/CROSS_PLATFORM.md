# 跨平台构建与分发

## 平台边界

Windows、macOS 和 Linux 桌面应用需要各自的原生工具链。Windows 本机不能可靠生成和签名 macOS DMG，普通 Linux 容器也不能替代 macOS 原生构建环境。

PetPack 提供两种可验证的跨平台路径：目标设备轻量构建，或 GitHub Actions 原生 runner 构建。

## 当前平台成品和跨平台构建包

| 发布方式 | 产物 | 适用场景 |
| --- | --- | --- |
| 当前平台成品 | 当前系统运行程序、`petpack.bundle`、说明和 ZIP | 当前设备使用，或分发给相同平台和架构的用户 |
| 跨平台构建包 | 宠物资源、构建请求、轻量 builder 和目标设备脚本 | 分发到不同操作系统，在目标设备生成原生桌宠 |

## 目标设备构建流程

1. 在 Studio 导入并验证宠物。
2. 在“发布桌宠”区域选择“导出跨平台构建包”。
3. 将生成的 ZIP 分发到目标设备。
4. 解压后运行 `build-here.ps1`（Windows）或 `build-here.sh`（macOS/Linux）。
5. 在 `output/` 获取原生桌宠目录和 ZIP。

构建包结构：

```text
petpack-cross-platform/
├── petpack.bundle/
├── build-request.json
├── builders/
├── build-here.ps1
├── build-here.sh
└── README.md
```

接收端不需要完整 Studio，也不需要 Codex。

## GitHub Actions 原生构建

仓库包含三套工作流：

| 工作流 | 用途 |
| --- | --- |
| `build.yml` | 构建 Studio 的 Windows NSIS、macOS DMG、Linux AppImage/DEB |
| `build-builders.yml` | 构建 Windows、macOS、Linux 轻量 builder |
| `build-pet.yml` | 从可下载的跨平台构建包生成各平台桌宠 |

运行 `build-pet.yml` 时填写 `source_url`。工作流会下载、检查并解压构建包，然后在原生 runner 上调用对应 builder。

## Studio Release 产物

正式 Release 建议包含：

- Windows x64 NSIS；
- macOS Apple Silicon DMG；
- macOS Intel DMG；
- Linux x64 AppImage；
- Debian/Ubuntu x64 DEB；
- `SHA256SUMS.txt`；
- 简短更新说明和未签名提示。

## 代码签名

未配置证书时，CI 只能生成未商业签名的社区构建：

- Windows 正式公开分发建议使用 Authenticode 代码签名；
- macOS 建议使用 Developer ID、Hardened Runtime、公证和 stapling；
- Linux 可根据发行版补充仓库签名或包签名。

未签名包的首次启动方法见[常见问题与排错](troubleshooting.md)。

## Docker 的作用

Docker Web Studio 负责上传、校验和生成跨平台构建包。容器中可以挂载预构建 builder，但 Linux 容器本身不负责生成或签名 macOS 原生应用。详见 [Docker Web 版](DOCKER.md)。
