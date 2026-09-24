package io.github.apocarteres.platform.support.internal;

// REQ-SUPPORT-006
record Snapshot(String version, String page, String language, Integer width, Integer height, String agent) {

  static final Snapshot EMPTY = new Snapshot(null, null, null, null, null, null);

  // REQ-SUPPORT-006
  Snapshot scrubbed() {
    return new Snapshot(
      text(version),
      text(page == null ? null : Masking.barePath(page)),
      text(language),
      size(width),
      size(height),
      text(agent)
    );
  }

  private static String text(String value) {
    return Masking.cut(Masking.masked(value), SupportLimits.SNAPSHOT_CHARS);
  }

  private static Integer size(Integer value) {
    return value == null || value < 0 || value > 100_000 ? null : value;
  }
}
