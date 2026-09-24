package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.web.errors.ErrorCode;
import io.github.apocarteres.platform.web.errors.ErrorMessages;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;

// REQ-AUTH-008, REQ-API-001
final class ProblemResponses {

  static final ErrorCode REQUIRED = ErrorCode.of("authentication-required", HttpStatus.UNAUTHORIZED);
  static final ErrorCode DENIED = ErrorCode.of("access-denied", HttpStatus.FORBIDDEN);
  static final ErrorCode CSRF = ErrorCode.of("csrf-rejected", HttpStatus.FORBIDDEN);

  private final ErrorMessages messages;

  ProblemResponses(ErrorMessages messages) {
    this.messages = messages;
  }

  AuthenticationEntryPoint entryPoint() {
    return (request, response, failure) -> write(request, response, REQUIRED);
  }

  AccessDeniedHandler denied() {
    return (request, response, failure) -> write(request, response, failure instanceof CsrfException ? CSRF : DENIED);
  }

  private void write(HttpServletRequest request, HttpServletResponse response, ErrorCode code) throws IOException {
    Locale locale = request.getLocale() == null ? Locale.ROOT : request.getLocale();
    response.setStatus(code.status().value());
    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    response.getWriter().write("{\"type\":\"about:blank\",\"title\":" + quoted(code.status().getReasonPhrase())
      + ",\"status\":" + code.status().value()
      + ",\"detail\":" + quoted(messages.detailFor(code, locale))
      + ",\"instance\":" + quoted(request.getRequestURI())
      + ",\"code\":" + quoted(code.value()) + "}");
  }

  private static String quoted(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : (text == null ? "" : text).toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        default -> {
          if (c < 0x20) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    return out.append('"').toString();
  }
}
