# PetPack 在线版

在浏览器中上传 Codex/Petdex 宠物 ZIP，或输入 Petdex slug/链接，在线执行格式、安全与图集校验、逐行动画预览，并下载带一键入口的跨平台接力包。页面支持中英文切换。

在线容器不会被当作目标 Linux 桌面；原生 Windows、macOS 或 Linux 桌宠由接收设备或原生 CI runner 构建。

- 单次上传上限：18 MiB
- 支持图集：PNG、WebP
- 上传内容仅在请求内存中处理，不持久化保存
- Petdex 导入只访问 `assets.petdex.dev` 官方资源
- 服务端不会访问或上传本地 Codex 数据

桌面 Studio、完整文档和源代码：<https://github.com/MingfengHong/petpack>

使用说明：<https://mingfenghong.github.io/petpack/>
