package io.github.apocarteres.platform.arch.fixtures.deep.module.alpha;

import io.github.apocarteres.platform.arch.fixtures.deep.module.beta.Beta;

public final class Alpha {
  public String ask() {
    return new Beta().answer();
  }
}
