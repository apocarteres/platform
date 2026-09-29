package io.github.apocarteres.platform.arch.fixtures.statements;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

public final class OneStatementDao {

  private final JdbcClient jdbc;
  private final JdbcTemplate template;

  public OneStatementDao(JdbcClient jdbc, JdbcTemplate template) {
    this.jdbc = jdbc;
    this.template = template;
  }

  public long count() {
    return jdbc.sql("SELECT count(*) FROM book").query(Long.class).single();
  }

  public List<String> page(int size) {
    return jdbc.sql("SELECT title FROM book LIMIT :size").param("size", size).query(String.class).list();
  }

  public int remove(String title) {
    return template.update("DELETE FROM book WHERE title = ?", title);
  }
}
