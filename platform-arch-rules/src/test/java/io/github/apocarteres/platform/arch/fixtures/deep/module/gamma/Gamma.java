package io.github.apocarteres.platform.arch.fixtures.deep.module.gamma;

import io.github.apocarteres.platform.arch.fixtures.deep.module.alpha.Alpha;

public final class Gamma {
  public String name() {
    return Alpha.class.getSimpleName();
  }
}
