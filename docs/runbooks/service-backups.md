---
id: RUN-SERVICE-BACKUPS
type: runbook
status: active
scope: deployment, operations, personal-data
authority: supporting
related: REQ-BACKUPS, REQ-DEPLOYMENT
---
# Резервные копии данных службы

Норма — [`REQ-BACKUPS`](../requirements/backups.md); здесь — порядок действий.

## Объявление

```json
{
  "backups": {
    "sets": {
      "database": {
        "kind": "database", "every": "24h", "keep": "90d", "store": "storage-box",
        "receipt": "/var/lib/shop/backups/database.json", "timer": "shop-db-backup.timer"
      },
      "files": {
        "kind": "files", "every": "24h", "keep": "90d", "store": "storage-box",
        "receipt": "/var/lib/shop/backups/files.json", "timer": "shop-files-backup.timer"
      }
    },
    "restoreRecord": "/var/lib/shop/backups/restored.json"
  }
}
```

`store` — имя, а не адрес: адрес и ключи хранилища приходят из окружения хоста.

## Задание копии

Каждый проект копирует свою базу сам — `pg_dump` своей базы, не `pg_dumpall` кластера:

```bash
set -euo pipefail
dump="/var/tmp/shop-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
pg_dump --dbname="$SHOP_DATABASE_URL" | gzip > "$dump"
rclone copy "$dump" "storage-box:shop/database/"
conventions backups --receipt database --file "$dump" --root /opt/shop
rm -f "$dump"
```

Квитанция пишется после отправки: копия, не дошедшая до хранилища, квитанции не получает. Срок хранения в хранилище (удаление старше `keep`) настраивает то же задание или само хранилище.

## Таймер

Юнит и таймер — составляющие развёртывания; у таймера `"enable": true`:

```json
"shop-db-backup-timer": { "artifact": "deploy/shop-db-backup.timer",
  "install": "/etc/systemd/system/shop-db-backup.timer", "enable": true }
```

Скрипт развёртывания читает пятый столбец `conventions components --full` и включает помеченное: `systemctl enable --now <юнит>`.

## Проверка

- после развёртывания рабочей среды: `conventions backups --check --root <репозиторий на хосте>`;
- наблюдение проекта вызывает ту же команду по своему расписанию.

## Восстановление

Раз в 90 дней (или `restoreEvery`) копию восстанавливают на стенде, проверяют службу и записывают:

```bash
conventions backups --restored --note "восстановлено на qa из копии 2026-09-24, служба поднялась"
```

## Персональные данные

В копиях персональные данные (152-ФЗ). Соглашение называет срок хранения копий и то, что удалённые по запросу данные уходят из копий с истечением срока.
