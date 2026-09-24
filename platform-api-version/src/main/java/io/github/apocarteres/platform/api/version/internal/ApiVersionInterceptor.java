package io.github.apocarteres.platform.api.version.internal;

import io.github.apocarteres.platform.api.version.ApiVersion;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

// REQ-CLIENT-UPDATE-006
final class ApiVersionInterceptor implements HandlerInterceptor {

  private final ApiVersion minimum;

  ApiVersionInterceptor(ApiVersion minimum) {
    this.minimum = minimum;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    if (!(handler instanceof HandlerMethod)) {
      return true;
    }
    String declared = request.getHeader(ApiVersion.HEADER);
    // REQ-CLIENT-UPDATE-006
    if (declared == null && !fromBrowser(request)) {
      return true;
    }
    boolean accepted = ApiVersion.parse(declared).map(minimum::accepts).orElse(false);
    if (!accepted) {
      throw new ClientOutdated();
    }
    return true;
  }

  // REQ-CLIENT-UPDATE-006
  static boolean fromBrowser(HttpServletRequest request) {
    return request.getHeader("Sec-Fetch-Site") != null || request.getHeader("Referer") != null;
  }
}
