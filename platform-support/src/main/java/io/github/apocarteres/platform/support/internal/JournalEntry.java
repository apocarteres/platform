package io.github.apocarteres.platform.support.internal;

import java.util.Set;

// REQ-SUPPORT-006
record JournalEntry(String at, String kind, String method, String path, Integer status, Long durationMs, String code,
  String message) {

  private static final Set<String> KINDS = Set.of("request", "navigation", "error");
  private static final int MESSAGE_CHARS = 1024;
  private static final int SHORT_CHARS = 64;

  boolean known() {
    return kind != null && KINDS.contains(kind) && at != null;
  }

  // REQ-SUPPORT-006, REQ-CLIENT-JOURNAL-003, REQ-CLIENT-JOURNAL-004
  JournalEntry scrubbed() {
    return new JournalEntry(
      Masking.cut(at, SHORT_CHARS),
      kind,
      Masking.cut(method, SHORT_CHARS),
      path == null ? null : Masking.cut(Masking.masked(Masking.barePath(path)), MESSAGE_CHARS),
      status,
      durationMs,
      Masking.cut(Masking.masked(code), SHORT_CHARS),
      Masking.cut(Masking.masked(message), MESSAGE_CHARS)
    );
  }
}
