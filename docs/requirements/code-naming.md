---
id: REQ-CODE-NAMING
type: requirement
status: active
scope: backend
authority: normative
clause-id-prefix: REQ-CODE-NAMING
related: REQ-PROJECT-RULES
---

# Имена типов: суффикс -er

[Карта требований](../REQUIREMENTS.md)

Документ нормативен для платформы и для всех проектов, подключивших пакет `@apocarteres/project-conventions`. Он не копируется в репозитории потребителей: пакет доставляет этот файл вместе с собой.

**Уровень требования: рекомендация.** Нарушение сообщается проверкой и не роняет её. Смысл уровня — в [правилах о правилах](project-rules.md).

## Правило

1. <a id="REQ-CODE-NAMING-001"></a> **REQ-CODE-NAMING-001** — Имя типа не оканчивается на `-er`, кроме имён из перечней ниже. Тип, названный по действию, обычно означает процедуру, переодетую в объект: у него нет собственного состояния, а есть один метод, и поведение просится в тот тип, над которым оно совершается.

## Имена образцов

2. <a id="REQ-CODE-NAMING-002"></a> **REQ-CODE-NAMING-002** — Разрешены имена классических образцов проектирования, где суффикс называет роль в известной схеме, а не действие: `Adapter`, `Builder`, `Compiler`, `Consumer`, `Controller`, `Decoder`, `Encoder`, `Filter`, `Forwarder`, `Handler`, `Listener`, `Loader`, `Mapper`, `Parser`, `Producer`, `Provider`, `Publisher`, `Reader`, `Resolver`, `Router`, `Runner`, `Scheduler`, `Serializer`, `Subscriber`, `Validator`, `Verifier`, `Worker`, `Writer`.

## Доменные существительные

3. <a id="REQ-CODE-NAMING-003"></a> **REQ-CODE-NAMING-003** — Разрешены существительные, которые оканчиваются на `-er` по строению языка, а не потому, что называют исполнителя: `Buffer`, `Cipher`, `Cluster`, `Container`, `Counter`, `Folder`, `Header`, `Layer`, `Manager`, `Marker`, `Member`, `Number`, `Offer`, `Order`, `Owner`, `Parameter`, `Peer`, `Register`, `Server`, `Trigger`, `User`, `Ver`, `Wrapper`.
4. <a id="REQ-CODE-NAMING-004"></a> **REQ-CODE-NAMING-004** — Перечни раздельны намеренно: они разрешают имена по разным причинам, и расширять их следует по соответствующей причине, а не одним списком исключений.

## Что проверяется

5. <a id="REQ-CODE-NAMING-005"></a> **REQ-CODE-NAMING-005** — Проверка охватывает объявления `class`, `interface`, `record` и `enum` в файлах `.java`. Имя сверяется с объединением перечней по окончанию.
6. <a id="REQ-CODE-NAMING-006"></a> **REQ-CODE-NAMING-006** — Существующие имена фиксируются храповиком и могут только убывать: переименование типа затрагивает всех его потребителей, поэтому выполняется по мере работы с ними, а не разом.
