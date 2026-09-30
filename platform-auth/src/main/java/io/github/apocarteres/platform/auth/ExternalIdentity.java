package io.github.apocarteres.platform.auth;

import java.util.Set;
import java.util.regex.Pattern;

// REQ-AUTH-037, REQ-AUTH-039
public record ExternalIdentity(String kind, String id, Set<String> roles) {

  private static final Pattern KIND = Pattern.compile("[a-z][a-z0-9-]{0,31}");

  public ExternalIdentity {
    if (kind == null || !KIND.matcher(kind).matches()) {
      throw new IllegalArgumentException("Вид внешней личности — строчные латинские буквы, цифры и дефис, до 32 знаков: " + kind);
    }
    if (id == null || id.isBlank() || id.length() > 200) {
      throw new IllegalArgumentException("Идентификатор внешней личности — от 1 до 200 знаков");
    }
    roles = Set.copyOf(roles);
  }
}
