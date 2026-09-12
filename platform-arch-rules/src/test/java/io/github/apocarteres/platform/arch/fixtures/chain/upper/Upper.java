package io.github.apocarteres.platform.arch.fixtures.chain.upper;

import io.github.apocarteres.platform.arch.fixtures.chain.lower.Lower;

public final class Upper {
  public String ask() {
    return new Lower().answer();
  }
}
