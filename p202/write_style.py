#!/usr/bin/env python3
import os
base = os.getcwd()

with open("index.html", "w", encoding="utf-8") as f:
    f.write("""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OFDM 信号仿真平台</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
    <script type="module">
      if (import.meta.hot?.on) {
        import.meta.hot.on("vite:error", (error) => {
          if (error.err) {
            console.error(
              [error.err.message, error.err.frame].filter(Boolean).join("\n"),
            )
          }
        })
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
""")
print("index.html written")

with open("tailwind.config.js", "w", encoding="utf-8") as f:
    f.write("""/** @type {import("tailwindcss").Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Noto Sans SC", "sans-serif"],
      },
      colors: {
        brand: {
          bg: "#0a0e1a",
          panel: "#0d1225",
          cyan: "#00e5ff",
          amber: "#ffab00",
          purple: "#7c4dff",
          red: "#ff5252",
        },
      },
      boxShadow: {
        glow: "0 0 15px rgba(0,229,255,0.3)",
        "glow-sm": "0 0 8px rgba(0,229,255,0.2)",
      },
    },
  },
  plugins: [],
};
""")
print("tailwind.config.js written")

with open("src/index.css", "w", encoding="utf-8") as f:
    f.write("""@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100