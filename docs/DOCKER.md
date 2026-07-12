# Docker Web 版

Docker Web Studio 提供与桌面版一致的三步式导入、格式与安全校验、逐行动画预览和跨平台接力包下载，并支持中英文切换。它适合把宠物打包入口部署给团队或社区用户；浏览器不能打开桌面无边框试玩窗口。

在线版不会显示“构建当前 Linux 平台”：运行服务的容器不是用户的目标桌面设备。Windows、macOS 和 Linux 原生桌宠仍应在目标系统或对应原生 CI runner 上生成。

## 快速部署

```bash
git clone https://github.com/MingfengHong/petpack.git
cd petpack
docker compose up --build -d
```

打开：

```text
http://localhost:8080
```

健康检查：

```bash
curl http://localhost:8080/healthz
```

成功响应：

```json
{"ok":true}
```

## 上传要求

Web Studio 接受包含 `pet.json` 和 PNG/WebP spritesheet 的 ZIP，也接受 Petdex slug 或 `petdex.dev/pets/<slug>` 页面链接。上传内容在请求内存中处理，不写入持久化目录。

Petdex 导入只查询官方 manifest，并只下载 `https://assets.petdex.dev` 下的清单与图集；拒绝 HTTP、非官方域名、携带凭据或自定义端口的资源 URL。单次上游请求设置超时和流式大小限制。

服务会拒绝：

- 超过限制的清单或图集；
- ZIP 路径穿越；
- 多个宠物清单；
- 清单引用包外文件；
- 错误格式或不能识别的图集尺寸。

## 挂载轻量 builder

Compose 把根目录的 `builder-runtimes/` 只读挂载到 `/app/builders`：

```text
builder-runtimes/
├── windows-x64/petpack-builder.exe
├── macos-current/PetPack Builder.app/...
└── linux-current/petpack-builder
```

存在这些文件时，Web Studio 返回的构建包会自动携带可用 builder。builder 可以从 `build-builders.yml` 的 GitHub Actions 产物下载。

## 生产部署建议

- 在反向代理层配置 HTTPS；
- 限制请求体大小并设置合理超时；
- 不要给容器挂载 Docker socket；
- builder 目录使用只读挂载；
- 定期更新 Node 基础镜像和 npm 依赖；
- 对公网服务增加访问控制或限流。

## 能力边界

Docker 多架构镜像解决 Linux 容器 CPU 架构分发，不等于跨操作系统桌面应用编译。macOS 和 Windows builder 应由对应原生机器或 GitHub Actions runner 预构建，再挂载给 Web Studio。

## 停止和更新

```bash
docker compose down
git pull
docker compose up --build -d
```

上传数据不持久化，因此普通重建不需要迁移数据库。
