package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.KeyAccess;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-AUTH-028, REQ-AUTH-029, REQ-AUTH-033
record KeySettings(KeyAccess access, int maxDays, int maxPerAccount, int requestsPerMinute, int changesPerMinute) {

  static final String PREFIX = "platform.auth.keys.";

  static KeySettings of(Environment environment, KeyAccess access) {
    if (access == null) {
      throw new IllegalStateException("Ключи доступа включены настройкой " + PREFIX + "enabled, а бина KeyAccess нет:"
        + " объявите, какие точки открыты по ключу (REQ-AUTH-031) — безопасного умолчания у этого выбора нет");
    }
    Binder binder = Binder.get(environment);
    return new KeySettings(
      access,
      bounded(binder, "max-days", 365, 365),
      bounded(binder, "max-per-account", 10, 1000),
      bounded(binder, "requests-per-minute", 60, 100_000),
      bounded(binder, "changes-per-minute", 20, 100_000)
    );
  }

  private static int bounded(Binder binder, String key, int fallback, int max) {
    int value = binder.bind(PREFIX + key, Integer.class).orElse(fallback);
    if (value < 1 || value > max) {
      throw new IllegalStateException("Настройка " + PREFIX + key + ": " + value + " — допустимо от 1 до " + max);
    }
    return value;
  }
}
