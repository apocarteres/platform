package io.github.apocarteres.platform.auth.internal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

// REQ-AUTH-030
final class AccessKeyFilter extends OncePerRequestFilter {

  private static final String BEARER = "Bearer ";

  private final AccessKeyGuard guard;
  private final HandlerExceptionResolver failures;

  AccessKeyFilter(AccessKeyGuard guard, HandlerExceptionResolver failures) {
    this.guard = guard;
    this.failures = failures;
  }

  static boolean bearer(HttpServletRequest request) {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    return header != null && header.regionMatches(true, 0, BEARER, 0, BEARER.length());
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !bearer(request);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    try {
      SecurityContext context = SecurityContextHolder.createEmptyContext();
      context.setAuthentication(guard.authenticate(request, request.getHeader(HttpHeaders.AUTHORIZATION).substring(BEARER.length()).strip()));
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
