package io.github.apocarteres.platform.notifications.internal;

import io.github.apocarteres.platform.notifications.internal.NotificationViews.Notice;
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

// REQ-NOTIFICATIONS-001, REQ-PERSISTENCE-001
final class NotificationStore {

  private final JdbcClient jdbc;
  private final SqlCatalog sql;
  private final JsonMapper json = JsonMapper.builder().build();

  NotificationStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  void insert(UUID id, UUID account, String kind, Map<String, String> params, String link, Instant now) {
    jdbc.sql(sql.get("notification-insert")).param("id", id).param("account", account).param("kind", kind)
      .param("params", json.writeValueAsString(params)).param("link", link).param("now", StoredInstant.offsetOf(now)).update();
  }

  List<Notice> latest(UUID account, int limit) {
    return jdbc.sql(sql.get("notification-latest")).param("account", account).param("limit", limit).query((row, index) -> new Notice(
      row.getObject("id", UUID.class),
      row.getString("kind"),
      json.readValue(row.getString("params"), new TypeReference<Map<String, String>>() { }),
      row.getString("link"),
      row.getObject("created_at", OffsetDateTime.class).toInstant(),
      row.getObject("read_at", OffsetDateTime.class) != null
    )).list();
  }

  long unread(UUID account) {
    return jdbc.sql(sql.get("notification-unread")).param("account", account).query(Long.class).single();
  }

  boolean read(UUID id, UUID account, Instant now) {
    return jdbc.sql(sql.get("notification-read")).param("id", id).param("account", account)
      .param("now", StoredInstant.offsetOf(now)).update() == 1;
  }

  int readAll(UUID account, Instant now) {
    return jdbc.sql(sql.get("notification-read-all")).param("account", account).param("now", StoredInstant.offsetOf(now)).update();
  }

  int expire(Instant before) {
    return jdbc.sql(sql.get("notification-expire")).param("before", StoredInstant.offsetOf(before)).update();
  }

  int erase(UUID account) {
    return jdbc.sql(sql.get("notification-erase")).param("account", account).update();
  }
}
