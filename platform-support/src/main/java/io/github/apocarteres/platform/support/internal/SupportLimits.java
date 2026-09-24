package io.github.apocarteres.platform.support.internal;

import io.github.apocarteres.platform.ratelimit.RateLimit;
import java.time.Duration;
import java.util.Set;

// REQ-SUPPORT-003, REQ-SUPPORT-005
final class SupportLimits {

  static final RateLimit SUBMIT_BY_ADDRESS = new RateLimit("support-submit-address", Duration.ofHours(1), 10);
  static final RateLimit SUBMIT_BY_GUEST = new RateLimit("support-submit-guest", Duration.ofHours(1), 3);
  static final RateLimit SUBMIT_BY_ACCOUNT = new RateLimit("support-submit-account", Duration.ofHours(1), 10);
  static final RateLimit MESSAGE_BY_ACCOUNT = new RateLimit("support-message-account", Duration.ofHours(1), 30);
  static final RateLimit ANSWER_LINK_BY_ADDRESS = new RateLimit("support-answer-link-address", Duration.ofMinutes(5), 20);

  static final int MESSAGE_CHARS = 4000;
  static final int ATTACHMENTS = 3;
  static final int ATTACHMENT_BYTES = 5 * 1024 * 1024;
  static final int JOURNAL_ENTRIES = 5000;
  static final int JOURNAL_BYTES = 256 * 1024;
  // REQ-SUPPORT-003
  static final long BODY_BYTES = (long) ATTACHMENTS * ATTACHMENT_BYTES + 1024 * 1024;
  static final int EXCERPT_CHARS = 140;
  static final int PAGE_SIZE = 20;
  static final int PAGE_SIZE_MAX = 100;
  static final int NAME_CHARS = 255;
  static final int SNAPSHOT_CHARS = 300;
  static final Set<String> IMAGE_TYPES = Set.of("image/png", "image/jpeg");

  private SupportLimits() {
  }
}
