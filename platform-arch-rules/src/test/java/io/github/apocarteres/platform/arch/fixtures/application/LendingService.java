package io.github.apocarteres.platform.arch.fixtures.application;

import org.springframework.transaction.annotation.Transactional;

public final class LendingService {

  @Transactional
  public String lend() {
    return "деловая операция целиком";
  }
}
