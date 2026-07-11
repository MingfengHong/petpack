# 文档站维护

PetPack 文档站使用 VitePress 构建。源码和发布产物分开管理：

| 分支 | 用途 |
| --- | --- |
| `main` | 产品源码、README、文档源码和工作流 |
| `gh-pages` | GitHub Actions 生成的静态站点，不作为开发分支 |

## 文档入口

- `README.md`：面向 GitHub 访客的项目概览、下载和快速入口；
- `docs/index.md`：文档站首页；
- `docs/getting-started.md`：第一次使用；
- `docs/user-guide.md`：完整功能和交互；
- `docs/PET_FORMATS.md`：宠物作者格式规范；
- `docs/CROSS_PLATFORM.md`：跨平台分发和 Release；
- `docs/DOCKER.md`：Web Studio 部署；
- `docs/development.md`：开发、测试和构建；
- `docs/troubleshooting.md`：用户排错；
- `docs/TEST_REPORT.md`：版本测试证据。

## 发布规则

`.github/workflows/docs.yml` 在文档、README、文档依赖或自身变化时运行：

- Pull Request：只构建并验证，不发布；
- 推送 `main`：构建后强制更新 `gh-pages`；
- 手动触发：按当前分支执行同一流程。

GitHub Pages 应配置为从 `gh-pages` 分支根目录发布。不要直接向该分支提交文档源码。

## 本地预览

```bash
npm ci
npm run docs:dev
```

生产构建：

```bash
npm run docs:build
```

部署基路径由 `DOCS_BASE` 控制。仓库 Pages 使用 `/petpack/`，本地开发默认使用 `/`。

## 内容维护原则

- README 保持面向新用户，不复制完整手册；
- 下载安装表必须和 Actions 真实产物名称一致；
- 版本功能和 SHA-256 以 Release 和测试报告为准；
- 不把 token、证书、API Key 或本地绝对路径写入公开文档；
- UI 文案变化时同步更新快速开始和使用手册；
- 平台限制必须明确区分“已原生测试”和“仅配置构建”。
