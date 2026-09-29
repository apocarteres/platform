package io.github.apocarteres.platform.arch.fixtures.statements;

import java.util.List;

public final class PagingService {

  private final OneStatementDao books;

  public PagingService(OneStatementDao books) {
    this.books = books;
  }

  public List<String> page(int size) {
    return books.count() == 0 ? List.of() : books.page(size);
  }
}
