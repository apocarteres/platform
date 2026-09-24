---
id: RELEASE-9-2-0
type: release
status: released
scope: release
authority: supporting
opened-on: 2026-09-24
released-on: 2026-09-24
commit: 1f534d16f98b67f88c04c52ca37ce20b2b3351cd
---

# Выпуск 9.2.0

Правила выпуска — `REQ-RELEASE` в поставке пакета правил. [Каталог](INDEX.md)

## Цель

Выпустить состояние сервиса, накопленное после предыдущего выпуска, и исполнить обязательства ядра, попавшие в этот выпуск.

## Состав

| Задача | Причина включения |
|---|---|
| [CORE-ARC-017](../tickets/closed/CORE-ARC-017-support-centre.md) | Закрыта в этом выпуске, приоритет P2 |
| [CORE-OPS-094](../tickets/closed/CORE-OPS-094-finish-credits-work-closed-after-the-tag.md) | Закрыта в этом выпуске, приоритет P1 |
| [CORE-QUAL-027](../tickets/closed/CORE-QUAL-027-domain-nouns-player-character-ledger.md) | Закрыта в этом выпуске, приоритет P3 |

## Учтённые коммиты

| Коммит | Заголовок | Причина |
|---|---|---|
| a552df8b | CORE-ARC-018 Notifications start as a bell in the core, and the notification service research is closed by it | Заведение задачи CORE-ARC-018 и закрытие исследования CORE-ARC-001 решением владельца: меняются только документы задач и ADR, работы задачи в коммите нет |

## Критерии выхода

- [x] Набор `verify` пройден на выпускаемом коммите — расписка 2026-09-24T22:50:04.752Z, наборы: check, verify, прогон `mise run verify-set`
- [x] Тег выпуска создан на проверенном коммите — `v9.2.0`
- [x] Обязательства ядра этого выпуска закрыты или перенесены записью с причиной — ядро не объявляет обязательств самому себе
- [x] Завершающий шаг выполнен — публикация артефактов ядра: mise run install-local

## Не входит

Задачи, не закрытые к моменту закрытия выпуска: они попадут в состав следующего по факту закрытия.

## Проверка видит меньше

- `REQ-JAVA-NAMING-003` разрешает `Player`, `Character`, `Ledger` и `Letter`: имена с этими окончаниями больше не сообщаются. Записи ограничителя `naming-er` на них снимает `conventions baseline`.
- `release finish` засчитывает обязательство только задаче состава, записанного при закрытии (`REQ-RELEASE-019`). Задача, закрытая после тега, уходит в следующий выпуск.

## Миграция

Правок не требуется. Центр поддержки необязателен; подключение — [RUN-SUPPORT-CENTRE](../runbooks/support-centre.md): зависимость `platform-support`, таблицы по образцам `sql/platform-support/create-*.sql`, настройки `platform.support.operator-role` и `spring.servlet.multipart.max-file-size`/`max-request-size` не ниже 5 МБ/16 МБ, бины `GuestIntake` и `SupportLetters`, команды `SupportRetention` из своего планировщика; в клиенте — `provideSupport({ journal: ClientJournal })` или `NO_JOURNAL`. Центр обрабатывает персональные данные по 152-ФЗ: цель обработки, уведомление о снимке и журнале и ответ на запрос субъекта остаются проекту.

## Результат

Выпущено с коммита `1f534d16f98b67f88c04c52ca37ce20b2b3351cd`, тег `v9.2.0`.

Расписка о проверках получена 2026-09-24T22:50:04.752Z; выполненные наборы: check, verify.

Прогон наблюдён командой `mise run verify-set` с кодом возврата 0.

Развёртывание выполняется этим тегом: REQ-RELEASE-016.

## Цена обновления

Несовместимого нет: обновление не делает check красным и не меняет объявленного поведения.

