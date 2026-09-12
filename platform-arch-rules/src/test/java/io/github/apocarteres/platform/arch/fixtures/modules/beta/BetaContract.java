package io.github.apocarteres.platform.arch.fixtures.modules.beta;

import io.github.apocarteres.platform.arch.fixtures.modules.alpha.internal.AlphaWorker;

public final class BetaContract {
  public String ask() {
    return new AlphaWorker().work();
  }
}
