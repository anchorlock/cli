#!/usr/bin/env bash
# 在服务器上执行：把 /anchorlock/ 写入三合一 Nginx 配置。
# 用法: sudo bash patch-nginx-anchorlock.sh

set -euo pipefail

NGINX_CONF="${NGINX_CONF:-/etc/nginx/sites-available/rule-engine}"
MARKER="# AnchorLock 静态站"

if [[ ! -f "$NGINX_CONF" ]]; then
  echo "❌ 找不到 $NGINX_CONF"
  exit 1
fi

if grep -q "$MARKER" "$NGINX_CONF"; then
  echo "✅ 已存在 AnchorLock location，跳过插入"
else
  python3 - <<'PY'
import pathlib, sys
conf_path = pathlib.Path("/etc/nginx/sites-available/rule-engine")
text = conf_path.read_text()
block = """
    # ========================================================
    # AnchorLock 静态站（产品介绍 + 文档）
    # ========================================================
    location ^~ /anchorlock/ {
        alias /var/www/anchorlock/;
        index index.html;
        add_header Cache-Control "no-cache, must-revalidate" always;
    }

    location = /anchorlock {
        return 301 /anchorlock/;
    }
"""
# 插到 HTTP server 块最后一个 } 之前：找 compass-v1/rule-engine health 之后更稳
anchor = "location = /compass-v1/rule-engine/health"
idx = text.find(anchor)
if idx < 0:
    # 退化：在最后一个单独一行的 } 前插入（HTTP server 收尾）
    lines = text.splitlines(True)
    insert_at = None
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == "}":
            insert_at = i
            break
    if insert_at is None:
        print("❌ 找不到插入点", file=sys.stderr)
        sys.exit(1)
    lines.insert(insert_at, block + "\n")
    conf_path.write_text("".join(lines))
else:
    # 找到该 location 块结束的 }
    brace = text.find("{", idx)
    depth = 0
    end = None
    for i, ch in enumerate(text[brace:], start=brace):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        print("❌ 无法定位 rule-engine health 块结尾", file=sys.stderr)
        sys.exit(1)
    conf_path.write_text(text[:end] + "\n" + block + text[end:])
print("✅ 已写入 /anchorlock/ location")
PY
fi

nginx -t
systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || nginx -s reload
echo "✅ Nginx 已重载"
