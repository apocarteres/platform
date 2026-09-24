package io.github.apocarteres.platform.ratelimit;

import io.github.apocarteres.platform.web.errors.CodedFailure;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import org.springframework.http.HttpStatus;

// REQ-AUTH-011, REQ-API-011
public final class RateLimitUnavailable extends RuntimeException implements CodedFailure {

  private static final long serialVersionUID = 1L;

  public static final ErrorCode CODE = ErrorCode.of("rate-limit-unavailable", HttpStatus.SERVICE_UNAVAILABLE);

  public RateLimitUnavailable(String action, Throwable cause) {
    super("Хранилище ограничения частоты недоступно для " + action + ": действие отклонено, а не пропущено", cause);
  }

  @Override
  public ErrorCode code() {
    return CODE;
  }
}
