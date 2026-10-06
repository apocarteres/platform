---
id: RUN-TELEMETRY-NODES
type: runbook
status: active
scope: deployment, operations
authority: supporting
related: REQ-TELEMETRY, REQ-DEPLOYMENT
---
# Наблюдение за узлами

Норма — [`REQ-TELEMETRY`](../requirements/telemetry.md); здесь — порядок действий.
Имена, адреса и порты ниже — образец.

## Объявление

```json
{
  "telemetry": {
    "nodes": ["shop-node-1", "shop-node-2"],
    "prometheus": "https://observation.example.test/prometheus",
    "loki": "https://observation.example.test/loki",
    "logsWithin": "1h"
  }
}
```

Имя узла начинается с имени проекта: на общем хосте наблюдения оно должно
быть уникальным (`REQ-TELEMETRY-002`). Учётные данные приёмников в
репозиторий не пишутся.

## Подключение узла

На узле:

1. Поставить `node_exporter` службой systemd.
2. Поставить Grafana Alloy и отправлять журнал systemd в Loki с меткой `node`:

   ```alloy
   loki.source.journal "systemd" {
     forward_to = [loki.write.observation.receiver]
     labels     = { node = "shop-node-1" }
   }

   loki.write "observation" {
     endpoint { url = "https://observation.example.test/loki/api/v1/push" }
   }
   ```

3. Открыть порт `node_exporter` только для хоста наблюдения, по IPv4 и IPv6
   одним правилом: в nftables — таблица семейства `inet`.

На хосте наблюдения — своей частью, отдельным файлом проекта
(`REQ-TELEMETRY-005`):

```json
[{ "targets": ["shop-node-1.example.test:9100"], "labels": { "node": "shop-node-1" } }]
```

Файл кладётся туда, откуда его читает `file_sd_configs` настройки владельца.
Метку `node` ставит цель, а не правило перемаркировки в общей настройке:
общее проект не правит.

Отключение узла — в обратном порядке: убрать цель, остановить Alloy и
`node_exporter`, убрать узел из `nodes`.

## Оповещения

```sh
conventions telemetry --alerts prometheus > shop-nodes.rules.yaml
conventions telemetry --alerts loki > shop-logs.rules.yaml
```

Файлы передаются владельцу хоста наблюдения как своя часть правил. После
изменения перечня узлов правила печатаются заново.

## Проверка

```sh
conventions telemetry --check
```

Развёртывание рабочей среды вызывает проверку после проверок поведения и
сообщает отказ; её же вызывает наблюдение проекта по расписанию. Отказ
называет узел и что с ним: нет цели, `up = 0` или нет журнала за
`logsWithin`. Недоступный приёмник называется своим адресом.

## Общий хост наблюдения

Общее — адреса, на которых слушают Loki и Prometheus, фильтр входящих,
настройка веб-сервера и его временные каталоги — меняет только репозиторий
владельца хоста. Нужна правка общего — заявка владельцу, а не правка из своей
сессии. После правки общего владелец прогоняет `telemetry --check` всех
проектов хоста.
