package io.github.apocarteres.platform.auth;

import java.net.URI;
import java.util.Locale;

// REQ-AUTH-010
public interface AuthLetters {

  void verification(String email, URI link, Locale locale);

  void passwordReset(String email, URI link, Locale locale);
}
