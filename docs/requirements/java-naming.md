---
id: REQ-JAVA-NAMING
type: requirement
status: active
scope: backend, java
authority: normative
clause-id-prefix: REQ-JAVA-NAMING
related: REQ-PROJECT-RULES
---

# Java: имена типов и суффикс -er

[Карта требований](../REQUIREMENTS.md)

Документ нормативен для платформы и для всех проектов, подключивших пакет `@apocarteres/project-conventions`. Он не копируется в репозитории потребителей: пакет доставляет этот файл вместе с собой.

**Область действия: Java.** Правило опирается на объявления типов языка и на его словарь имён.

**Уровень требования: рекомендация.** Нарушение сообщается проверкой и не роняет её. Смысл уровня — в [правилах о правилах](project-rules.md).

## Правило

1. <a id="REQ-JAVA-NAMING-001"></a> **REQ-JAVA-NAMING-001** — Имя типа не оканчивается на `-er`, кроме имён из перечней ниже. Тип, названный по действию, обычно означает процедуру, переодетую в объект: у него нет собственного состояния, а есть один метод, и поведение просится в тот тип, над которым оно совершается.

## Имена образцов

2. <a id="REQ-JAVA-NAMING-002"></a> **REQ-JAVA-NAMING-002** — Разрешены имена классических образцов проектирования, где суффикс называет роль в известной схеме, а не действие: `Adapter`, `Builder`, `Compiler`, `Consumer`, `Controller`, `Decoder`, `Encoder`, `Filter`, `Forwarder`, `Handler`, `Listener`, `Loader`, `Mapper`, `Parser`, `Producer`, `Provider`, `Publisher`, `Reader`, `Resolver`, `Router`, `Runner`, `Scheduler`, `Serializer`, `Subscriber`, `Validator`, `Verifier`, `Worker`, `Writer`.

## Доменные существительные

3. <a id="REQ-JAVA-NAMING-003"></a> **REQ-JAVA-NAMING-003** — Разрешены существительные, которые оканчиваются на `-er` по строению языка, а не потому, что называют исполнителя: `Buffer`, `Cipher`, `Cluster`, `Container`, `Counter`, `Folder`, `Header`, `Layer`, `Manager`, `Marker`, `Member`, `Number`, `Offer`, `Order`, `Owner`, `Parameter`, `Peer`, `Register`, `Server`, `Trigger`, `User`, `Ver`, `Wrapper`.
4. <a id="REQ-JAVA-NAMING-004"></a> **REQ-JAVA-NAMING-004** — Перечни раздельны намеренно: они разрешают имена по разным причинам, и расширять их следует по соответствующей причине, а не одним списком исключений.

## Что проверяется

5. <a id="REQ-JAVA-NAMING-005"></a> **REQ-JAVA-NAMING-005** — Проверка охватывает объявления `class`, `interface`, `record` и `enum` в файлах `.java`. Имя сверяется с объединением перечней по окончанию.
6. <a id="REQ-JAVA-NAMING-006"></a> **REQ-JAVA-NAMING-006** — Существующие имена фиксируются храповиком и могут только убывать: переименование типа затрагивает всех его потребителей, поэтому выполняется по мере работы с ними, а не разом.
