package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.AuthLetters;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.HumanCheck;
import io.github.apocarteres.platform.auth.AccountVerified;
import io.github.apocarteres.platform.auth.internal.TokenStore.Purpose;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import java.time.Clock;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-AUTH-003, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-010, REQ-AUTH-023
final class AuthService {

  private final AccountStore accounts;
  private final TokenStore tokens;
  private final Sessions sessions;
  private final PasswordEncoder passwords;
  private final RateLimiter limiter;
  private final HumanCheck human;
  private final AccountCreation creation;
  private final ApplicationEventPublisher events;
  private final AuthLetters letters;
  private final TransactionTemplate transactions;
  private final AuthSettings settings;
  private final Clock clock;
  private final String absentHash;

  AuthService(AccountStore accounts, TokenStore tokens, Sessions sessions, PasswordEncoder passwords, RateLimiter limiter,
    HumanCheck human, AccountCreation creation, ApplicationEventPublisher events, AuthLetters letters,
    TransactionTemplate transactions, AuthSettings settings, Clock clock) {
    this.accounts = accounts;
    this.tokens = tokens;
    this.sessions = sessions;
    this.passwords = passwords;
    this.limiter = limiter;
    this.human = human;
    this.creation = creation;
    this.events = events;
    this.letters = letters;
    this.transactions = transactions;
    this.settings = settings;
    this.clock = clock;
    this.absentHash = passwords.encode("absent-account-" + UUID.randomUUID());
  }

  // REQ-AUTH-003
  void register(String declaredEmail, String declaredPassword, String answer, String address, Locale locale,
    Map<String, Object> profile) {
    limiter.consume(AuthLimits.REGISTER_BY_ADDRESS, address);
    requireHuman(answer, "register", address);
    String email = Credentials.email(declaredEmail);
    String password = Credentials.password(declaredPassword, settings);
    // REQ-AUTH-021
    Object parsed = creation.profile(profile);
    transactions.executeWithoutResult(status -> {
      if (accounts.findByEmail(email).isPresent()) {
        return;
      }
      Account account = creation.create(email, password, settings.defaultRoles(), false, parsed);
      String token = tokens.issue(account.id(), Purpose.EMAIL_VERIFICATION, settings.verificationTtl());
      afterCommit(() -> letters.verification(email, settings.link(settings.verificationLink(), token), locale));
    });
  }

  // REQ-AUTH-004
  void verify(String token, String address) {
    limiter.consume(AuthLimits.TOKEN_BY_ADDRESS, address);
    transactions.executeWithoutResult(status -> {
      UUID id = tokens.take(token, Purpose.EMAIL_VERIFICATION)
        .orElseThrow(() -> new AuthRefused(AuthRefused.TOKEN, "Ссылка подтверждения недействительна или просрочена"));
      accounts.verified(id);
      String email = accounts.find(id).orElseThrow().account().email();
      // REQ-AUTH-017
      afterCommit(() -> events.publishEvent(new AccountVerified(id, email)));
    });
  }

  // REQ-AUTH-004
  void resend(String declaredEmail, Locale locale) {
    String email = Credentials.email(declaredEmail);
    limiter.consume(AuthLimits.RESEND_BY_EMAIL, email);
    transactions.executeWithoutResult(status -> {
      Optional<Account> found = accounts.findByEmail(email).map(AccountStore.Stored::account);
      if (found.isEmpty() || found.get().verified()) {
        return;
      }
      UUID id = found.get().id();
      boolean recent = tokens.latest(id, Purpose.EMAIL_VERIFICATION)
        .map(issued -> issued.plus(settings.resendInterval()).isAfter(clock.instant()))
        .orElse(false);
      if (recent) {
        return;
      }
      String token = tokens.issue(id, Purpose.EMAIL_VERIFICATION, settings.verificationTtl());
      afterCommit(() -> letters.verification(email, settings.link(settings.verificationLink(), token), locale));
    });
  }

  // REQ-AUTH-005
  Account authenticate(String declaredEmail, String password, String answer, String address) {
    limiter.consume(AuthLimits.LOGIN_BY_ADDRESS, address);
    requireHuman(answer, "login", address);
    String email = declaredEmail == null ? "" : declaredEmail.trim().toLowerCase(Locale.ROOT);
    limiter.require(AuthLimits.LOGIN_FAILURES_BY_EMAIL, email.isEmpty() ? address : email);
    Optional<AccountStore.Stored> found = email.isEmpty() ? Optional.empty() : accounts.findByEmail(email);
    // REQ-AUTH-003
    String hash = found.map(AccountStore.Stored::passwordHash).orElse(absentHash);
    boolean matches = password != null && passwords.matches(password, hash);
    if (found.isEmpty() || !matches) {
      limiter.count(AuthLimits.LOGIN_FAILURES_BY_EMAIL, email.isEmpty() ? address : email);
      throw new AuthRefused(AuthRefused.CREDENTIALS, "Почта или пароль не подошли");
    }
    Account account = found.get().account();
    if (account.blocked()) {
      throw new AuthRefused(AuthRefused.BLOCKED, "Учётная запись заблокирована");
    }
    if (!account.verified()) {
      throw new AuthRefused(AuthRefused.UNVERIFIED, "Почта не подтверждена");
    }
    limiter.clear(AuthLimits.LOGIN_FAILURES_BY_EMAIL, email);
    accounts.loggedIn(account.id());
    return accounts.find(account.id()).orElseThrow().account();
  }

