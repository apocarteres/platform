package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.notifications.DeliveryNotice;
import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

// REQ-NOTIFICATIONS-012, REQ-NOTIFICATIONS-013, REQ-PERSISTENCE-001
final class DeliveryStore {

  record Claimed(long id, String channel, DeliveryNotice notice, boolean read) {
  }

  private final JdbcClient jdbc;
  private final SqlCatalog sql;
  private final JsonMapper json = JsonMapper.builder().build();

  DeliveryStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  // REQ-NOTIFICATIONS-012
  void enqueue(UUID notification, String channel, Instant now) {
    jdbc.sql(sql.get("delivery-enqueue")).param("notification", notification).param("channel", channel)
      .param("now", StoredInstant.offsetOf(now)).update();
  }

  // REQ-NOTIFICATIONS-013
  List<Claimed> claim(Instant now, Instant until, int limit) {
    return jdbc.sql(sql.get("delivery-claim")).param("now", StoredInstant.offsetOf(now)).param("until", StoredInstant.offsetOf(until))
      .param("limit", limit)
      .query((row, index) -> new Claimed(
        row.getLong("id"),
        row.getString("channel"),
        new DeliveryNotice(
          row.getObject("notification_id", UUID.class),
          row.getObject("account_id", UUID.class),
          row.getString("kind"),
          json.readValue(row.getString("params"), new TypeReference<Map<String, String>>() { }),
          row.getString("link"),
          row.getObject("created_at", OffsetDateTime.class).toInstant(),
          row.getInt("attempts")),
        row.getObject("read_at", OffsetDateTime.class) != null))
      .list();
  }

  void done(long id) {
    jdbc.sql(sql.get("delivery-done")).param("id", id).update();
  }

  // REQ-NOTIFICATIONS-014
  void postpone(long id, int attempts, Instant due) {
    jdbc.sql(sql.get("delivery-postpone")).param("id", id).param("attempts", attempts).param("due", StoredInstant.offsetOf(due)).update();
  }
}
