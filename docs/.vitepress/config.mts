import { defineConfig } from "vitepress";

const base = process.env.DOCS_BASE || "/";

export default defineConfig({
  lang: "zh-CN",
  title: "PetPack Studio",
  description: "将 Codex 与 Petdex 宠物打包为独立跨平台桌宠应用",
  base,
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
  },
  head: [
    ["link", { rel: "icon", href: `${base}logo-mark.png` }],
    ["meta", { name: "theme-color", content: "#f3efe7" }],
    ["meta", { property: "og:title", content: "PetPack Studio Docs" }],
    ["meta", { property: "og:description", content: "让你的 Codex 宠物走出 Codex。" }],
    ["meta", { property: "og:image", content: `${base}banner.png` }],
  ],
  themeConfig: {
    siteTitle: false,
    logo: "/logo-wide-transparent.png",
    search: {
      provider: "local",
    },
    nav: [
      { text: "首页", link: "/" },
      { text: "快速开始", link: "/getting-started" },
      { text: "使用手册", link: "/user-guide" },
      { text: "分发与部署", link: "/CROSS_PLATFORM" },
      { text: "GitHub", link: "https://github.com/MingfengHong/petpack" },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "文档首页", link: "/" },
          { text: "快速开始", link: "/getting-started" },
          { text: "完整使用手册", link: "/user-guide" },
        ],
      },
      {
        text: "宠物与分发",
        items: [
          { text: "宠物包格式", link: "/PET_FORMATS" },
          { text: "跨平台构建与分发", link: "/CROSS_PLATFORM" },
          { text: "Docker Web 版", link: "/DOCKER" },
        ],
      },
      {
        text: "开发与维护",
        items: [
          { text: "开发和发布构建", link: "/development" },
          { text: "常见问题与排错", link: "/troubleshooting" },
          { text: "文档站维护", link: "/site-maintenance" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/MingfengHong/petpack" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 MingfengHong",
    },
    editLink: {
      pattern: "https://github.com/MingfengHong/petpack/edit/main/docs/:path",
      text: "在 GitHub 上编辑此页",
    },
    lastUpdated: {
      text: "最后更新",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    outline: {
      label: "本页目录",
      level: [2, 3],
    },
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "外观",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",
  },
});
