package io.github.apocarteres.platform.support.internal;

import java.util.regex.Pattern;

// REQ-SUPPORT-006, REQ-CLIENT-JOURNAL-004, REQ-CLIENT-JOURNAL-005
final class Masking {

  static final String MASK = "***";
  static final int INPUT_LIMIT = 4096;

  private static final String SPACE = "\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF";
  private static final Pattern EMAIL = Pattern.compile("[^" + SPACE + "/@?&=]+@[^" + SPACE + "/@?&=]+\\.[A-Za-z]{2,}");
  private static final Pattern MARKER = Pattern.compile("[A-Za-z0-9_-]{20,}");
  private static final Pattern PHONE = Pattern.compile("\\+?[0-9][0-9 ()-]{6,}[0-9]");
  private static final Pattern ORIGIN = Pattern.compile("^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?//[^/?#]*");

  private Masking() {
  }

  static String masked(String value) {
    if (value == null) {
      return null;
    }
    String bounded = value.length() > INPUT_LIMIT ? value.substring(0, INPUT_LIMIT) : value;
    String step = EMAIL.matcher(bounded).replaceAll(MASK);
    step = MARKER.matcher(step).replaceAll(MASK);
    return PHONE.matcher(step).replaceAll(MASK);
  }

  static String barePath(String url) {
    if (url == null) {
      return null;
    }
    String path = ORIGIN.matcher(url).replaceFirst("");
    int cut = firstOf(path, '?', '#');
    path = cut < 0 ? path : path.substring(0, cut);
    return path.isEmpty() ? "/" : path;
  }

  static String cut(String value, int chars) {
    return value == null || value.length() <= chars ? value : value.substring(0, chars);
  }

  private static int firstOf(String text, char first, char second) {
    int a = text.indexOf(first);
    int b = text.indexOf(second);
    if (a < 0) {
      return b;
    }
    return b < 0 ? a : Math.min(a, b);
  }
}
