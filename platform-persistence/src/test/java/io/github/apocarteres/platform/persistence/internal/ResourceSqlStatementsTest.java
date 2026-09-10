package io.github.apocarteres.platform.persistence.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.apocarteres.platform.persistence.SqlStatements;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;

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
  @DisplayName("Повторяющееся имя запроса в двух корнях classpath — отказ")
  void rejectsDuplicateStatementName(@TempDir Path secondRoot) throws Exception {
    var directory = secondRoot.resolve("sql/loader-valid");
    Files.createDirectories(directory);
    Files.writeString(directory.resolve("count-players.sql"), "select count(*) from other\n");
    var classpath = new URLClassLoader(new URL[] {secondRoot.toUri().toURL()}, getClass().getClassLoader());
    var duplicated = new ResourceSqlStatements(new DefaultResourceLoader(classpath));

    assertThatThrownBy(() -> duplicated.catalog("loader-valid"))
      .isInstanceOf(IllegalStateException.class)
      .hasMessageContaining("Duplicate SQL statement")
      .hasMessageContaining("count-players.sql");
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
