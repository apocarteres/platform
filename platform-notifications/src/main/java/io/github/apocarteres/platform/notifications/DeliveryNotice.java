package io.github.apocarteres.platform.notifications;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

// REQ-NOTIFICATIONS-011
public record DeliveryNotice(UUID id, UUID account, String kind, Map<String, String> params, String link, Instant createdAt,
  int attempts) {

  public DeliveryNotice {
    params = Map.copyOf(params);
  }
}
