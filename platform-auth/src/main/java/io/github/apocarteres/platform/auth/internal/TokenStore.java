package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-AUTH-004, REQ-AUTH-006, REQ-AUTH-013
final class TokenStore {

  enum Purpose { EMAIL_VERIFICATION, PASSWORD_RESET, EMAIL_CHANGE }

  // REQ-AUTH-023
  record PendingEmail(UUID account, String email) {
  }

  private static final SecureRandom RANDOM = new SecureRandom();

  private final JdbcClient jdbc;
  private final SqlCatalog sql;
  private final Clock clock;

  TokenStore(JdbcClient jdbc, SqlCatalog sql, Clock clock) {
    this.jdbc = jdbc;
    this.sql = sql;
    this.clock = clock;
  }

  String issue(UUID account, Purpose purpose, Duration ttl) {
    return issue(account, purpose, ttl, null);
  }

  // REQ-AUTH-023
  String issue(UUID account, Purpose purpose, Duration ttl, String email) {
    Instant now = clock.instant();
    jdbc.sql(sql.get("token-retire")).param("id", account).param("purpose", purpose.name())
      .param("now", StoredInstant.offsetOf(now)).update();
    byte[] raw = new byte[32];
    RANDOM.nextBytes(raw);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    jdbc.sql(sql.get("token-insert"))
      .param("digest", digest(token))
      .param("id", account)
      .param("purpose", purpose.name())
      .param("email", email)
      .param("now", StoredInstant.offsetOf(now))
      .param("expires", StoredInstant.offsetOf(now.plus(ttl)))
      .update();
    return token;
  }

  Optional<UUID> take(String token, Purpose purpose) {
    if (token == null || token.isBlank()) {
      return Optional.empty();
    }
    return jdbc.sql(sql.get("token-take"))
      .param("digest", digest(token))
      .param("purpose", purpose.name())
      .param("now", StoredInstant.offsetOf(clock))
      .query(UUID.class)
      .optional();
  }

  // REQ-AUTH-023
  Optional<PendingEmail> takeEmail(String token) {
    if (token == null || token.isBlank()) {
      return Optional.empty();
    }
    return jdbc.sql(sql.get("token-take-email"))
      .param("digest", digest(token))
      .param("now", StoredInstant.offsetOf(clock))
      .query((row, index) -> new PendingEmail(row.getObject("account_id", UUID.class), row.getString("email")))
      .optional();
  }

  Optional<Instant> latest(UUID account, Purpose purpose) {
    return Optional.ofNullable(jdbc.sql(sql.get("token-latest")).param("id", account).param("purpose", purpose.name())
      .query(OffsetDateTime.class).single()).map(OffsetDateTime::toInstant);
  }

  int purge(Instant before) {
    return jdbc.sql(sql.get("token-purge"))
      .param("now", StoredInstant.offsetOf(clock))
      .param("before", StoredInstant.offsetOf(before))
      .update();
  }

  static String digest(String token) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
