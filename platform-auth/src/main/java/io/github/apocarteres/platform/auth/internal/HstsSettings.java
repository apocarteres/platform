package io.github.apocarteres.platform.auth.internal;

import java.time.Duration;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-AUTH-036
record HstsSettings(boolean enabled, Duration maxAge, boolean includeSubDomains) {

  static final String PREFIX = "platform.auth.headers.hsts.";

  private static final Log LOG = LogFactory.getLog(HstsSettings.class);

  static HstsSettings of(Environment environment) {
    Binder binder = Binder.get(environment);
    boolean enabled = binder.bind(PREFIX + "enabled", Boolean.class).orElse(true);
    Duration maxAge = binder.bind(PREFIX + "max-age", Duration.class).orElse(Duration.ofDays(365));
    if (maxAge.isNegative()) {
      throw new IllegalStateException("Настройка " + PREFIX + "max-age: " + maxAge + " — срок HSTS не бывает отрицательным");
    }
    if (!enabled) {
      LOG.warn("Заголовок Strict-Transport-Security ядро не ставит (" + PREFIX + "enabled=false): его должен ставить прокси перед службой");
    }
    return new HstsSettings(enabled, maxAge, binder.bind(PREFIX + "include-sub-domains", Boolean.class).orElse(true));
  }
}
