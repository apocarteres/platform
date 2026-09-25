package io.github.apocarteres.platform.notifications;

import java.util.Map;
import java.util.UUID;

// REQ-NOTIFICATIONS-002, REQ-NOTIFICATIONS-006
public interface Notifications {

  // REQ-NOTIFICATIONS-002
  UUID notify(UUID account, String kind, Map<String, String> params, String link);

  // REQ-NOTIFICATIONS-006
  int purgeExpired();

  // REQ-NOTIFICATIONS-006
  int erase(UUID account);
}
