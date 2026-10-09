#!/usr/bin/env bash
# AnchorLock 产品页 + 文档 → 腾讯云 139.199.172.184/anchorlock/
#
# 用法:
#   SERVER_PASSWORD='...' ./deploy/deploy.sh
#   或交互输入密码: ./deploy/deploy.sh
#
# 前置: brew install sshpass（或本机已有）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_USER="${SERVER_USER:-ubuntu}"
SERVER_HOST="${SERVER_HOST:-139.199.172.184}"
DEPLOY_PATH="/var/www/anchorlock"
SSH_CTL="/tmp/anchorlock-ssh-$$"

cd "$ROOT"

if ! command -v sshpass >/dev/null 2>&1; then
  echo "请先安装 sshpass: brew install hudochenkov/sshpass/sshpass"
  exit 1
fi

if [[ -z "${SERVER_PASSWORD:-}" ]]; then
  echo -e "\033[33m请输入服务器密码 (${SERVER_USER}@${SERVER_HOST}):\033[0m"
  read -rs SERVER_PASSWORD
  echo ""
fi
export SSHPASS="$SERVER_PASSWORD"

SSH_OPTS=(-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath="$SSH_CTL" -o ControlPersist=60)

echo "=========================================="
echo "  AnchorLock → ${SERVER_HOST}/anchorlock/"
echo "=========================================="

bash "$ROOT/deploy/build-site.sh"

echo "📦 打包 site/ ..."
tar -C "$ROOT/site" -czf /tmp/anchorlock-site.tar.gz .

echo "🔐 建立 SSH ..."
ssh -O exit -o ControlPath="$SSH_CTL" "$SERVER_USER@$SERVER_HOST" 2>/dev/null || true
sshpass -e ssh "${SSH_OPTS[@]}" -fN "$SERVER_USER@$SERVER_HOST"

cleanup() {
  ssh -O exit -o ControlPath="$SSH_CTL" "$SERVER_USER@$SERVER_HOST" 2>/dev/null || true
}
trap cleanup EXIT

ssh_cmd() {
  ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" "$@"
}
scp_cmd() {
  scp "${SSH_OPTS[@]}" "$@"
}

echo "⬆️  上传 ..."
scp_cmd /tmp/anchorlock-site.tar.gz "$SERVER_USER@$SERVER_HOST:/tmp/anchorlock-site.tar.gz"
scp_cmd "$ROOT/deploy/patch-nginx-anchorlock.sh" "$SERVER_USER@$SERVER_HOST:/tmp/patch-nginx-anchorlock.sh"

echo "📂 解压到 ${DEPLOY_PATH} ..."
ssh_cmd "sudo mkdir -p $DEPLOY_PATH && sudo tar -xzf /tmp/anchorlock-site.tar.gz -C $DEPLOY_PATH && sudo chown -R www-data:www-data $DEPLOY_PATH 2>/dev/null || sudo chown -R nginx:nginx $DEPLOY_PATH 2>/dev/null || true; rm -f /tmp/anchorlock-site.tar.gz"

echo "⚙️  写入 Nginx ..."
ssh_cmd "sudo bash /tmp/patch-nginx-anchorlock.sh && rm -f /tmp/patch-nginx-anchorlock.sh"

echo ""
echo "✅ 部署完成"
echo "   产品介绍: http://${SERVER_HOST}/anchorlock/"
echo "   使用文档: http://${SERVER_HOST}/anchorlock/docs/"
echo ""
