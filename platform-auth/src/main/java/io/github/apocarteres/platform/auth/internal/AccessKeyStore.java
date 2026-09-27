package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AccessKey;
import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-AUTH-029, REQ-AUTH-030, REQ-AUTH-034
final class AccessKeyStore {

  record Found(UUID id, UUID account, String name) {
  }

  private final JdbcClient jdbc;
  private final SqlCatalog sql;

  AccessKeyStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  void insert(UUID account, AccessKey key, String digest) {
    jdbc.sql(sql.get("key-insert"))
      .param("id", key.id())
      .param("account", account)
      .param("name", key.name())
      .param("digest", digest)
      .param("now", StoredInstant.offsetOf(key.createdAt()))
      .param("expires", StoredInstant.offsetOf(key.expiresAt()))
      .update();
  }

  long active(UUID account, Instant now) {
    return jdbc.sql(sql.get("key-count")).param("account", account).param("now", StoredInstant.offsetOf(now)).query(Long.class).single();
  }

  List<AccessKey> list(UUID account) {
    return jdbc.sql(sql.get("key-list")).param("account", account)
      .query((row, index) -> new AccessKey(
        row.getObject("id", UUID.class),
        row.getString("name"),
        row.getObject("created_at", OffsetDateTime.class).toInstant(),
        row.getObject("expires_at", OffsetDateTime.class).toInstant(),
        Optional.ofNullable(row.getObject("last_used_at", OffsetDateTime.class)).map(OffsetDateTime::toInstant).orElse(null)))
      .list();
  }

  Optional<Found> find(String digest, Instant now) {
    return jdbc.sql(sql.get("key-by-digest")).param("digest", digest).param("now", StoredInstant.offsetOf(now))
      .query((row, index) -> new Found(row.getObject("id", UUID.class), row.getObject("account_id", UUID.class), row.getString("name")))
      .optional();
  }

  boolean delete(UUID account, UUID id) {
    return jdbc.sql(sql.get("key-delete")).param("account", account).param("id", id).update() > 0;
  }

  int deleteAll(UUID account) {
    return jdbc.sql(sql.get("key-delete-all")).param("account", account).update();
  }

  // REQ-AUTH-034
  void used(UUID id, Instant now, Instant threshold) {
    jdbc.sql(sql.get("key-used")).param("id", id).param("now", StoredInstant.offsetOf(now))
      .param("threshold", StoredInstant.offsetOf(threshold)).update();
  }

  // REQ-AUTH-034
  int purge(Instant before) {
    return jdbc.sql(sql.get("key-purge")).param("before", StoredInstant.offsetOf(before)).update();
  }
}
