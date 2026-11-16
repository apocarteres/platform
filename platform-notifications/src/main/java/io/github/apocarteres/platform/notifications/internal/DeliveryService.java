package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.notifications.Delivery;
import io.github.apocarteres.platform.notifications.DeliveryRun;
import io.github.apocarteres.platform.notifications.NotificationChannel;
import io.github.apocarteres.platform.notifications.NotificationDelivery;
import io.github.apocarteres.platform.notifications.internal.DeliveryStore.Claimed;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-NOTIFICATIONS-011, REQ-NOTIFICATIONS-013, REQ-NOTIFICATIONS-014
final class DeliveryService implements NotificationDelivery {

  static final Duration CLAIM = Duration.ofMinutes(5);
  static final int ATTEMPTS = 8;
  static final Duration LONGEST = Duration.ofHours(1);

  private static final Log LOG = LogFactory.getLog(DeliveryService.class);
  private static final Pattern NAME = Pattern.compile("[a-z][a-z0-9-]{0,31}");

  private final DeliveryStore store;
  private final Map<String, NotificationChannel> channels;
  private final TransactionTemplate apart;
  private final NotificationSettings settings;
  private final Clock clock;

  DeliveryService(DeliveryStore store, List<NotificationChannel> channels, TransactionTemplate apart, NotificationSettings settings,
    Clock clock) {
    this.store = store;
    this.channels = named(channels);
    this.apart = apart;
    this.settings = settings;
    this.clock = clock;
  }

  // REQ-NOTIFICATIONS-011
  private static Map<String, NotificationChannel> named(List<NotificationChannel> channels) {
    Map<String, NotificationChannel> named = new LinkedHashMap<>();
    for (NotificationChannel channel : channels) {
      String name = channel.name();
      if (name == null || !NAME.matcher(name).matches()) {
        throw new IllegalStateException("Канал уведомлений " + channel.getClass().getName() + ": имя «" + name
          + "» — строчные латинские буквы, цифры и дефис, до 32 знаков");
      }
      if (named.putIfAbsent(name, channel) != null) {
        throw new IllegalStateException("Канал уведомлений «" + name + "» объявлен дважды");
      }
    }
    return Map.copyOf(named);
  }

  // REQ-NOTIFICATIONS-012
  List<String> channels() {
    return List.copyOf(channels.keySet());
  }

  // REQ-NOTIFICATIONS-013
  @Override
  public DeliveryRun deliverPending() {
    if (channels.isEmpty()) {
      return new DeliveryRun(0, 0, 0, 0);
    }
    Instant now = clock.instant();
    List<Claimed> claimed = apart.execute(status -> store.claim(now, now.plus(CLAIM), settings.deliveryBatch()));
    int delivered = 0;
    int skipped = 0;
    int failed = 0;
    int postponed = 0;
    for (Claimed one : claimed == null ? List.<Claimed>of() : claimed) {
      Delivery delivery = attempt(one);
      switch (delivery.outcome()) {
        case DELIVERED -> delivered++;
        case SKIPPED -> skipped++;
        case FAILED -> failed++;
        case RETRY, LATER -> postponed++;
      }
      settle(one, delivery);
    }
    return new DeliveryRun(delivered, skipped, failed, postponed);
  }

  // REQ-NOTIFICATIONS-014
  private Delivery attempt(Claimed one) {
    NotificationChannel channel = channels.get(one.channel());
    if (channel == null) {
      LOG.warn("Доставка уведомления вида " + one.notice().kind() + ": канала «" + one.channel() + "» в службе нет — строка снята");
      return Delivery.skipped();
    }
    if (one.read()) {
      return Delivery.skipped();
    }
    try {
      Delivery delivery = channel.deliver(one.notice());
      return delivery == null ? Delivery.retry() : delivery;
    } catch (RuntimeException failure) {
      // REQ-NOTIFICATIONS-014
      LOG.warn("Канал «" + one.channel() + "» отказал на уведомлении вида " + one.notice().kind() + ": "
        + failure.getClass().getName());
      return Delivery.retry();
    }
  }

  // REQ-NOTIFICATIONS-014
  private void settle(Claimed one, Delivery delivery) {
    Instant now = clock.instant();
    switch (delivery.outcome()) {
      case DELIVERED, SKIPPED, FAILED -> apart.executeWithoutResult(status -> store.done(one.id()));
      case LATER -> apart.executeWithoutResult(status ->
        store.postpone(one.id(), one.notice().attempts(), now.plus(delivery.after() == null ? Duration.ofSeconds(1) : delivery.after())));
      case RETRY -> {
        int attempts = one.notice().attempts() + 1;
        if (attempts >= ATTEMPTS) {
          LOG.warn("Уведомление вида " + one.notice().kind() + " не доставлено каналом «" + one.channel() + "» за " + attempts
            + " попыток — строка снята");
          apart.executeWithoutResult(status -> store.done(one.id()));
        } else {
          Duration after = delivery.after() != null ? delivery.after() : backoff(attempts);
          apart.executeWithoutResult(status -> store.postpone(one.id(), attempts, now.plus(after)));
        }
      }
    }
  }

  // REQ-NOTIFICATIONS-014
  static Duration backoff(int attempts) {
    Duration after = Duration.ofMinutes(1L << Math.min(attempts - 1, 10));
    return after.compareTo(LONGEST) > 0 ? LONGEST : after;
  }
}
