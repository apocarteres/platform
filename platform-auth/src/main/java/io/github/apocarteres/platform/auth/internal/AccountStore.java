package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.persistence.SqlCatalog;
import io.github.apocarteres.platform.persistence.StoredInstant;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

// REQ-AUTH-001, REQ-PERSISTENCE-001
final class AccountStore {

  record Stored(Account account, String passwordHash) {
  }

  private final JdbcClient jdbc;
  private final SqlCatalog sql;
  private final Clock clock;

  AccountStore(JdbcClient jdbc, SqlCatalog sql, Clock clock) {
    this.jdbc = jdbc;
    this.sql = sql;
    this.clock = clock;
  }

  Account insert(String email, String passwordHash, boolean verified, Set<String> roles) {
    UUID id = UUID.randomUUID();
    jdbc.sql(sql.get("account-insert"))
      .param("id", id)
      .param("email", email)
      .param("passwordHash", passwordHash)
      .param("verified", verified)
      .param("now", StoredInstant.offsetOf(clock))
      .update();
    for (String role : roles) {
      grant(id, role);
    }
    return find(id).orElseThrow().account();
  }

  Optional<Stored> find(UUID id) {
    return jdbc.sql(sql.get("account-by-id")).param("id", id).query(this::row).optional().map(this::withRoles);
  }

  Optional<Stored> findByEmail(String email) {
    return jdbc.sql(sql.get("account-by-email")).param("email", email).query(this::row).optional().map(this::withRoles);
  }

  void grant(UUID id, String role) {
    jdbc.sql(sql.get("role-grant")).param("id", id).param("role", role).update();
  }

  void revoke(UUID id, String role) {
    jdbc.sql(sql.get("role-revoke")).param("id", id).param("role", role).update();
  }

  void verified(UUID id) {
    jdbc.sql(sql.get("account-verified")).param("id", id).update();
  }

  void blocked(UUID id, boolean blocked) {
    jdbc.sql(sql.get("account-blocked")).param("id", id).param("blocked", blocked).update();
  }

  void password(UUID id, String passwordHash) {
    jdbc.sql(sql.get("account-password")).param("id", id).param("passwordHash", passwordHash).update();
  }

  void loggedIn(UUID id) {
    jdbc.sql(sql.get("account-logged-in")).param("id", id).param("now", StoredInstant.offsetOf(clock)).update();
  }

  // REQ-AUTH-009
  List<Account> search(String emailPart, int offset, int limit) {
    return jdbc.sql(sql.get("account-search"))
      .param("pattern", pattern(emailPart))
      .param("offset", offset)
      .param("limit", limit)
      .query(this::row).list().stream().map(this::withRoles).map(Stored::account).toList();
  }

  // REQ-AUTH-009
  long count(String emailPart) {
    return jdbc.sql(sql.get("account-count")).param("pattern", pattern(emailPart)).query(Long.class).single();
  }

  // REQ-AUTH-025
  List<UUID> withRole(String role, int limit) {
    return jdbc.sql(sql.get("account-with-role")).param("role", role).param("limit", limit).query(UUID.class).list();
  }

  // REQ-AUTH-013
  List<UUID> unverifiedBefore(Instant before) {
    return jdbc.sql(sql.get("account-unverified")).param("before", StoredInstant.offsetOf(before)).query(UUID.class).list();
  }

  // REQ-AUTH-023
  boolean email(UUID id, String email) {
    return jdbc.sql(sql.get("account-email")).param("id", id).param("email", email).update() == 1;
  }

  // REQ-AUTH-024
  int remove(UUID id) {
    return jdbc.sql(sql.get("account-remove")).param("id", id).update();
  }

  // REQ-AUTH-013
  int deleteUnverified(UUID id) {
    return jdbc.sql(sql.get("account-delete")).param("id", id).update();
  }

  private static String pattern(String emailPart) {
    String part = emailPart == null ? "" : emailPart.trim().toLowerCase(java.util.Locale.ROOT);
    return "%" + part.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
  }

  private Stored row(ResultSet row, int number) throws SQLException {
    Account account = new Account(
      row.getObject("id", UUID.class),
      row.getString("email"),
      Set.of(),
      row.getBoolean("email_verified"),
      row.getBoolean("blocked"),
      row.getObject("created_at", OffsetDateTime.class).toInstant(),
      Optional.ofNullable(row.getObject("last_login_at", OffsetDateTime.class)).map(OffsetDateTime::toInstant).orElse(null)
    );
    return new Stored(account, row.getString("password_hash"));
  }

  private Stored withRoles(Stored stored) {
    Set<String> roles = new LinkedHashSet<>(jdbc.sql(sql.get("account-roles")).param("id", stored.account().id())
      .query(String.class).list());
    Account account = stored.account();
    return new Stored(new Account(account.id(), account.email(), roles, account.verified(), account.blocked(),
      account.createdAt(), account.lastLoginAt()), stored.passwordHash());
  }
}
