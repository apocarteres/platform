package io.github.apocarteres.platform.arch.fixtures.ring.right;

import io.github.apocarteres.platform.arch.fixtures.ring.left.LeftSide;

final class LeftSideHolder {
  private LeftSideHolder() {
  }

  static String name() {
    return LeftSide.class.getSimpleName();
  }
}
