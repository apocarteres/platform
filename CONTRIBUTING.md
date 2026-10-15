# Contributing

## English

**Reports.** A defect of the core, or a rule your project ran into, is an issue
filed with the "Заявка потребителя ядра" template. It carries the core version,
what confirms the finding, a link to your own ticket, and the expected result.
An unconfirmed finding is marked as a hypothesis. The rules are in
`REQ-ADOPTION-019` and `REQ-ADOPTION-020` ([adoption](docs/requirements/adoption.md)):
an issue gets an answer before the next core release is closed. The answer is
a core ticket that links back to the issue, or a refusal with a reason. Do not
comment on a closed issue; open a new one that links to it
(`REQ-ADOPTION-025`).

**Changes.** The core is developed through its own release cycle: tickets in
`docs/tickets`, requirements in `docs/requirements`, a test written before the
change, and the full `mise run verify` before a release tag. Please start with
an issue before a pull request, so the change gets a ticket and a requirement.
Documentation is written in Russian; names of technologies, identifiers and
commands stay in English.

Security issues are reported privately; see [SECURITY.md](SECURITY.md).

## Русский

**Заявки.** Дефект ядра или правило, в которое упёрся проект, — заявка в
issues по шаблону «Заявка потребителя ядра». В заявке: версия ядра, чем
подтверждена находка, ссылка на свою задачу и ожидаемый результат.
Неподтверждённая находка обозначается гипотезой. Порядок —
`REQ-ADOPTION-019` и `REQ-ADOPTION-020` ([подключение](docs/requirements/adoption.md)):
заявка получает ответ до закрытия следующего выпуска ядра. Ответ — задача
ядра со ссылкой на заявку либо отказ с причиной. Закрытую заявку не
комментируйте: заведите новую со ссылкой на исходную (`REQ-ADOPTION-025`).

**Изменения.** Ядро развивается своим циклом выпуска: задачи — в
`docs/tickets`, требования — в `docs/requirements`, тест пишется до
изменения, полный `mise run verify` проходит до тега выпуска. Перед
pull request заведите заявку: изменение получит задачу и требование.
Документация пишется на русском; названия технологий, идентификаторы и
команды остаются английскими.

Об уязвимостях сообщайте закрыто, см. [SECURITY.md](SECURITY.md).
