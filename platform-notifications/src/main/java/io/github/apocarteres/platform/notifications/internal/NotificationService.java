package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.notifications.Notifications;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

// REQ-NOTIFICATIONS-002, REQ-NOTIFICATIONS-003, REQ-NOTIFICATIONS-006
final class NotificationService implements Notifications {

  static final int PARAMS = 20;
  static final int VALUE_CHARS = 200;
  static final int LINK_CHARS = 500;

  private static final Pattern KIND = Pattern.compile("[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*");
  private static final Pattern KEY = Pattern.compile("[a-zA-Z][a-zA-Z0-9]{0,31}");
  private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");

  private final NotificationStore store;
  private final NotificationSettings settings;
  private final Clock clock;

  NotificationService(NotificationStore store, NotificationSettings settings, Clock clock) {
    this.store = store;
    this.settings = settings;
    this.clock = clock;
  }

  // REQ-NOTIFICATIONS-002, REQ-NOTIFICATIONS-003
  @Override
  public UUID notify(UUID account, String kind, Map<String, String> params, String link) {
    if (account == null) {
      throw new IllegalArgumentException("Уведомление принадлежит учётной записи: account не назван");
    }
    if (kind == null || kind.length() > 64 || !KIND.matcher(kind).matches()) {
      throw new IllegalArgumentException("Вид уведомления «" + kind + "»: строчные буквы и цифры с точкой или дефисом, до 64 знаков");
    }
    Map<String, String> kept = new LinkedHashMap<>();
    if (params != null) {
      if (params.size() > PARAMS) {
        throw new IllegalArgumentException("Параметров уведомления больше " + PARAMS);
      }
      params.forEach((key, value) -> {
        if (key == null || !KEY.matcher(key).matches()) {
          throw new IllegalArgumentException("Имя параметра «" + key + "»: латиница и цифры, до 32 знаков");
        }
        if (value == null || value.length() > VALUE_CHARS || CONTROL.matcher(value).find()) {
          throw new IllegalArgumentException("Параметр " + key + ": строка до " + VALUE_CHARS + " знаков без управляющих");
        }
        kept.put(key, value);
      });
    }
    if (link != null && (link.length() > LINK_CHARS || !link.startsWith("/") || link.startsWith("//") || CONTROL.matcher(link).find())) {
      throw new IllegalArgumentException("Ссылка уведомления — путь сайта от корня, до " + LINK_CHARS + " знаков: " + link);
    }
    UUID id = UUID.randomUUID();
    store.insert(id, account, kind, kept, link, clock.instant());
    return id;
  }

  // REQ-NOTIFICATIONS-006
  @Override
  public int purgeExpired() {
    return store.expire(clock.instant().minus(settings.keep()));
  }

  // REQ-NOTIFICATIONS-006
  @Override
  public int erase(UUID account) {
    return store.erase(account);
  }
}
