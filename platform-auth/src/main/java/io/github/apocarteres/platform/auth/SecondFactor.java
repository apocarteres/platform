package io.github.apocarteres.platform.auth;

import java.util.UUID;

// REQ-AUTH-041
public interface SecondFactor {

  boolean required(Account account);

  boolean verify(UUID account, String code);
}
