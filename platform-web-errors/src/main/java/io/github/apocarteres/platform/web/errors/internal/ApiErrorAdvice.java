package io.github.apocarteres.platform.web.errors.internal;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorCodeResolver;
import io.github.apocarteres.platform.web.errors.ErrorExtensions;
import io.github.apocarteres.platform.web.errors.ErrorHeaders;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Locale;
import java.util.Optional;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
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
  private final Optional<ErrorExtensions> extensions;
  private final Optional<ErrorHeaders> headers;
  private final Optional<ErrorMetrics> metrics;

  ApiErrorAdvice(
    ErrorCodeResolver codes,
    ErrorMessages messages,
    Optional<ErrorExtensions> extensions,
    Optional<ErrorHeaders> headers,
    Optional<ErrorMetrics> metrics
  ) {
    this.codes = codes;
    this.messages = messages;
    this.extensions = extensions;
    this.headers = headers;
    this.metrics = metrics;
  }

  @ExceptionHandler(Throwable.class)
  ResponseEntity<ProblemDetail> onFailure(Throwable failure, WebRequest request) {
    ErrorCode code = codes.resolve(failure).orElseGet(() -> fallbackFor(failure));
    ProblemDetail detail = ProblemDetail.forStatus(code.status());
    detail.setTitle(code.status().getReasonPhrase());
    detail.setDetail(messages.detailFor(code, localeOf(request)));
    detail.setProperty("code", code.value());
    // REQ-API-007
    extensionsFor(failure, code).forEach(detail::setProperty);
    instanceOf(request).ifPresent(detail::setInstance);
    metrics.ifPresent(counter -> counter.record(code, servletRequestOf(request)));
    return ResponseEntity.status(code.status())
      .headers(headersFor(failure, code))
      .contentType(MediaType.APPLICATION_PROBLEM_JSON)
      .body(detail);
  }

  // REQ-API-007
  private Map<String, Object> extensionsFor(Throwable failure, ErrorCode code) {
    return extensions.map(port -> port.forFailure(failure, code)).orElseGet(Map::of);
  }

  // REQ-API-008
  private HttpHeaders headersFor(Throwable failure, ErrorCode code) {
    HttpHeaders collected = new HttpHeaders();
    if (failure instanceof ErrorResponse response) {
      collected.putAll(response.getHeaders());
    }
    headers.ifPresent(port -> collected.putAll(port.forFailure(failure, code)));
    return collected;
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
