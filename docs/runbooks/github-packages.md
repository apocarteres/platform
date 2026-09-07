---
id: RUN-GITHUB-PACKAGES
type: runbook
status: active
scope: build, delivery
authority: supporting
related: REQ-PUBLISHING
---

# GitHub Packages: публикация ядра и подключение потребителя

[Каталог инструкций](INDEX.md) · [Требование](../requirements/publishing.md)

## Публикация новой версии

1. Убедиться, что `main` собран и `ci` зелёный.
2. Поставить и отправить тег с версией по semver:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

3. Workflow `publish` подставит версию из тега в Maven (`-Drevision`) и npm (`npm version`) и опубликует артефакты. Токен `GITHUB_TOKEN` workflow имеет право записи в пакеты этого репозитория, отдельных секретов не требуется.
4. Проверить в разделе Packages репозитория `apocarteres/platform`, что появились `platform-parent`, `platform-bom`, `platform-persistence` и `@apocarteres/project-conventions` нужной версии.

Ошибочный тег нельзя перепубликовать под тем же номером: GitHub Packages не принимает повторную версию. Выпустить следующий patch.

## Подключение потребителя: Maven

Нужен личный токен GitHub (classic PAT) с правом `read:packages`. Токен хранится только в `~/.m2/settings.xml` разработчика и в секрете CI, никогда в репозитории проекта.

`~/.m2/settings.xml`:

```xml
<settings>
  <servers>
    <server>
      <id>github-platform</id>
      <username>GITHUB_LOGIN</username>
      <password>TOKEN_READ_PACKAGES</password>
    </server>
  </servers>
</settings>
```

`pom.xml` проекта:

```xml
<repositories>
  <repository>
    <id>github-platform</id>
    <url>https://maven.pkg.github.com/apocarteres/platform</url>
  </repository>
</repositories>

<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>io.github.apocarteres.platform</groupId>
      <artifactId>platform-bom</artifactId>
      <version>0.1.0</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>

<dependencies>
  <dependency>
    <groupId>io.github.apocarteres.platform</groupId>
    <artifactId>platform-persistence</artifactId>
  </dependency>
</dependencies>
```

В CI потребителя тот же `settings.xml` создаётся шагом перед сборкой из секрета репозитория; `actions/setup-java` умеет это через параметры `server-id`, `server-username`, `server-password`.

Проверка из чистого окружения:

```bash
mvn -q dependency:get -DremoteRepositories=github-platform::::https://maven.pkg.github.com/apocarteres/platform -Dartifact=io.github.apocarteres.platform:platform-bom:0.1.0:pom
```

## Подключение потребителя: npm

`.npmrc` в корне проекта, коммитится, токена не содержит:

```
@apocarteres:registry=https://npm.pkg.github.com
```

`~/.npmrc` разработчика, не коммитится:

```
//npm.pkg.github.com/:_authToken=TOKEN_READ_PACKAGES
```

В CI токен передаётся переменной `NODE_AUTH_TOKEN` при `registry-url` в `actions/setup-node`. Установка:

```bash
npm install --save-dev @apocarteres/project-conventions@0.1.0
```

## Проверка канала из чистого окружения

Проверяет то, что не видно с рабочей машины: инструкция полна, а пакеты читаются
без сохранённых локально учётных данных. Токен передаётся переменной окружения,
в команду и в образ он не попадает.

```bash
export GH_TOKEN=... # личный токен с правом read:packages
docker run --rm -i -e GH_TOKEN maven:3.9-eclipse-temurin-21 sh -s <<'EOF'
printf '<settings><servers><server><id>github-platform</id><username>apocarteres</username><password>%s</password></server></servers></settings>' "$GH_TOKEN" > /root/.m2/settings.xml
mvn -B -q -ntp dependency:get -DremoteRepositories=github-platform::::https://maven.pkg.github.com/apocarteres/platform -Dartifact=io.github.apocarteres.platform:platform-bom:0.1.0:pom
EOF
```

```bash
docker run --rm -i -e GH_TOKEN node:24-alpine sh -s <<'EOF'
mkdir -p /work && cd /work
printf '@apocarteres:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$GH_TOKEN" > .npmrc
echo '{"name":"consumer","version":"1.0.0","private":true}' > package.json
npm install --no-audit --no-fund @apocarteres/project-conventions@0.1.0
EOF
```

Полная проверка добавляет к первой команде сборку потребителя с импортом BOM:
так подтверждается, что starter подключается без указания версии. Пример
такого `pom.xml` — в разделе выше.

## Отзыв и ротация токена

Токен `read:packages` даёт чтение всех пакетов, доступных аккаунту. При утечке отозвать его в настройках GitHub, выпустить новый, обновить `~/.m2/settings.xml`, `~/.npmrc` и секреты CI потребителей. Пакеты перепубликовывать не нужно.
