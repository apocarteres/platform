package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.UsedKey;
import io.github.apocarteres.platform.ratelimit.RateLimit;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

// REQ-AUTH-030, REQ-AUTH-031, REQ-AUTH-033, REQ-AUTH-034
final class AccessKeyGuard {

  static final String CORE_PATHS = "/api/auth/";
  static final Duration USE_PRECISION = Duration.ofMinutes(1);

  private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");

  private final AccessKeyStore keys;
  private final AccountStore accounts;
  private final RateLimiter limiter;
  private final KeySettings settings;
  private final Clock clock;
  private final RateLimit requests;
  private final RateLimit changes;

  AccessKeyGuard(AccessKeyStore keys, AccountStore accounts, RateLimiter limiter, KeySettings settings, Clock clock) {
    this.keys = keys;
    this.accounts = accounts;
    this.limiter = limiter;
    this.settings = settings;
    this.clock = clock;
    this.requests = new RateLimit("auth-key-requests", Duration.ofMinutes(1), settings.requestsPerMinute());
    this.changes = new RateLimit("auth-key-changes", Duration.ofMinutes(1), settings.changesPerMinute());
  }

  Authentication authenticate(HttpServletRequest request, String value) {
    Instant now = clock.instant();
    Optional<AccessKeyStore.Found> found = value.startsWith(AccessKeysService.PREFIX) ? keys.find(TokenStore.digest(value), now) : Optional.empty();
    AccessKeyStore.Found key = found.orElseThrow(() -> new AuthRefused(AuthRefused.KEY, "Ключ доступа не принят: неизвестен, отозван или истёк"));
    Account account = accounts.find(key.account()).map(AccountStore.Stored::account)
      .orElseThrow(() -> new AuthRefused(AuthRefused.KEY, "Ключ доступа не принят: учётной записи нет"));
    if (account.blocked()) {
      throw new AuthRefused(AuthRefused.BLOCKED, "Учётная запись заблокирована");
    }
    if (!account.verified()) {
      throw new AuthRefused(AuthRefused.UNVERIFIED, "Почта учётной записи не подтверждена");
    }
    String path = request.getRequestURI().substring(request.getContextPath().length());
    if (path.startsWith(CORE_PATHS) || !settings.access().opens(request)) {
      throw new AuthRefused(AuthRefused.KEY_CLOSED, "Эта точка по ключу доступа закрыта");
    }
    limiter.consume(requests, key.id().toString());
    if (!SAFE.contains(request.getMethod())) {
      limiter.consume(changes, key.id().toString());
    }
    keys.used(key.id(), now, now.minus(USE_PRECISION));
    UsernamePasswordAuthenticationToken authentication = UsernamePasswordAuthenticationToken.authenticated(account.id().toString(), null,
      account.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList());
    authentication.setDetails(new UsedKey(key.id(), key.name()));
    return authentication;
  }
}
