package io.github.apocarteres.platform.ratelimit;

import java.time.Duration;
import java.util.regex.Pattern;

// REQ-AUTH-011
public record RateLimit(String action, Duration window, int limit) {

  private static final Pattern ACTION = Pattern.compile("[a-z][a-z0-9-]*");

  public RateLimit {
    if (action == null || !ACTION.matcher(action).matches()) {
      throw new IllegalArgumentException("Имя действия ограничения: строчные буквы, цифры и дефис — " + action);
    }
    if (window == null || window.isNegative() || window.isZero()) {
      throw new IllegalArgumentException("Окно ограничения " + action + " должно быть положительным");
    }
    if (limit < 1) {
      throw new IllegalArgumentException("Предел ограничения " + action + " должен быть не меньше 1");
    }
  }
}
