package io.github.apocarteres.platform.arch.fixtures.hidden;

import org.springframework.context.annotation.Lazy;

public final class HiddenRing {

  private final Object other;

  public HiddenRing(@Lazy Object other) {
    this.other = other;
  }

  public Object other() {
    return other;
  }
}
