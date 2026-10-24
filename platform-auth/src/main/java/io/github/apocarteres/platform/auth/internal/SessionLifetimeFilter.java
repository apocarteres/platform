package io.github.apocarteres.platform.auth.internal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.web.filter.OncePerRequestFilter;

// REQ-AUTH-046
final class SessionLifetimeFilter extends OncePerRequestFilter {

  static final String SIGNED_IN_AT = "platform.auth.signed-in-at";

  private final Sessions sessions;
  private final Duration lifetime;
  private final Clock clock;

  SessionLifetimeFilter(Sessions sessions, Duration lifetime, Clock clock) {
    this.sessions = sessions;
    this.lifetime = lifetime;
    this.clock = clock;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    HttpSession session = request.getSession(false);
    if (session != null && outlived(session)) {
      sessions.end(session.getId());
      session.invalidate();
    }
    chain.doFilter(request, response);
  }

  private boolean outlived(HttpSession session) {
    Object stamp = session.getAttribute(SIGNED_IN_AT);
    long since = stamp instanceof Long signedIn ? signedIn : session.getCreationTime();
    return !clock.instant().isBefore(Instant.ofEpochMilli(since).plus(lifetime));
  }
}
