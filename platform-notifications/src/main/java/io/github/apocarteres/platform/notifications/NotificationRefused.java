package io.github.apocarteres.platform.notifications;

import io.github.apocarteres.platform.web.errors.CodedFailure;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import org.springframework.http.HttpStatus;

// REQ-NOTIFICATIONS-004, REQ-API-011
public final class NotificationRefused extends RuntimeException implements CodedFailure {

  private static final long serialVersionUID = 1L;

  public static final ErrorCode NOT_FOUND = ErrorCode.of("notification-not-found", HttpStatus.NOT_FOUND);

  private final transient ErrorCode code;

  public NotificationRefused(ErrorCode code, String reason) {
    super(reason, null, false, false);
    this.code = code;
  }

  @Override
  public ErrorCode code() {
    return code;
  }
}