Добавлено (127):
- положений добавлено: 15
- в контракте — platform-support: значение RequestState ANSWERED
- в контракте — platform-support: значение RequestState CLOSED
- в контракте — platform-support: значение RequestState IN_PROGRESS
- в контракте — platform-support: значение RequestState NEW
- в контракте — platform-support: ответ 200 у GET /api/support/operator/requests
- в контракте — platform-support: ответ 200 у GET /api/support/operator/requests/{id}
- в контракте — platform-support: ответ 200 у GET /api/support/operator/requests/{id}/files/{file}
- в контракте — platform-support: ответ 200 у GET /api/support/policy
- в контракте — platform-support: ответ 200 у GET /api/support/requests
- в контракте — platform-support: ответ 200 у GET /api/support/requests/{id}
- в контракте — platform-support: ответ 200 у GET /api/support/requests/{id}/files/{file}
- в контракте — platform-support: ответ 200 у GET /api/support/unread
- в контракте — platform-support: ответ 200 у POST /api/support/answer
- в контракте — platform-support: ответ 200 у POST /api/support/operator/requests/{id}/messages
- в контракте — platform-support: ответ 200 у POST /api/support/operator/requests/{id}/state
- в контракте — platform-support: ответ 200 у POST /api/support/requests/{id}/messages
- в контракте — platform-support: ответ 201 у POST /api/support/requests
- в контракте — platform-support: ответ 204 у POST /api/support/operator/requests/{id}/seen
- в контракте — platform-support: ответ 204 у POST /api/support/requests/{id}/seen
- в контракте — platform-support: поле AnswerLink.token
- в контракте — platform-support: поле AuthorView.createdAt
- в контракте — platform-support: поле AuthorView.files
- в контракте — platform-support: поле AuthorView.id
- в контракте — platform-support: поле AuthorView.message
- в контракте — platform-support: поле AuthorView.number
- в контракте — platform-support: поле AuthorView.state
- в контракте — platform-support: поле AuthorView.steps
- в контракте — platform-support: поле AuthorView.updatedAt
- в контракте — platform-support: поле File.id
- в контракте — platform-support: поле File.name
- в контракте — platform-support: поле File.purged
- в контракте — platform-support: поле File.size
- в контракте — platform-support: поле File.type
- в контракте — platform-support: поле Item.createdAt
- в контракте — platform-support: поле Item.excerpt
- в контракте — platform-support: поле Item.fresh
- в контракте — platform-support: поле Item.guest
- в контракте — platform-support: поле Item.id
- в контракте — platform-support: поле Item.number
- в контракте — platform-support: поле Item.state
- в контракте — platform-support: поле Item.updatedAt
- в контракте — platform-support: поле JournalEntry.at
- в контракте — platform-support: поле JournalEntry.code
- в контракте — platform-support: поле JournalEntry.durationMs
- в контракте — platform-support: поле JournalEntry.kind
- в контракте — platform-support: поле JournalEntry.message
- в контракте — platform-support: поле JournalEntry.method
- в контракте — platform-support: поле JournalEntry.path
- в контракте — platform-support: поле JournalEntry.status
- в контракте — platform-support: поле Message.text
- в контракте — platform-support: поле OperatorStep.actor
- в контракте — platform-support: поле OperatorStep.at
- в контракте — platform-support: поле OperatorStep.from
- в контракте — platform-support: поле OperatorStep.kind
- в контракте — platform-support: поле OperatorStep.side
- в контракте — platform-support: поле OperatorStep.text
- в контракте — platform-support: поле OperatorStep.to
- в контракте — platform-support: поле OperatorView.attachmentsExpired
- в контракте — platform-support: поле OperatorView.author
- в контракте — platform-support: поле OperatorView.closedAt
- в контракте — platform-support: поле OperatorView.createdAt
- в контракте — platform-support: поле OperatorView.email
- в контракте — platform-support: поле OperatorView.emailExpired
- в контракте — platform-support: поле OperatorView.erased
- в контракте — platform-support: поле OperatorView.files
- в контракте — platform-support: поле OperatorView.guest
- в контракте — platform-support: поле OperatorView.id
- в контракте — platform-support: поле OperatorView.journal
- в контракте — platform-support: поле OperatorView.journalExpired
- в контракте — platform-support: поле OperatorView.message
- в контракте — platform-support: поле OperatorView.number
- в контракте — platform-support: поле OperatorView.snapshot
- в контракте — platform-support: поле OperatorView.state
- в контракте — platform-support: поле OperatorView.steps
- в контракте — platform-support: поле OperatorView.updatedAt
- в контракте — platform-support: поле Page.items
- в контракте — platform-support: поле Page.page
- в контракте — platform-support: поле Page.size
- в контракте — platform-support: поле Page.total
- в контракте — platform-support: поле Policy.attachmentBytes
- в контракте — platform-support: поле Policy.attachmentTypes
- в контракте — platform-support: поле Policy.attachments
- в контракте — platform-support: поле Policy.guestIntake
- в контракте — platform-support: поле Policy.messageChars
- в контракте — platform-support: поле ProblemDetail.code
- в контракте — platform-support: поле ProblemDetail.detail
- в контракте — platform-support: поле ProblemDetail.instance
- в контракте — platform-support: поле ProblemDetail.status
- в контракте — platform-support: поле ProblemDetail.title
- в контракте — platform-support: поле ProblemDetail.type
- в контракте — platform-support: поле Snapshot.agent
- в контракте — platform-support: поле Snapshot.height
- в контракте — platform-support: поле Snapshot.language
- в контракте — platform-support: поле Snapshot.page
- в контракте — platform-support: поле Snapshot.version
- в контракте — platform-support: поле Snapshot.width
- в контракте — platform-support: поле StateChange.state
- в контракте — platform-support: поле Step.at
- в контракте — platform-support: поле Step.from
- в контракте — platform-support: поле Step.kind
- в контракте — platform-support: поле Step.side
- в контракте — platform-support: поле Step.text
- в контракте — platform-support: поле Step.to
- в контракте — platform-support: поле Submission.email
- в контракте — platform-support: поле Submission.journal
- в контракте — platform-support: поле Submission.message
- в контракте — platform-support: поле Submission.snapshot
- в контракте — platform-support: поле Submitted.id
- в контракте — platform-support: поле Submitted.number
- в контракте — platform-support: поле Unread.mine
- в контракте — platform-support: поле Unread.operator
- в контракте — platform-support: точка GET /api/support/operator/requests
- в контракте — platform-support: точка GET /api/support/operator/requests/{id}
- в контракте — platform-support: точка GET /api/support/operator/requests/{id}/files/{file}
- в контракте — platform-support: точка GET /api/support/policy
- в контракте — platform-support: точка GET /api/support/requests
- в контракте — platform-support: точка GET /api/support/requests/{id}
- в контракте — platform-support: точка GET /api/support/requests/{id}/files/{file}
- в контракте — platform-support: точка GET /api/support/unread
- в контракте — platform-support: точка POST /api/support/answer
- в контракте — platform-support: точка POST /api/support/operator/requests/{id}/messages
- в контракте — platform-support: точка POST /api/support/operator/requests/{id}/seen
- в контракте — platform-support: точка POST /api/support/operator/requests/{id}/state
- в контракте — platform-support: точка POST /api/support/requests
- в контракте — platform-support: точка POST /api/support/requests/{id}/messages
- в контракте — platform-support: точка POST /api/support/requests/{id}/seen
