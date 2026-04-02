import { defineConfig } from "vitepress"
import llmstxt from "vitepress-plugin-llms"
import { seoHead, seoTransformPageData } from "@bearly/vitepress-enrich"

const seoOptions = {
  hostname: "https://beorn.codes/flexily",
  siteName: "Flexily",
  description: "High-performance flexbox layout engine",
  ogImage: "https://beorn.codes/flexily/og-image.svg",
  author: "Bjørn Stabell",
  codeRepository: "https://github.com/beorn/flexily",
}

export default defineConfig({
  title: "Flexily",
  description: "Pure JavaScript Flexbox Layout Engine -- Yoga-compatible API, faster, smaller, no WASM",
  base: "/flexily/",
  lastUpdated: true,

  sitemap: { hostname: "https://beorn.codes/flexily/" },

  vite: {
    plugins: [llmstxt()],
    ssr: {
      noExternal: ["@bearly/vitepress-enrich"],
    },
  },

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/flexily/logo.svg" }],
    [
      "script",
      {
        defer: "",
        src: "https://static.cloudflareinsights.com/beacon.min.js",
        "data-cf-beacon": '{"token": "f7205b82de9042c39f6609a9661b479f"}',
      },
    ],
    ...seoHead(seoOptions),
  ],

  transformPageData: seoTransformPageData(seoOptions),

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Flexily",

    nav: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Why Flexily?", link: "/guide/why-flexily" },
          { text: "Algorithm", link: "/guide/algorithm" },
          { text: "Performance", link: "/guide/performance" },
          { text: "Zero-Allocation Design", link: "/guide/zero-allocation" },
          { text: "Testing", link: "/guide/testing" },
          { text: "Yoga Comparison", link: "/guide/yoga-comparison" },
          { text: "Migration from Yoga", link: "/guide/migration-from-yoga" },
        ],
      },
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
      message:
        'Powers <a href="https://silvery.dev">Silvery</a> layout · <a href="https://beorn.codes/flexily">Pretext</a> text layout integration (alpha)',
      copyright: 'Built by <a href="https://beorn.codes">Bjørn Stabell</a>',
    },
  },
})
