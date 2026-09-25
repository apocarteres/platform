package io.github.apocarteres.platform.ratelimit.internal;

import java.util.Arrays;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-AUTH-027
record RateLimitSettings(int scale) {

  static final String KEY = "platform.rate-limit.scale";
  static final String PRODUCTION = "production";
  static final int MAX = 1000;

  private static final Log LOG = LogFactory.getLog(RateLimitSettings.class);

  static RateLimitSettings of(Environment environment) {
    int scale = Binder.get(environment).bind(KEY, Integer.class).orElse(1);
    if (scale < 1 || scale > MAX) {
      throw new IllegalStateException("Настройка " + KEY + ": " + scale + " — множитель пределов частоты от 1 до " + MAX);
    }
    if (scale > 1 && Arrays.asList(environment.getActiveProfiles()).contains(PRODUCTION)) {
      throw new IllegalStateException("Настройка " + KEY + ": " + scale + " в профиле " + PRODUCTION
        + " — множитель пределов служит стенду сценариев; рабочая среда держит пределы ядра");
    }
    if (scale > 1) {
      LOG.warn("Пределы частоты увеличены в " + scale + " раз настройкой " + KEY + ": так работает стенд сценариев, не рабочая среда");
    }
    return new RateLimitSettings(scale);
  }
}
