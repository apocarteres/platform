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

  int purgeUnverified(Instant before) {
    return jdbc.sql(sql.get("account-purge-unverified")).param("before", StoredInstant.offsetOf(before)).update();
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
