package io.github.apocarteres.platform.arch.fixtures.statements;

import org.springframework.jdbc.core.JdbcTemplate;

public final class TemplateDao {

  private final JdbcTemplate jdbc;

  public TemplateDao(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public int replace(String title) {
    jdbc.update("DELETE FROM book WHERE title = ?", title);
    return jdbc.update("INSERT INTO book (title) VALUES (?)", title);
  }
}
