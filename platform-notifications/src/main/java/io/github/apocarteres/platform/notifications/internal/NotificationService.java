package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.notifications.Notifications;
import io.github.apocarteres.platform.notifications.internal.NotificationStore.Stored;
import java.time.Clock;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;

// REQ-NOTIFICATIONS-002, REQ-NOTIFICATIONS-003, REQ-NOTIFICATIONS-006, REQ-NOTIFICATIONS-010
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
    kind(kind);
    Map<String, String> kept = params(params);
    link(link);
    UUID id = UUID.randomUUID();
    store.insert(id, account, kind, kept, link, clock.instant());
    return id;
  }

  // REQ-NOTIFICATIONS-010
  @Override
  public int revise(String kind, String link, UnaryOperator<Map<String, String>> change) {
    kind(kind);
    if (link == null) {
      throw new IllegalArgumentException("Правка уведомлений называет ссылку: link не назван");
    }
    link(link);
    if (change == null) {
      throw new IllegalArgumentException("Правка уведомлений: change не назван");
    }
    List<Stored> found = store.ofLink(kind, link);
    Map<UUID, Map<String, String>> revised = new LinkedHashMap<>();
    for (Stored stored : found) {
      Map<String, String> after = change.apply(Collections.unmodifiableMap(new LinkedHashMap<>(stored.params())));
      if (after == null) {
        revised.put(stored.id(), null);
      } else {
        Map<String, String> kept = params(after);
        if (!kept.equals(stored.params())) {
          revised.put(stored.id(), kept);
        }
      }
    }
    revised.forEach((id, params) -> {
      if (params == null) {
        store.withdraw(id);
      } else {
        store.revise(id, params);
      }
    });
    return revised.size();
  }

  private static void kind(String kind) {
    if (kind == null || kind.length() > 64 || !KIND.matcher(kind).matches()) {
      throw new IllegalArgumentException("Вид уведомления «" + kind + "»: строчные буквы и цифры с точкой или дефисом, до 64 знаков");
    }
  }

  private static Map<String, String> params(Map<String, String> params) {
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
    return kept;
  }

  private static void link(String link) {
    if (link != null && (link.length() > LINK_CHARS || !link.startsWith("/") || link.startsWith("//") || CONTROL.matcher(link).find())) {
      throw new IllegalArgumentException("Ссылка уведомления — путь сайта от корня, до " + LINK_CHARS + " знаков: " + link);
    }
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
