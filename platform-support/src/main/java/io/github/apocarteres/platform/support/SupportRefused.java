package io.github.apocarteres.platform.support;

import io.github.apocarteres.platform.web.errors.CodedFailure;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import org.springframework.http.HttpStatus;

// REQ-SUPPORT-001, REQ-API-011
public final class SupportRefused extends RuntimeException implements CodedFailure {

  private static final long serialVersionUID = 1L;

  public static final ErrorCode NOT_FOUND = ErrorCode.of("request-not-found", HttpStatus.NOT_FOUND);
  public static final ErrorCode ATTACHMENT_NOT_FOUND = ErrorCode.of("attachment-not-found", HttpStatus.NOT_FOUND);
  public static final ErrorCode CLOSED = ErrorCode.of("request-closed", HttpStatus.CONFLICT);
  public static final ErrorCode TRANSITION = ErrorCode.of("transition-refused", HttpStatus.CONFLICT);
  public static final ErrorCode CHANGED = ErrorCode.of("request-changed", HttpStatus.CONFLICT);
  public static final ErrorCode MESSAGE = ErrorCode.of("message-rejected", HttpStatus.BAD_REQUEST);
  public static final ErrorCode EMAIL = ErrorCode.of("guest-email-rejected", HttpStatus.BAD_REQUEST);
  public static final ErrorCode ATTACHMENT = ErrorCode.of("attachment-rejected", HttpStatus.BAD_REQUEST);
  public static final ErrorCode TOKEN = ErrorCode.of("answer-link-rejected", HttpStatus.BAD_REQUEST);
  // REQ-SUPPORT-002
  public static final ErrorCode GUEST = ErrorCode.of("guest-intake-closed", HttpStatus.FORBIDDEN);
  // REQ-SUPPORT-003
  public static final ErrorCode TOO_LARGE = ErrorCode.of("body-too-large", HttpStatus.CONTENT_TOO_LARGE);
  // REQ-SUPPORT-003
  public static final ErrorCode LENGTH = ErrorCode.of("length-required", HttpStatus.LENGTH_REQUIRED);

  private final transient ErrorCode code;

  public SupportRefused(ErrorCode code, String reason) {
    super(reason, null, false, false);
    this.code = code;
  }

  @Override
  public ErrorCode code() {
    return code;
  }
}
