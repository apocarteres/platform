package io.github.apocarteres.platform.arch.fixtures.layers;

import org.springframework.transaction.annotation.Transactional;

public final class BookDao {
  @Transactional
  public String readAndWrite() {
    return "две команды под одной транзакцией";
  }
}
