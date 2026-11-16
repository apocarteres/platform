package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-TELEGRAM-006, REQ-TELEGRAM-007, REQ-TELEGRAM-009, REQ-PERSISTENCE-001
final class LinkStore {

  record Link(String bot, long chat, Instant linkedAt, String language) {
  }

  record Invite(UUID account, Instant expiresAt) {
  }

  private final JdbcClient jdbc;
  private final SqlCatalog sql;

  LinkStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  List<Link> all(UUID account) {
    return jdbc.sql(sql.get("link-by-account")).param("account", account).query(LinkStore::link).list();
  }

  Optional<Link> find(UUID account, String bot) {
    return jdbc.sql(sql.get("link-one")).param("account", account).param("bot", bot).query(LinkStore::link).optional();
  }

  private static Link link(ResultSet row, int index) throws SQLException {
    return new Link(row.getString("bot"), row.getLong("chat_id"), row.getObject("linked_at", OffsetDateTime.class).toInstant(),
      row.getString("language"));
  }

  // REQ-TELEGRAM-007
  boolean insert(UUID account, String bot, long user, long chat, String language, Instant now) {
    return jdbc.sql(sql.get("link-insert")).param("account", account).param("bot", bot).param("user", user).param("chat", chat)
      .param("language", language).param("now", StoredInstant.offsetOf(now)).update() == 1;
  }

  boolean delete(UUID account, String bot) {
    return jdbc.sql(sql.get("link-delete")).param("account", account).param("bot", bot).update() == 1;
  }

  // REQ-TELEGRAM-006
  void putInvite(UUID account, String bot, String digest, Instant expires) {
    jdbc.sql(sql.get("invite-put")).param("account", account).param("bot", bot).param("digest", digest)
      .param("expires", StoredInstant.offsetOf(expires)).update();
  }

  // REQ-TELEGRAM-007
  Optional<Invite> takeInvite(String bot, String digest) {
    return jdbc.sql(sql.get("invite-take")).param("bot", bot).param("digest", digest)
      .query((row, index) -> new Invite(row.getObject("account_id", UUID.class),
        row.getObject("expires_at", OffsetDateTime.class).toInstant()))
      .optional();
  }
}
