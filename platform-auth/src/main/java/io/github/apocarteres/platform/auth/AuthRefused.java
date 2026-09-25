package io.github.apocarteres.platform.auth;

import io.github.apocarteres.platform.web.errors.CodedFailure;
import io.github.apocarteres.platform.web.errors.ErrorCode;
import org.springframework.http.HttpStatus;

// REQ-AUTH-003, REQ-AUTH-005, REQ-API-011
public final class AuthRefused extends RuntimeException implements CodedFailure {

  private static final long serialVersionUID = 1L;

  public static final ErrorCode CREDENTIALS = ErrorCode.of("credentials-rejected", HttpStatus.UNAUTHORIZED);
  public static final ErrorCode UNVERIFIED = ErrorCode.of("email-unverified", HttpStatus.FORBIDDEN);
  public static final ErrorCode BLOCKED = ErrorCode.of("account-blocked", HttpStatus.FORBIDDEN);
  public static final ErrorCode TOKEN = ErrorCode.of("token-rejected", HttpStatus.BAD_REQUEST);
  public static final ErrorCode PASSWORD = ErrorCode.of("password-rejected", HttpStatus.BAD_REQUEST);
  public static final ErrorCode EMAIL = ErrorCode.of("email-rejected", HttpStatus.BAD_REQUEST);
  public static final ErrorCode HUMAN = ErrorCode.of("human-check-failed", HttpStatus.BAD_REQUEST);
  // REQ-AUTH-021
  public static final ErrorCode PROFILE = ErrorCode.of("profile-rejected", HttpStatus.BAD_REQUEST);
  // REQ-AUTH-016
  public static final ErrorCode ENTRY = ErrorCode.of("entry-closed", HttpStatus.FORBIDDEN);
  // REQ-AUTH-023
  public static final ErrorCode EMAIL_TAKEN = ErrorCode.of("email-taken", HttpStatus.CONFLICT);

  private final transient ErrorCode code;

  public AuthRefused(ErrorCode code, String reason) {
    super(reason, null, false, false);
    this.code = code;
  }

  @Override
  public ErrorCode code() {
    return code;
  }
}
