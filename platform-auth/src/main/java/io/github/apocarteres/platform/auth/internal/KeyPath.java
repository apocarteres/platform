package io.github.apocarteres.platform.auth.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;
import org.springframework.web.util.UriUtils;

// REQ-AUTH-031
final class KeyPath {

  private static final String STRUCTURAL = "/;\\%.";

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
      if (high < 0 || low < 0 || STRUCTURAL.indexOf((char) (high * 16 + low)) >= 0) {
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

  // REQ-AUTH-031
  static boolean under(HttpServletRequest request, String path, String prefix) {
    String info = request.getPathInfo();
    return under(path, prefix) || (info != null && under(info, prefix));
  }

  // REQ-AUTH-031
  static HttpServletRequest decoded(HttpServletRequest request, String path) {
    String uri = request.getContextPath() + path;
    String url = request.getRequestURL().toString();
    String origin = url.endsWith(request.getRequestURI()) ? url.substring(0, url.length() - request.getRequestURI().length()) : "";
    String encoded = request.getContextPath() + UriUtils.encodePath(path, StandardCharsets.UTF_8);
    return new HttpServletRequestWrapper(request) {
      @Override
      public String getRequestURI() {
        return uri;
      }

      @Override
      public StringBuffer getRequestURL() {
        return new StringBuffer(origin).append(encoded);
      }
    };
  }

  private static boolean under(String path, String prefix) {
    String lower = path.toLowerCase(Locale.ROOT);
    return lower.equals(prefix) || lower.startsWith(prefix + "/");
  }
}
