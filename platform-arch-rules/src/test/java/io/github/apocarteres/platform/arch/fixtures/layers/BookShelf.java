package io.github.apocarteres.platform.arch.fixtures.layers;

import io.github.apocarteres.platform.arch.fixtures.storage.WriteResult;

public final class BookShelf {
  public boolean lend() {
    return new WriteResult().applied();
  }
}
