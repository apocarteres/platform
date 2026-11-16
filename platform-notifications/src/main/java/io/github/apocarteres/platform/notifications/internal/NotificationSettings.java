package io.github.apocarteres.platform.notifications.internal;

import java.time.Duration;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-NOTIFICATIONS-004, REQ-NOTIFICATIONS-006, REQ-NOTIFICATIONS-013
record NotificationSettings(Duration keep, int listSize, int deliveryBatch) {

  static final String PREFIX = "platform.notifications.";
  static final int LIST_MAX = 50;
  static final int BATCH_MAX = 100;

  static NotificationSettings of(Environment environment) {
    Binder binder = Binder.get(environment);
    Duration keep = binder.bind(PREFIX + "keep", Duration.class).orElse(Duration.ofDays(90));
    if (keep.isNegative() || keep.isZero()) {
      throw refused("keep", keep + ": срок хранения должен быть положительным — бессрочного хранения нет");
    }
    int size = binder.bind(PREFIX + "list-size", Integer.class).orElse(20);
    if (size < 1 || size > LIST_MAX) {
      throw refused("list-size", size + ": список колокольчика — от 1 до " + LIST_MAX);
    }
    // REQ-NOTIFICATIONS-013
    int batch = binder.bind(PREFIX + "delivery.batch", Integer.class).orElse(25);
    if (batch < 1 || batch > BATCH_MAX) {
      throw refused("delivery.batch", batch + ": пачка доставки — от 1 до " + BATCH_MAX);
    }
    return new NotificationSettings(keep, size, batch);
  }

  private static IllegalStateException refused(String key, String reason) {
    return new IllegalStateException("Настройка " + PREFIX + key + ": " + reason);
  }
}
