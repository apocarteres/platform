package io.github.apocarteres.platform.telegram;

import io.github.apocarteres.platform.web.errors.CodedFailure;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import org.springframework.http.HttpStatus;

// REQ-TELEGRAM-006, REQ-API-011
public final class TelegramRefused extends RuntimeException implements CodedFailure {

  private static final long serialVersionUID = 1L;

  public static final ErrorCode ALREADY_LINKED = ErrorCode.of("telegram-already-linked", HttpStatus.CONFLICT);

  private final transient ErrorCode code;

  public TelegramRefused(ErrorCode code, String reason) {
    super(reason, null, false, false);
    this.code = code;
  }

  @Override
  public ErrorCode code() {
    return code;
  }
}
