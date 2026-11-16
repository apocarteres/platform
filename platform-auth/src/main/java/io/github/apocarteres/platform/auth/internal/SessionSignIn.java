package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.EntryAccess;
import io.github.apocarteres.platform.auth.SignIn;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;

// REQ-AUTH-005, REQ-AUTH-008, REQ-AUTH-042, REQ-AUTH-046, REQ-AUTH-047, REQ-AUTH-048
final class SessionSignIn implements SignIn {

  // REQ-AUTH-042
  static final String SECOND_FACTOR = "platform.auth.second-factor";
  // REQ-AUTH-047
  private static final int AGENT_LENGTH = 256;

  private final AuthService auth;
  private final SecurityContextRepository contexts;
  private final EntryAccess entry;
  private final Clock clock;

  SessionSignIn(AuthService auth, SecurityContextRepository contexts, EntryAccess entry, Clock clock) {
    this.auth = auth;
    this.contexts = contexts;
    this.entry = entry;
    this.clock = clock;
  }

  // REQ-AUTH-016
  void open(HttpServletRequest request) {
    if (!entry.allowed(request)) {
      throw new AuthRefused(AuthRefused.ENTRY, "Точки аутентификации для этого запроса закрыты проектом");
    }
  }

  // REQ-AUTH-048
  @Override
  public Account signIn(UUID account, HttpServletRequest request, HttpServletResponse response) {
    open(request);
    return begin(auth.proven(account, request.getRemoteAddr()), request, response);
  }

  // REQ-AUTH-005, REQ-AUTH-042
  Account begin(Account checked, HttpServletRequest request, HttpServletResponse response) {
    Optional<PendingLogin> pending = auth.secondStep(checked);
    if (pending.isPresent()) {
      HttpSession session = request.getSession(true);
      request.changeSessionId();
      signedIn(session);
      session.setAttribute(SECOND_FACTOR, pending.get());
      SecurityContextHolder.clearContext();
      contexts.saveContext(SecurityContextHolder.createEmptyContext(), request, response);
      auth.challenge(checked);
      throw new AuthRefused(AuthRefused.SECOND_FACTOR_REQUIRED, "Вход требует второго шага");
    }
    Account account = auth.signIn(checked);
    establish(account, request, response);
    return account;
  }

  // REQ-AUTH-005, REQ-AUTH-008
  void establish(Account account, HttpServletRequest request, HttpServletResponse response) {
    List<SimpleGrantedAuthority> authorities = account.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role)).toList();
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(account.id().toString(), null, authorities));
    HttpSession session = request.getSession(true);
    request.changeSessionId();
    signedIn(session);
    // REQ-AUTH-047
    session.setAttribute(Sessions.SIGNED_IN_ADDRESS, request.getRemoteAddr());
    session.setAttribute(Sessions.SIGNED_IN_AGENT, agent(request));
    // REQ-AUTH-042
    if (session.getAttribute(SECOND_FACTOR) != null) {
      session.removeAttribute(SECOND_FACTOR);
    }
    SecurityContextHolder.setContext(context);
    contexts.saveContext(context, request, response);
  }

  // REQ-AUTH-047
  private static String agent(HttpServletRequest request) {
    String agent = request.getHeader("User-Agent");
    if (agent == null) {
      return null;
    }
    return agent.length() > AGENT_LENGTH ? agent.substring(0, AGENT_LENGTH) : agent;
  }

  // REQ-AUTH-046
  private void signedIn(HttpSession session) {
    session.setAttribute(SessionLifetimeFilter.SIGNED_IN_AT, clock.millis());
  }
}
