package io.github.apocarteres.platform.web.errors;

import java.util.Locale;

// REQ-API-003
public interface ErrorMessages {

  String detailFor(ErrorCode code, Locale locale);
}
