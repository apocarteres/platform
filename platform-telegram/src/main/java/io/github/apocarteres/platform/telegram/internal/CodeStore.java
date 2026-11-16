package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-TELEGRAM-021, REQ-PERSISTENCE-001
final class CodeStore {

  record Code(String digest, Instant expiresAt) {
  }

  private final JdbcClient jdbc;
  private final SqlCatalog sql;

  CodeStore(JdbcClient jdbc, SqlCatalog sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  void put(UUID account, String digest, Instant expires) {
    jdbc.sql(sql.get("code-put")).param("account", account).param("digest", digest).param("expires", StoredInstant.offsetOf(expires))
      .update();
  }

  Optional<Code> take(UUID account) {
    return jdbc.sql(sql.get("code-take")).param("account", account)
      .query((row, index) -> new Code(row.getString("digest"), row.getObject("expires_at", OffsetDateTime.class).toInstant()))
      .optional();
  }
}
