package io.github.apocarteres.platform.ratelimit;

import io.github.apocarteres.platform.web.errors.CodedFailure;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

// REQ-AUTH-011, REQ-API-008, REQ-API-011
public final class RateLimited extends ErrorResponseException implements CodedFailure {

  private static final long serialVersionUID = 1L;

  public static final ErrorCode CODE = ErrorCode.of("rate-limited", HttpStatus.TOO_MANY_REQUESTS);

  private final String action;
  private final Duration retryAfter;

  public RateLimited(String action, Duration retryAfter) {
    super(HttpStatus.TOO_MANY_REQUESTS);
    this.action = action;
    this.retryAfter = retryAfter;
    getHeaders().set(HttpHeaders.RETRY_AFTER, Long.toString(Math.max(1, (retryAfter.toMillis() + 999) / 1000)));
  }

  public String action() {
    return action;
  }

  public Duration retryAfter() {
    return retryAfter;
  }

  @Override
  public ErrorCode code() {
    return CODE;
  }
}
