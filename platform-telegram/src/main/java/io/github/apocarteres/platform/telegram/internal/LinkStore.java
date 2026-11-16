package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-TELEGRAM-006, REQ-TELEGRAM-007, REQ-TELEGRAM-009, REQ-PERSISTENCE-001
final class LinkStore {

  record Link(long chat, Instant linkedAt) {
  }

  record Invite(UUID account, Instant expiresAt) {
  }

  private final JdbcClient jdbc;
  private final SqlCatalog sql;

  LinkStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  Optional<Link> find(UUID account) {
    return jdbc.sql(sql.get("link-by-account")).param("account", account)
      .query((row, index) -> new Link(row.getLong("chat_id"), row.getObject("linked_at", OffsetDateTime.class).toInstant()))
      .optional();
  }

  // REQ-TELEGRAM-007
  boolean insert(UUID account, long user, long chat, Instant now) {
    return jdbc.sql(sql.get("link-insert")).param("account", account).param("user", user).param("chat", chat)
      .param("now", StoredInstant.offsetOf(now)).update() == 1;
  }

  boolean delete(UUID account) {
    return jdbc.sql(sql.get("link-delete")).param("account", account).update() == 1;
  }

  // REQ-TELEGRAM-006
  void putInvite(UUID account, String digest, Instant expires) {
    jdbc.sql(sql.get("invite-put")).param("account", account).param("digest", digest)
      .param("expires", StoredInstant.offsetOf(expires)).update();
  }

  // REQ-TELEGRAM-007
  Optional<Invite> takeInvite(String digest) {
    return jdbc.sql(sql.get("invite-take")).param("digest", digest)
      .query((row, index) -> new Invite(row.getObject("account_id", UUID.class),
        row.getObject("expires_at", OffsetDateTime.class).toInstant()))
      .optional();
  }
}
