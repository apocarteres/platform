package io.github.apocarteres.platform.web.errors.internal;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import java.util.Locale;

// REQ-API-003
final class StatusErrorMessages implements ErrorMessages {

  @Override
  public String detailFor(ErrorCode code, Locale locale) {
    return code.status().getReasonPhrase();
  }
}
