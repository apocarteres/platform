package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.Accounts;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.EmailChange;
import io.github.apocarteres.platform.auth.Removal;
import io.github.apocarteres.platform.auth.Purged;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-AUTH-009, REQ-AUTH-013, REQ-AUTH-023, REQ-AUTH-024
final class AccountsService implements Accounts {

  private static final Log LOG = LogFactory.getLog(AccountsService.class);

  private final AccountStore accounts;
  private final TokenStore tokens;
  private final Sessions sessions;
  private final AccountCreation creation;
  private final PasswordEncoder passwords;
  private final TransactionTemplate transactions;
  private final AuthLetters letters;
  private final AuthSettings settings;
  private final Clock clock;

  AccountsService(AccountStore accounts, TokenStore tokens, Sessions sessions, AccountCreation creation, PasswordEncoder passwords,
    TransactionTemplate transactions, AuthLetters letters, AuthSettings settings, Clock clock) {
    this.accounts = accounts;
    this.tokens = tokens;
    this.sessions = sessions;
    this.creation = creation;
    this.passwords = passwords;
    this.transactions = transactions;
    this.letters = letters;
    this.settings = settings;
    this.clock = clock;
  }

  // REQ-AUTH-009
  @Override
  public Account create(String email, String password, Set<String> roles, boolean verified, Object profile) {
    return transactions.execute(status -> creation.create(email, password, roles, verified, profile));
  }

  // REQ-AUTH-009
  @Override
  public void setPassword(UUID id, String password) {
    accounts.password(id, passwords.encode(Credentials.password(password, settings)));
    sessions.terminate(id);
  }

  // REQ-AUTH-009
  @Override
  public List<Account> search(String emailPart, int offset, int limit) {
    if (offset < 0 || limit < 1 || limit > 500) {
      throw new IllegalArgumentException("Страница поиска: смещение от 0, размер от 1 до 500");
    }
    return accounts.search(emailPart, offset, limit);
  }

  // REQ-AUTH-009
  @Override
  public long count(String emailPart) {
    return accounts.count(emailPart);
  }

  @Override
  public Optional<Account> find(UUID id) {
    return accounts.find(id).map(AccountStore.Stored::account);
  }

  @Override
  public Optional<Account> findByEmail(String email) {
    return email == null ? Optional.empty() : accounts.findByEmail(email.trim().toLowerCase(Locale.ROOT)).map(AccountStore.Stored::account);
  }

  // REQ-AUTH-023
  @Override
  public EmailChange changeEmail(UUID id, String declaredEmail, Locale locale) {
    String email = Credentials.email(declaredEmail);
    EmailChange outcome;
    try {
      outcome = transactions.execute(status -> {
        Optional<AccountStore.Stored> found = accounts.find(id);
        if (found.isEmpty()) {
          return EmailChange.ABSENT;
        }
        String previous = found.get().account().email();
        if (previous.equals(email)) {
          return EmailChange.SAME;
        }
        accounts.email(id, email);
        afterCommit(() -> letters.emailChanged(previous, locale));
        return EmailChange.CHANGED;
      });
    } catch (DuplicateKeyException raced) {
      return EmailChange.TAKEN;
    }
    if (outcome == EmailChange.CHANGED) {
      sessions.terminate(id);
    }
    return outcome;
  }

  // REQ-AUTH-024
  @Override
  public Removal delete(UUID id) {
    Integer removed;
    try {
      removed = transactions.execute(status -> accounts.remove(id));
    } catch (DataIntegrityViolationException referenced) {
      return Removal.HELD;
    }
    if (removed == null || removed == 0) {
      return Removal.ABSENT;
    }
    sessions.terminate(id);
    return Removal.REMOVED;
  }

  // REQ-AUTH-010
  private static void afterCommit(Runnable letter) {
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override
      public void afterCommit() {
        letter.run();
      }
    });
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

  // REQ-AUTH-013
  @Override
  public Purged purgeUnverified(Duration olderThan) {
    int removed = 0;
    int held = 0;
    for (UUID id : accounts.unverifiedBefore(clock.instant().minus(olderThan))) {
      try {
        Integer deleted = transactions.execute(status -> accounts.deleteUnverified(id));
        removed += deleted == null ? 0 : deleted;
      } catch (DataIntegrityViolationException referenced) {
        held++;
      }
    }
    if (held > 0) {
      LOG.info("Очистка неподтверждённых учётных записей: удержано внешними ключами проекта " + held);
    }
    return new Purged(removed, held);
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
