package io.github.apocarteres.platform.arch.fixtures.ring.left;

import io.github.apocarteres.platform.arch.fixtures.ring.right.RightSide;

public final class LeftSide {
  public String ask() {
    return new RightSide().answer();
  }
}
