---
id: CORE-OPS-055
type: ticket
status: backlog
scope: tooling, release
authority: supporting
priority: P0
release: RELEASE-1-26-0
related: REQ-RELEASE, REQ-PROJECT-PROCESS
---

# Судьба выпуска зависела от порядка задач в заголовке

## Проблема

`ticketOf` возвращает одну задачу — первую в заголовке. Коммит, закрывающий две
задачи одной работой, рассматривается только по первой; вторая не учитывается,
даже если она в составе выпуска.

Значит порядок слов в заголовке решает, пройдёт закрытие или нет. Ни
`REQ-RELEASE-036`, ни `REQ-PROJECT-PROCESS-023` не требуют ровно одной задачи и
ничего не говорят о порядке.

## Чем подтверждено

Заявка потребителя [issue #20](https://github.com/apocarteres/platform/issues/20),
задача потребителя `ZAVPN-QUAL-080`. Проба на разборе ядра:

```
ZAVPN-QUAL-080 ZAVPN-QUAL-081 ...  ->  проверка видит ZAVPN-QUAL-080
ZAVPN-QUAL-081 ZAVPN-QUAL-080 ...  ->  проверка видит ZAVPN-QUAL-081
```

## Что делать

Коммит принадлежит составу, если хотя бы одна из названных задач в составе.

## Откуда пришла задача

Заявка потребителя [issue #20](https://github.com/apocarteres/platform/issues/20).
