# PetPack 文档源码

本目录是 PetPack Studio 的 VitePress 文档站源码。社区贡献修改 `main` 分支中的 `README.md`、`docs/` 和文档构建配置；生成的静态产物由 GitHub Actions 发布到 `gh-pages`。

## 文档结构

| 文件 | 读者和用途 |
| --- | --- |
| `index.md` | 文档首页和入口导航 |
| `getting-started.md` | 第一次下载安装和打包 |
| `user-guide.md` | 完整 Studio 与桌宠交互 |
| `PET_FORMATS.md` | 宠物包和图集规范 |
| `CROSS_PLATFORM.md` | 跨平台构建与 Release |
| `DOCKER.md` | Docker Web Studio |
| `development.md` | 开发、测试和工作流 |
| `troubleshooting.md` | 安装、运行和构建排错 |
| `site-maintenance.md` | 文档发布与维护规则 |

## 本地预览

```bash
npm ci
npm run docs:dev
```

构建：

```bash
npm run docs:build
```

GitHub Pages 构建使用：

```bash
DOCS_BASE=/petpack/ npm run docs:build
```
