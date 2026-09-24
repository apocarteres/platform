package io.github.apocarteres.platform.api.version.internal;

import io.github.apocarteres.platform.web.errors.CodedFailure;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import org.springframework.http.HttpStatus;

// REQ-CLIENT-UPDATE-006, REQ-API-011
final class ClientOutdated extends RuntimeException implements CodedFailure {

  private static final long serialVersionUID = 1L;

  static final ErrorCode CODE = ErrorCode.of("client-outdated", HttpStatus.UPGRADE_REQUIRED);

  ClientOutdated() {
    super("Клиент не понимает текущий API", null, false, false);
  }

  @Override
  public ErrorCode code() {
    return CODE;
  }
}
