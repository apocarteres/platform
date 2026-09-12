package io.github.apocarteres.platform.arch.fixtures.layers;

import org.springframework.transaction.annotation.Transactional;

public final class BookService {
  @Transactional
  public String lend() {
    return "деловая операция";
  }
}
