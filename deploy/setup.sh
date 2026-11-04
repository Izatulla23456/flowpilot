#!/usr/bin/env bash
# ============================================================
#  FlowPilot — деплой одной командой на VPS (Ubuntu 22.04/24.04)
#
#  Перед запуском:
#   1) Код уже лежит в /opt/flowpilot (без node_modules)
#   2) DNS A-запись домена → IP сервера
#
#  Запуск (от root или через sudo):
#     DOMAIN=tвой-домен.kz sudo -E bash /opt/flowpilot/deploy/setup.sh /opt/flowpilot
# ============================================================
set -euo pipefail

APP_DIR="${1:-/opt/flowpilot}"
DOMAIN="${DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  echo "ОШИБКА: укажи домен:  DOMAIN=tвой-домен.kz sudo -E bash $APP_DIR/deploy/setup.sh $APP_DIR"
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  echo "Запусти через sudo (скрипту нужны права root)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> [1/7] Ставлю Node.js 22, Caddy, git, ufw..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
fi
apt-get update -y
apt-get install -y nodejs npm caddy git ufw openssl

echo "==> [2/7] Firewall: открываю только SSH, 80, 443..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable || true

echo "==> [3/7] Собираю приложение..."
cd "$APP_DIR"
npm ci --no-audit --no-fund
npm run build

if [ ! -f .env ]; then
  TOKEN="$(openssl rand -hex 16)"
  printf 'PORT=8787\nFLOWPILOT_ADMIN_TOKEN=%s\n' "$TOKEN" > .env
  chmod 600 .env
  echo ""
  echo "!!! СОХРАНИ АДМИН-ТОКЕН (нужен для входа в конструктор):"
  echo "    $TOKEN"
  echo ""
else
  echo "    .env уже есть — использую его."
fi

echo "==> [4/7] Запускаю приложение под PM2..."
npm i -g pm2
pm2 delete flowpilot 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "==> [5/7] Настраиваю Caddy (HTTPS для $DOMAIN)..."
printf 'DOMAIN=%s\n' "$DOMAIN" > /etc/default/caddy
cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy
sleep 3
systemctl is-active caddy && echo "    caddy работает"

echo "==> [6/7] Бэкап по расписанию (каждое утро в 3:00)..."
mkdir -p "$APP_DIR/backups"
chmod +x "$APP_DIR/backup.sh"
( crontab -l 2>/dev/null | grep -v 'flowpilot/backup.sh' ; echo "0 3 * * * /opt/flowpilot/backup.sh >> /opt/flowpilot/backups/cron.log 2>&1" ) | crontab -

echo "==> [7/7] Проверка..."
sleep 2
curl -sf http://127.0.0.1:8787/api/health && echo "  <- API ок"
IP="$(curl -s https://api.ipify.org || echo 'IP-сервера')"
echo ""
echo "============================================================"
echo "  Готово! Открой:  https://$DOMAIN"
echo "  (сертификат выпускается 30–90 секунд после первого запроса)"
echo "  Если сайт не открылся — проверь, что DNS A-запись домена"
echo "  указывает на IP: $IP"
echo "============================================================"
