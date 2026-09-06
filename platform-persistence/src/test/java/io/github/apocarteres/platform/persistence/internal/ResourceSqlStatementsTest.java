package io.github.apocarteres.platform.persistence.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.persistence.SqlStatements;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;

/**
 * Все виды отказа загрузчика обнаруживаются при первом обращении к каталогу,
 * а не превращаются в отказ драйвера во время работы.
 */
class ResourceSqlStatementsTest {

  private final SqlStatements statements = new ResourceSqlStatements(new DefaultResourceLoader());

  @Test
  @DisplayName("Каталог загружается, запросы доступны по имени файла")
  void loadsStatementsByFileName() {
    var catalog = statements.catalog("loader-valid");

    assertThat(catalog.get("count-players")).contains("count(*)");
    assertThat(catalog.get("exists-by-email")).contains("exists(");
  }

  @Test
  @DisplayName("Один и тот же каталог не читается дважды, имя нормализуется")
  void cachesCatalogPerDirectory() {
    assertThat(statements.catalog("loader-valid"))
      .isSameAs(statements.catalog("loader-valid"))
      .isSameAs(statements.catalog("/loader-valid/"))
      .isSameAs(statements.catalog("\\loader-valid"));
  }

  @Test
  @DisplayName("Отсутствующий каталог — отказ, а не пустой каталог")
  void rejectsMissingDirectory() {
    assertThatThrownBy(() -> statements.catalog("loader-does-not-exist"))
      .isInstanceOf(IllegalStateException.class)
      .hasMessageContaining("does not exist or is empty");
  }

  @Test
  @DisplayName("Пустой файл запроса — отказ")
  void rejectsEmptyStatementFile() {
    assertThatThrownBy(() -> statements.catalog("loader-empty-file"))
      .isInstanceOf(IllegalStateException.class)
      .hasMessageContaining("SQL statement is empty");
  }

  @Test
  @DisplayName("Неизвестное имя запроса — отказ с перечнем доступных")
  void rejectsUnknownStatementName() {
    var catalog = statements.catalog("loader-valid");

    assertThatThrownBy(() -> catalog.get("no-such-statement"))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("no-such-statement")
      .hasMessageContaining("count-players");
  }

  @Test
  @DisplayName("Имя каталога проверяется: обход по дереву и пустое имя запрещены")
  void rejectsSuspiciousDirectoryName() {
    for (var name : new String[] {"../secrets", "  ", "a//b", null}) {
      assertThatThrownBy(() -> statements.catalog(name))
        .as("directory %s", name)
        .isInstanceOf(IllegalArgumentException.class);
    }
  }
}