  // REQ-AUTH-006
  void requestReset(String declaredEmail, String answer, String address, Locale locale) {
    limiter.consume(AuthLimits.RESET_BY_ADDRESS, address);
    requireHuman(answer, "password-reset", address);
    String email = Credentials.email(declaredEmail);
    limiter.consume(AuthLimits.RESET_BY_EMAIL, email);
    transactions.executeWithoutResult(status -> accounts.findByEmail(email).map(AccountStore.Stored::account).ifPresent(account -> {
      String token = tokens.issue(account.id(), Purpose.PASSWORD_RESET, settings.resetTtl());
      afterCommit(() -> letters.passwordReset(email, settings.link(settings.resetLink(), token), locale));
    }));
  }

  // REQ-AUTH-006
  void confirmReset(String token, String declaredPassword, String address) {
    limiter.consume(AuthLimits.TOKEN_BY_ADDRESS, address);
    String password = Credentials.password(declaredPassword, settings);
    UUID id = transactions.execute(status -> {
      UUID taken = tokens.take(token, Purpose.PASSWORD_RESET)
        .orElseThrow(() -> new AuthRefused(AuthRefused.TOKEN, "Ссылка сброса недействительна или просрочена"));
      accounts.password(taken, passwords.encode(password));
      return taken;
    });
    sessions.terminate(id);
  }

  // REQ-AUTH-019
  void changePassword(UUID id, String current, String declaredPassword, String keptSession) {
    limiter.require(AuthLimits.LOGIN_FAILURES_BY_EMAIL, id.toString());
    AccountStore.Stored stored = accounts.find(id).orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Учётной записи нет"));
    if (current == null || !passwords.matches(current, stored.passwordHash())) {
      limiter.count(AuthLimits.LOGIN_FAILURES_BY_EMAIL, id.toString());
      throw new AuthRefused(AuthRefused.CREDENTIALS, "Текущий пароль не подошёл");
    }
    String password = Credentials.password(declaredPassword, settings);
    accounts.password(id, passwords.encode(password));
    limiter.clear(AuthLimits.LOGIN_FAILURES_BY_EMAIL, id.toString());
    sessions.terminateExcept(id, keptSession);
  }

  // REQ-AUTH-023
  void requestEmailChange(UUID id, String current, String declaredEmail, Locale locale) {
    limiter.consume(AuthLimits.EMAIL_CHANGE_BY_ACCOUNT, id.toString());
    limiter.require(AuthLimits.LOGIN_FAILURES_BY_EMAIL, id.toString());
    AccountStore.Stored stored = accounts.find(id).orElseThrow(() -> new AuthRefused(AuthRefused.CREDENTIALS, "Учётной записи нет"));
    if (current == null || !passwords.matches(current, stored.passwordHash())) {
      limiter.count(AuthLimits.LOGIN_FAILURES_BY_EMAIL, id.toString());
      throw new AuthRefused(AuthRefused.CREDENTIALS, "Текущий пароль не подошёл");
    }
    limiter.clear(AuthLimits.LOGIN_FAILURES_BY_EMAIL, id.toString());
    String email = Credentials.email(declaredEmail);
    // REQ-AUTH-003
    if (email.equals(stored.account().email()) || accounts.findByEmail(email).isPresent()) {
      return;
    }
    transactions.executeWithoutResult(status -> {
      String token = tokens.issue(id, Purpose.EMAIL_CHANGE, settings.emailChangeTtl(), email);
      afterCommit(() -> letters.emailChange(email, settings.link(settings.emailChangeLink(), token), locale));
    });
  }

  // REQ-AUTH-023
  void confirmEmailChange(String token, String address, String keptSession, Locale locale) {
    limiter.consume(AuthLimits.TOKEN_BY_ADDRESS, address);
    UUID id;
    try {
      id = transactions.execute(status -> {
      TokenStore.PendingEmail pending = tokens.takeEmail(token)
        .orElseThrow(() -> new AuthRefused(AuthRefused.TOKEN, "Ссылка смены почты недействительна или просрочена"));
      String previous = accounts.find(pending.account()).orElseThrow(
        () -> new AuthRefused(AuthRefused.TOKEN, "Учётной записи больше нет")).account().email();
      if (accounts.findByEmail(pending.email()).isPresent()) {
        throw new AuthRefused(AuthRefused.EMAIL_TAKEN, "Почта уже занята другой учётной записью");
      }
      accounts.email(pending.account(), pending.email());
      afterCommit(() -> letters.emailChanged(previous, locale));
      return pending.account();
      });
    } catch (DuplicateKeyException raced) {
      throw new AuthRefused(AuthRefused.EMAIL_TAKEN, "Почта уже занята другой учётной записью");
    }
    sessions.terminateExcept(id, keptSession);
  }

  private void requireHuman(String answer, String action, String address) {
    if (!human.passed(answer, action, address)) {
      throw new AuthRefused(AuthRefused.HUMAN, "Проверка «человек ли это» не пройдена");
    }
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
}
