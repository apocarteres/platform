package io.github.apocarteres.platform.web.errors.internal;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Locale;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;

// REQ-API-001, REQ-API-005
@RestControllerAdvice
class ApiErrorAdvice {

  private final ErrorCodeResolver codes;
  private final ErrorMessages messages;
  private final Optional<ErrorMetrics> metrics;

  ApiErrorAdvice(ErrorCodeResolver codes, ErrorMessages messages, Optional<ErrorMetrics> metrics) {
    this.codes = codes;
    this.messages = messages;
    this.metrics = metrics;
  }

  @ExceptionHandler(Throwable.class)
  ProblemDetail onFailure(Throwable failure, WebRequest request) {
    ErrorCode code = codes.resolve(failure).orElseGet(() -> fallbackFor(failure));
    ProblemDetail detail = ProblemDetail.forStatus(code.status());
    detail.setTitle(code.status().getReasonPhrase());
    detail.setDetail(messages.detailFor(code, localeOf(request)));
    detail.setProperty("code", code.value());
    instanceOf(request).ifPresent(detail::setInstance);
    metrics.ifPresent(counter -> counter.record(code, servletRequestOf(request)));
    return detail;
  }

  // REQ-API-002
  private static ErrorCode fallbackFor(Throwable failure) {
    if (failure instanceof ErrorResponse response) {
      HttpStatus status = HttpStatus.valueOf(response.getStatusCode().value());
      return ErrorCode.of(slugOf(status), status);
    }
    return ErrorCode.of("unexpected", HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private static String slugOf(HttpStatus status) {
    return status.name().toLowerCase(Locale.ROOT).replace('_', '-');
  }

  private static Locale localeOf(WebRequest request) {
    Locale locale = request == null ? null : request.getLocale();
    return locale == null ? Locale.ROOT : locale;
  }

  private static Optional<URI> instanceOf(WebRequest request) {
    HttpServletRequest servlet = servletRequestOf(request);
    return servlet == null ? Optional.empty() : Optional.of(URI.create(servlet.getRequestURI()));
  }

  private static HttpServletRequest servletRequestOf(WebRequest request) {
    return request instanceof ServletWebRequest servlet ? servlet.getRequest() : null;
  }
}
