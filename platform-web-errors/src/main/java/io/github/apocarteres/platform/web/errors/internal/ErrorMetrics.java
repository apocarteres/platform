package io.github.apocarteres.platform.web.errors.internal;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;

// REQ-API-004
final class ErrorMetrics {

  private static final String NAME = "api.errors";
  private static final String UNTEMPLATED = "untemplated";

  private final MeterRegistry registry;

  ErrorMetrics(MeterRegistry registry) {
    this.registry = registry;
  }

  void record(ErrorCode code, HttpServletRequest request) {
    registry.counter(
      NAME,
      "code", code.value(),
      "status", String.valueOf(code.status().value()),
      "uri", templateOf(request)
    ).increment();
  }

  // REQ-API-004
  private String templateOf(HttpServletRequest request) {
    if (request == null) {
      return UNTEMPLATED;
    }
    Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
    return pattern instanceof String template && !template.isBlank() ? template : UNTEMPLATED;
  }
}
