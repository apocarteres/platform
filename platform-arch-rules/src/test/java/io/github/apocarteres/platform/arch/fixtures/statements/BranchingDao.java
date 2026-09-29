package io.github.apocarteres.platform.arch.fixtures.statements;

import org.springframework.jdbc.core.simple.JdbcClient;

public final class BranchingDao {

  private final JdbcClient jdbc;

  public BranchingDao(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public int save(String title, boolean known) {
    if (known) {
      return jdbc.sql("UPDATE book SET title = :title").param("title", title).update();
    }
    return jdbc.sql("INSERT INTO book (title) VALUES (:title)").param("title", title).update();
  }
}
