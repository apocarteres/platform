---
id: RUN-CORE-AUTH-CONTRACT
type: runbook
status: active
scope: api, backend
authority: supporting
related: REQ-AUTH
---
# Контракт аутентификации ядра в спецификации проекта

[Инструкции](INDEX.md) · [REQ-AUTH](../requirements/auth.md)

Ядро описывает свои точки контрактом `platform-auth.openapi.json`
(`REQ-AUTH-020`). Он лежит в `platform-auth` (`classpath:openapi/`) и в
`@apocarteres/auth` (`node_modules/@apocarteres/auth/openapi/`). Код из него не
генерируется: проект подключает контракт в свою спецификацию только для
описания.

## Спецификация пишется первой (openapi-generator)

Генерация идёт из спецификации проекта, как прежде. Точки ядра в неё не
входят, иначе генератор создаст интерфейсы, которые столкнутся с контроллером
ядра. Описание для людей и клиентов собирается отдельным файлом, который
ссылается и на свою спецификацию, и на контракт ядра:

```yaml
# docs/openapi/published.yaml — для описания; генерация идёт из zavpn-api.yaml
openapi: 3.1.0
info: { title: zavpn, version: 1.0.0 }
paths:
  /api/auth/login:
    $ref: '../../frontend/node_modules/@apocarteres/auth/openapi/platform-auth.openapi.json#/paths/~1api~1auth~1login'
  # ... остальные точки ядра так же
components:
  schemas:
    ZavpnProfile:
      type: object
      properties: { displayName: { type: string, maxLength: 40 } }
    RegisterRequest:
      allOf:
        - $ref: '../../frontend/node_modules/@apocarteres/auth/openapi/platform-auth.openapi.json#/components/schemas/RegisterRequest'
        - properties: { profile: { $ref: '#/components/schemas/ZavpnProfile' } }
```

## Спецификация строится из кода (springdoc)

`springdoc` видит контроллер ядра сам, но без кодов отказов. Дополните
описание контрактом:

```java
@Bean
OpenApiCustomizer coreAuthContract(ObjectMapper json) throws IOException {
  try (InputStream source = getClass().getResourceAsStream("/openapi/platform-auth.openapi.json")) {
    OpenAPI core = Json31.mapper().readValue(source, OpenAPI.class);
    return api -> {
      core.getPaths().forEach(api.getPaths()::addPathItem);
      core.getComponents().getSchemas().forEach(api.getComponents()::addSchemas);
    };
  }
}
```

Профиль проекта в описании — схема `RegisterRequest.profile`, заменённая своей.

## Типы на клиенте

`@apocarteres/auth` экспортирует типы контракта: `Account`, `Policy`,
`RegisterRequest` и прочие. Профиль передаётся своим типом:
`session.register<ZavpnProfile>(email, password, profile)`.
