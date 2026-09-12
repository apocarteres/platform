package io.github.apocarteres.platform.arch.fixtures.modules.alpha;

import io.github.apocarteres.platform.arch.fixtures.modules.alpha.internal.AlphaWorker;

public final class AlphaContract {
  public String ask() {
    return new AlphaWorker().work();
  }
}
