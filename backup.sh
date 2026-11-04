#!/usr/bin/env bash
# Резервная копия данных FlowPilot (workflows, settings, history) в ./backups/
# Использование: ./backup.sh   (или через cron: 0 3 * * * /path/to/flowpilot/backup.sh)
set -euo pipefail
cd "$(dirname "$0")"

TS=$(date +%Y%m%d-%H%M%S)
DEST="backups/flowpilot-$TS"
mkdir -p "$DEST"

if [ -d server/data ]; then
  cp -a server/data/. "$DEST"/
else
  echo "WARN: server/data не найден — ничего не копировать" >&2
fi

# держим последние 14 бэкапов
ls -1dt backups/flowpilot-* 2>/dev/null | tail -n +15 | xargs -r rm -rf

echo "OK: бэкап создан в $DEST ($(du -sh "$DEST" | cut -f1))"
