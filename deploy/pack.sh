#!/usr/bin/env bash
# ============================================================
#  FlowPilot — упаковать код для загрузки на VPS
#  Собирает tar.gz БЕЗ node_modules, данных и секретов.
#
#  Запуск:  ./deploy/pack.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="/tmp/flowpilot-deploy.tar.gz"
rm -f "$OUT"
tar -czf "$OUT" \
  --exclude='./node_modules' \
  --exclude='./client/node_modules' \
  --exclude='./server/data' \
  --exclude='./.env' \
  --exclude='./backups' \
  --exclude='./.git' \
  --exclude='./dist' \
  -C . .

ls -lh "$OUT"
echo ""
echo "Дальше (замен IP и домен):"
echo "  1) scp $OUT root@IP-СЕРВЕРА:/opt/"
echo "  2) ssh root@IP-СЕРВЕРА"
echo "     mkdir -p /opt/flowpilot"
echo "     tar xzf /opt/flowpilot-deploy.tar.gz -C /opt/flowpilot"
echo "     DOMAIN=твой-домен.kz bash /opt/flowpilot/deploy/setup.sh /opt/flowpilot"
