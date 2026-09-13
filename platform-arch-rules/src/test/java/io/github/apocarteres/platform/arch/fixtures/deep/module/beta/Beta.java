package io.github.apocarteres.platform.arch.fixtures.deep.module.beta;

import io.github.apocarteres.platform.arch.fixtures.deep.module.gamma.Gamma;

public final class Beta {
  public String answer() {
    return new Gamma().name();
  }
}
