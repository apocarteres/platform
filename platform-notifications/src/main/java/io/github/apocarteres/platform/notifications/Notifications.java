package io.github.apocarteres.platform.notifications;

import java.util.Map;
import java.util.UUID;
import java.util.function.UnaryOperator;

// REQ-NOTIFICATIONS-002, REQ-NOTIFICATIONS-006, REQ-NOTIFICATIONS-010
public interface Notifications {

  // REQ-NOTIFICATIONS-002
  UUID notify(UUID account, String kind, Map<String, String> params, String link);

  // REQ-NOTIFICATIONS-010
  int revise(String kind, String link, UnaryOperator<Map<String, String>> change);

  // REQ-NOTIFICATIONS-006
  int purgeExpired();

  // REQ-NOTIFICATIONS-006
  int erase(UUID account);
}
