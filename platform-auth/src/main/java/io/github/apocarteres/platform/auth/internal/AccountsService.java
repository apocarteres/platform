package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

// REQ-AUTH-009, REQ-AUTH-013
final class AccountsService implements Accounts {

  private final AccountStore accounts;
  private final TokenStore tokens;
  private final Sessions sessions;
  private final AuthSettings settings;
  private final Clock clock;

  AccountsService(AccountStore accounts, TokenStore tokens, Sessions sessions, AuthSettings settings, Clock clock) {
    this.accounts = accounts;
    this.tokens = tokens;
    this.sessions = sessions;
    this.settings = settings;
    this.clock = clock;
  }

  @Override
  public Optional<Account> find(UUID id) {
    return accounts.find(id).map(AccountStore.Stored::account);
  }

  @Override
  public Optional<Account> findByEmail(String email) {
    return email == null ? Optional.empty() : accounts.findByEmail(email.trim().toLowerCase(Locale.ROOT)).map(AccountStore.Stored::account);
  }

  @Override
  public void block(UUID id) {
    accounts.blocked(id, true);
    sessions.terminate(id);
  }

  @Override
  public void unblock(UUID id) {
    accounts.blocked(id, false);
  }

  // REQ-AUTH-002
  @Override
  public void grant(UUID id, String role) {
    accounts.grant(id, declared(role));
  }

  // REQ-AUTH-002
  @Override
  public void revoke(UUID id, String role) {
    accounts.revoke(id, declared(role));
    sessions.terminate(id);
  }

  @Override
  public int purgeUnverified(Duration olderThan) {
    return accounts.purgeUnverified(clock.instant().minus(olderThan));
  }

  @Override
  public int purgeTokens(Duration olderThan) {
    return tokens.purge(clock.instant().minus(olderThan));
  }

  private String declared(String role) {
    if (!settings.roles().contains(role)) {
      throw new IllegalArgumentException("Роль " + role + " не объявлена в platform.auth.roles: " + settings.roles());
    }
    return role;
  }
}
