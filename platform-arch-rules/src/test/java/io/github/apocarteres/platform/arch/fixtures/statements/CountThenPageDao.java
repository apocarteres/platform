package io.github.apocarteres.platform.arch.fixtures.statements;

import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;

public final class CountThenPageDao {

  private final JdbcClient jdbc;

  public CountThenPageDao(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public List<String> page(int size) {
    long total = jdbc.sql("SELECT count(*) FROM book").query(Long.class).single();
    return total == 0 ? List.of() : jdbc.sql("SELECT title FROM book LIMIT :size").param("size", size).query(String.class).list();
  }
}
