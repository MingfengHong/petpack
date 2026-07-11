# Docker Web 版

Docker Web Studio 提供浏览器上传、格式与安全校验、跨平台构建包下载。它适合把宠物打包入口部署给团队或社区用户，但不包含桌面 Studio 的动画预览和本机窗口试玩。

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

Web Studio 接受包含 `pet.json` 和 PNG/WebP spritesheet 的 ZIP。上传内容在请求内存中处理，不写入持久化目录。

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
