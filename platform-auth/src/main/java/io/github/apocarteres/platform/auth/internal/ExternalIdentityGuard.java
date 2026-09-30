package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.auth.RequestAuthenticator;
import io.github.apocarteres.platform.ratelimit.RateLimit;
import io.github.apocarteres.platform.ratelimit.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

// REQ-AUTH-037, REQ-AUTH-038, REQ-AUTH-039, REQ-AUTH-040
final class ExternalIdentityGuard {

  private record Covered(RequestMatcher matcher, RequestAuthenticator authenticator) {
  }

  private static final Log LOG = LogFactory.getLog(ExternalIdentityGuard.class);

  private final List<Covered> covered;
  private final RateLimiter limiter;
  private final ExternalSettings settings;
  private final RateLimit requests;

  ExternalIdentityGuard(ExternalSettings settings, RateLimiter limiter) {
    this.settings = settings;
    this.limiter = limiter;
    this.covered = settings.authenticators().stream()
      .flatMap(authenticator -> authenticator.paths().stream()
        .map(path -> new Covered(PathPatternRequestMatcher.withDefaults().matcher(path), authenticator)))
      .toList();
    this.requests = new RateLimit("auth-external-requests", Duration.ofMinutes(1), settings.requestsPerMinute());
  }

  // REQ-AUTH-037
  boolean active() {
    return !covered.isEmpty();
  }

  boolean covers(HttpServletRequest request) {
    return authenticatorOf(request) != null;
  }

  private RequestAuthenticator authenticatorOf(HttpServletRequest request) {
    for (Covered one : covered) {
      if (one.matcher().matches(request)) {
        return one.authenticator();
      }
    }
    return null;
  }

  Authentication authenticate(HttpServletRequest request) {
    RequestAuthenticator authenticator = authenticatorOf(request);
    Optional<ExternalIdentity> found = authenticator == null ? Optional.empty() : authenticator.authenticate(request);
    ExternalIdentity identity = found.orElseThrow(() -> new AuthRefused(AuthRefused.IDENTITY, "Запрос не удостоверен портом проекта"));
    if (!settings.roles().containsAll(identity.roles())) {
      // REQ-AUTH-040
      LOG.error("Порт " + authenticator.getClass().getName() + " вернул личность вида " + identity.kind()
        + " с ролью вне platform.auth.external.roles: запрос отвергнут");
      throw new AuthRefused(AuthRefused.IDENTITY, "Запрос не удостоверен портом проекта");
    }
    limiter.consume(requests, identity.kind() + ":" + identity.id());
    UsernamePasswordAuthenticationToken authentication = UsernamePasswordAuthenticationToken.authenticated(
      identity.kind() + ":" + identity.id(), null,
      identity.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList());
    authentication.setDetails(identity);
    return authentication;
  }
}
