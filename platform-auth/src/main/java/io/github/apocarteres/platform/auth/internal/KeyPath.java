package io.github.apocarteres.platform.auth.internal;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.springframework.web.util.UriUtils;

// REQ-AUTH-031
final class KeyPath {

  private static final String STRUCTURAL = "/;\\%";

  private KeyPath() {
  }

  // REQ-AUTH-031
  static Optional<String> of(HttpServletRequest request) {
    String uri = request.getRequestURI();
    String context = request.getContextPath();
    if (uri == null || context == null || !uri.startsWith(context)) {
      return Optional.empty();
    }
    String raw = uri.substring(context.length());
    if (raw.indexOf(';') >= 0 || raw.indexOf('\\') >= 0 || raw.contains("//") || !raw.startsWith("/")) {
      return Optional.empty();
    }
    for (int at = raw.indexOf('%'); at >= 0; at = raw.indexOf('%', at + 1)) {
      if (at + 2 >= raw.length()) {
        return Optional.empty();
      }
      int high = Character.digit(raw.charAt(at + 1), 16);
      int low = Character.digit(raw.charAt(at + 2), 16);
      if (high < 0 || low < 0) {
        return Optional.empty();
      }
      char decoded = (char) (high * 16 + low);
      if (unreserved(decoded) || STRUCTURAL.indexOf(decoded) >= 0) {
        return Optional.empty();
      }
    }
    String path;
    try {
      path = UriUtils.decode(raw, StandardCharsets.UTF_8);
    } catch (IllegalArgumentException malformed) {
      return Optional.empty();
    }
    for (String segment : path.substring(1).split("/", -1)) {
      if (segment.equals(".") || segment.equals("..")) {
        return Optional.empty();
      }
    }
    return Optional.of(path);
  }

  private static boolean unreserved(char value) {
    return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') || (value >= '0' && value <= '9') || "-._~".indexOf(value) >= 0;
  }
}
