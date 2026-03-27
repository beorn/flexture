import { defineConfig } from "vitepress"

export default defineConfig({
  title: "Flexily",
  description: "Pure JavaScript Flexbox Layout Engine -- Yoga-compatible API, faster, smaller, no WASM",
  base: "/flexily/",

  sitemap: { hostname: "https://flexily.dev" },

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/flexily/logo.svg" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Flexily" }],
    ["meta", { name: "twitter:card", content: "summary" }],
    [
      "script",
      {
        defer: "",
        src: "https://static.cloudflareinsights.com/beacon.min.js",
        "data-cf-beacon": '{"token": "f7205b82de9042c39f6609a9661b479f"}',
      },
    ],
  ],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Flexily",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/reference" },
      {
        text: "Links",
        items: [
          { text: "GitHub", link: "https://github.com/beorn/flexily" },
          { text: "npm", link: "https://www.npmjs.com/package/flexily" },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Why Flexily?", link: "/guide/why-flexily" },
          ],
        },
        {
          text: "Deep Dives",
          items: [
            { text: "Algorithm", link: "/guide/algorithm" },
            { text: "Performance", link: "/guide/performance" },
            { text: "Zero-Allocation Design", link: "/guide/zero-allocation" },
            { text: "Testing", link: "/guide/testing" },
            { text: "Incremental Layout Bugs", link: "/guide/incremental-layout-bugs" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Yoga Comparison", link: "/guide/yoga-comparison" },
            { text: "Yoga Divergences", link: "/guide/yoga-divergences" },
            { text: "Migration from Yoga", link: "/guide/migration-from-yoga" },
            { text: "v1 Roadmap", link: "/guide/v1-roadmap" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API",
          items: [{ text: "API Reference", link: "/api/reference" }],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/beorn/flexily" }],

    outline: { level: [2, 3] },

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright &copy; 2024-present",
    },
  },

  transformPageData(pageData) {
    const title = pageData.title || "Flexily"
    const description = pageData.description || "High-performance flexbox layout engine"
    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      [
        "meta",
        {
          property: "og:url",
          content: `https://flexily.dev/${pageData.relativePath.replace(/\.md$/, ".html").replace(/index\.html$/, "")}`,
        },
      ],
    )
  },
})
