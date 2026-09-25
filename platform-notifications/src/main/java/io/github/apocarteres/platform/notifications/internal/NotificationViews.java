package io.github.apocarteres.platform.notifications.internal;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// REQ-NOTIFICATIONS-003, REQ-NOTIFICATIONS-004
final class NotificationViews {

  record Notice(UUID id, String kind, Map<String, String> params, String link, Instant createdAt, boolean read) {
  }

  record Bell(List<Notice> items, long unread) {
  }

  record Unread(long count) {
  }

  private NotificationViews() {
  }
}
