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
    boolean accepted = ApiVersion.parse(request.getHeader(ApiVersion.HEADER)).map(minimum::accepts).orElse(false);
    if (!accepted) {
      throw new ClientOutdated();
    }
    return true;
  }
}
