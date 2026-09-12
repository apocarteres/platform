package io.github.apocarteres.platform.arch.fixtures.layers;

import io.github.apocarteres.platform.arch.fixtures.storage.Statements;

public final class BookCatalogue {
  public String read() {
    return new Statements().sql("books/find");
  }
}
