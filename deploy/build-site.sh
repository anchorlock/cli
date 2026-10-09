#!/usr/bin/env bash
# 生成可上传的静态站：产品介绍 + 文档
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p site/docs

node <<'NODE'
const fs = require('fs');
const md = fs.readFileSync('docs/usage.md', 'utf8');
const esc = md
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AnchorLock · 使用说明</title>
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
  <style>
    :root{--bg:#f9f8f8;--text:#2c3138;--muted:#6a717a;--anchor:#1a2740;--accent:#4176e6;--border:rgba(32,38,48,.09);--code:#eef3fa;--ink:#15181f;--font:"PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif;--mono:ui-monospace,monospace}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.7;font-size:15px}
    nav{position:sticky;top:0;backdrop-filter:blur(16px);background:rgba(255,255,255,.82);border-bottom:1px solid var(--border);z-index:10}
    .nav-inner{max-width:820px;margin:0 auto;padding:14px 24px;display:flex;gap:16px;align-items:center;justify-content:space-between}
    .nav-inner a{color:var(--accent);text-decoration:none;font-size:13px;font-weight:600}
    .brand{font-weight:600;color:var(--anchor);text-decoration:none}
    main{max-width:820px;margin:0 auto;padding:40px 24px 80px}
    #doc h1{font-size:2rem;letter-spacing:-.03em;color:var(--anchor);margin:0 0 18px}
    #doc h2{font-size:1.35rem;color:var(--anchor);margin:36px 0 12px}
    #doc h3{font-size:1.05rem;color:var(--anchor);margin:24px 0 8px}
    #doc p,#doc li{color:var(--muted)}
    #doc p{margin:0 0 12px}
    #doc ul,#doc ol{padding-left:22px;margin:0 0 14px}
    #doc li{margin:0 0 6px}
    #doc hr{border:none;border-top:1px solid var(--border);margin:28px 0}
    #doc code{font-family:var(--mono);font-size:12.5px;background:var(--code);padding:1px 5px;border-radius:4px;color:var(--anchor)}
    #doc pre{background:var(--ink);color:#f4f7fc;padding:16px 18px;border-radius:8px;overflow:auto;margin:0 0 16px;font-family:var(--mono);font-size:13px;line-height:1.7}
    #doc pre code{background:none;color:inherit;padding:0}
    #doc table{width:100%;border-collapse:collapse;margin:0 0 18px;font-size:13.5px}
    #doc th,#doc td{border:1px solid var(--border);padding:10px 12px;text-align:left;vertical-align:top}
    #doc th{background:rgba(246,247,249,.95);color:var(--anchor)}
    #doc strong{color:var(--anchor)}
    #doc a{color:var(--accent)}
  </style>
</head>
<body>
  <nav><div class="nav-inner"><a class="brand" href="../">AnchorLock</a><a href="../">← 产品介绍</a></div></nav>
  <main><article id="doc"></article></main>
  <script>
    const MD = \`${esc}\`;
    document.getElementById('doc').innerHTML = marked.parse(MD);
  </script>
</body>
</html>`;
fs.writeFileSync('site/docs/index.html', html);
fs.copyFileSync('docs/usage.md', 'site/docs/usage.md');
fs.copyFileSync('public/index.html', 'site/index.html');
console.log('built site/');
NODE
