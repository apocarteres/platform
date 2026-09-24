package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.ratelimit.RateLimiter;
import io.github.apocarteres.platform.support.SupportRefused;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

// REQ-SUPPORT-003
final class IntakeGuard extends OncePerRequestFilter {

  static final String PATH = "/api/support/requests";

  // REQ-SUPPORT-003
  static final int ORDER = -110;

  private final RateLimiter limiter;
  private final HandlerExceptionResolver failures;

  IntakeGuard(RateLimiter limiter, HandlerExceptionResolver failures) {
    this.limiter = limiter;
    this.failures = failures;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI().substring(request.getContextPath().length());
    return !("POST".equals(request.getMethod()) && PATH.equals(path));
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    try {
      long length = request.getContentLengthLong();
      if (length < 0) {
        throw new SupportRefused(SupportRefused.LENGTH, "Обращение принимается только с объявленной длиной тела");
      }
      if (length > SupportLimits.BODY_BYTES) {
        throw new SupportRefused(SupportRefused.TOO_LARGE, "Тело обращения больше " + SupportLimits.BODY_BYTES + " байт");
      }
      limiter.consume(SupportLimits.SUBMIT_BY_ADDRESS, request.getRemoteAddr());
    } catch (RuntimeException refused) {
      if (failures.resolveException(request, response, null, refused) == null) {
        throw refused;
      }
      return;
    }
    chain.doFilter(request, response);
  }
}
