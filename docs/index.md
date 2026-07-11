---
layout: home

hero:
  name: PetPack Studio
  text: 让你的 Codex 宠物走出 Codex
  tagline: 导入、校验并预览 Codex 或 Petdex 宠物，将它打包成不依赖 Codex 的 Windows、macOS 和 Linux 独立桌宠。
  image:
    src: /logo-mark.png
    alt: PetPack Studio 图标
  actions:
    - theme: brand
      text: 下载 0.3.1
      link: https://github.com/MingfengHong/petpack/releases
    - theme: alt
      text: 五分钟快速开始
      link: /getting-started
    - theme: alt
      text: 阅读完整手册
      link: /user-guide
    - theme: alt
      text: GitHub 仓库
      link: https://github.com/MingfengHong/petpack

features:
  - title: 导入与识别
    details: 支持 Codex v2、Codex/Petdex v1、本地文件夹、ZIP、pet.json、spritesheet 和 Petdex 页面链接。
  - title: 校验与预览
    details: 检查清单、图集、帧占用和透明单元格，并逐行动画预览 9 种标准动作和 v2 指针注视方向。
  - title: 独立桌宠
    details: 透明无边框、置顶、可拖动、70%–140% 缩放、托盘运行，不依赖 Codex 且不占任务栏。
  - title: 当前平台成品
    details: 一键生成原生运行程序、宠物资源目录和便携 ZIP，适合同平台直接分发。
  - title: 跨平台构建包
    details: 将宠物资源、轻量 builder 和构建指引分发到目标设备，再生成对应平台的原生桌宠。
  - title: Docker Web Studio
    details: 通过浏览器上传宠物 ZIP，执行同一套格式和安全校验，并下载跨平台构建包。
---

<div class="home-banner">
  <img src="./assets/banner.png" alt="PetPack Studio 产品界面与打包流程">
</div>

## 选择使用方式

- **直接使用 Studio**：从 [GitHub Releases](https://github.com/MingfengHong/petpack/releases) 下载当前系统安装包，适合本地导入、预览和打包。
- **跨平台分发**：阅读[跨平台构建与分发](CROSS_PLATFORM.md)，选择目标设备 builder 或 GitHub Actions 原生构建。
- **服务器提供服务**：阅读 [Docker Web 版](DOCKER.md)，部署浏览器上传和构建包下载入口。
- **开发和贡献**：阅读[开发和发布构建](development.md)，了解本地开发、测试、文档和 Release 产物。

## 文档地图

第一次使用从[快速开始](getting-started.md)进入；需要逐项理解界面和产物时阅读[完整使用手册](user-guide.md)。宠物作者应重点阅读[宠物包格式](PET_FORMATS.md)，公开分发前请同时查看[常见问题与排错](troubleshooting.md)和[测试报告](TEST_REPORT.md)。
