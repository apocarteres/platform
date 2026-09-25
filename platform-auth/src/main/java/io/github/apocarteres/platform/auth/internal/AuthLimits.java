package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.ratelimit.RateLimit;
import java.time.Duration;

// REQ-AUTH-012
final class AuthLimits {

  static final RateLimit LOGIN_BY_ADDRESS = new RateLimit("auth-login-address", Duration.ofMinutes(15), 50);
  static final RateLimit LOGIN_FAILURES_BY_EMAIL = new RateLimit("auth-login-failures", Duration.ofMinutes(15), 10);
  static final RateLimit REGISTER_BY_ADDRESS = new RateLimit("auth-register-address", Duration.ofHours(1), 10);
  static final RateLimit RESEND_BY_EMAIL = new RateLimit("auth-resend-email", Duration.ofHours(1), 3);
  static final RateLimit RESET_BY_ADDRESS = new RateLimit("auth-reset-address", Duration.ofHours(1), 30);
  static final RateLimit RESET_BY_EMAIL = new RateLimit("auth-reset-email", Duration.ofHours(1), 3);
  // REQ-AUTH-023
  static final RateLimit EMAIL_CHANGE_BY_ACCOUNT = new RateLimit("auth-email-change-account", Duration.ofHours(1), 5);
  static final RateLimit TOKEN_BY_ADDRESS = new RateLimit("auth-token-address", Duration.ofMinutes(5), 20);

  private AuthLimits() {
  }
}
