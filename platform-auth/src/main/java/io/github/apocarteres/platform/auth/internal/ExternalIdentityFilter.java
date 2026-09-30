package io.github.apocarteres.platform.auth.internal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

// REQ-AUTH-038
final class ExternalIdentityFilter extends OncePerRequestFilter {

  private final ExternalIdentityGuard guard;
  private final HandlerExceptionResolver failures;

  ExternalIdentityFilter(ExternalIdentityGuard guard, HandlerExceptionResolver failures) {
    this.guard = guard;
    this.failures = failures;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !guard.covers(request);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    try {
      SecurityContext context = SecurityContextHolder.createEmptyContext();
      context.setAuthentication(guard.authenticate(request));
      SecurityContextHolder.setContext(context);
    } catch (RuntimeException refused) {
      if (failures.resolveException(request, response, null, refused) == null) {
        throw refused;
      }
      return;
    }
    chain.doFilter(request, response);
  }
}
