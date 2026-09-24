package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AuthRefused;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

// REQ-AUTH-001, REQ-AUTH-007
final class Credentials {

  private static final Pattern EMAIL = Pattern.compile("[^@\\s]{1,64}@[^@\\s]+\\.[^@\\s]+");
  private static final int EMAIL_LIMIT = 320;

  private Credentials() {
  }

  static String email(String declared) {
    String email = declared == null ? "" : declared.trim().toLowerCase(Locale.ROOT);
    if (email.length() > EMAIL_LIMIT || !EMAIL.matcher(email).matches()) {
      throw new AuthRefused(AuthRefused.EMAIL, "Почта не разобрана");
    }
    return email;
  }

  static String password(String declared, AuthSettings settings) {
    int bytes = declared == null ? 0 : declared.getBytes(StandardCharsets.UTF_8).length;
    if (bytes < settings.passwordMinBytes() || bytes > settings.passwordMaxBytes()) {
      throw new AuthRefused(AuthRefused.PASSWORD, "Пароль от " + settings.passwordMinBytes() + " до "
        + settings.passwordMaxBytes() + " байт в UTF-8");
    }
    return declared;
  }
}
