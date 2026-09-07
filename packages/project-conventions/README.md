# @apocarteres/project-conventions

Пакет правил ведения проекта: нормативные тексты, их исполняемые проверки,
сборка индексов документации и детерминированный цикл выпуска.

Принципы ядра и точное значение слова «подключено» — в доставленном
документе `docs/adoption.md` (`REQ-ADOPTION`). Здесь только команды.

## Что приходит с пакетом

- `docs/` — нормативные тексты платформы. Их не копируют в репозиторий
  потребителя: читают отсюда.
- `bin/conventions` — проверки и инструменты: `check`, `docs-check`,
  `tickets-index`, `releases-index`, `sync`, `baseline`, `receipt`,
  `obligations`, `release`.
- `obligations.json` — обязательства потребителя с требованием, версией
  появления и сроком в выпусках.

## Подключение

```bash
# 1. Закрепить версию ядра и поставить артефакты скриптом своего репозитория
echo vX.Y.Z > .platform-version && scripts/platform/install.sh   # версия ядра, которую подключаете

# 2. Объявить, к чему применяются правила
cat > .conventions.json <<'JSON'
{
  "sources": ["backend/src", "frontend/src", "scripts"],
  "exclude": [],
  "clockAllowlist": [],
  "release": { "scheme": "date" }
}
JSON

# 3. Засеять храповик существующими нарушениями — один раз
node_modules/.bin/conventions baseline

# 4. Вписать указатель на тексты платформы в AGENTS.md
node_modules/.bin/conventions sync

# 5. Принять цикл выпуска: закрытые задачи получают before-cycle,
#    открывается первый выпуск с обязательствами ядра
node_modules/.bin/conventions release adopt

# 6. Проверить состояние обязательств и пройти verify целиком
node_modules/.bin/conventions obligations && mise run verify
```

Шаг 5 создаёт каталоги `docs/tickets` и `docs/releases` и собирает их сводки.
Правила ведения задач и выпусков приходят с пакетом (`docs/tickets.md`,
`docs/release-cycle.md`) и в репозиторий потребителя не копируются. Своими
остаются только входная сводка `docs/INDEX.md` и карта требований проекта
`docs/REQUIREMENTS.md`: они перечисляют документы самого проекта. Чего не
хватает — называет `conventions docs-check`, файл за файлом.

Наборы `check` и `verify` с фиксированными именами и хук `pre-push`
создаются в том же изменении: без них правила есть, а шлагбаума нет.
`verify` заканчивается распиской о проверках:

```bash
node_modules/.bin/conventions receipt check verify
```

## Повседневная работа

```bash
mise run check     # шлагбаум перед отправкой
mise run verify    # всё, что проверяется локально, с распиской
mise run release    # закрыть выпуск: тег на проверенном коммите, открыть следующий
```

Обязательство ядра, уже выполненное до его объявления, закрывается ссылкой
на сделанную работу; неготовое — переносится записью с причиной:

```bash
node_modules/.bin/conventions release satisfy <обязательство> --ticket <TICKET-ID>
node_modules/.bin/conventions release defer <обязательство> --reason "<причина>"
```

## Обновление версии ядра

Отдельным изменением: сменить закреплённую версию, поставить артефакты,
прогнать `verify`, разобрать появившиеся обязательства.
