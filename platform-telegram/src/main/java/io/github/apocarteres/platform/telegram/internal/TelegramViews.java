package io.github.apocarteres.platform.telegram.internal;

import java.time.Instant;

// REQ-TELEGRAM-006, REQ-TELEGRAM-009, REQ-TELEGRAM-012
final class TelegramViews {

  private TelegramViews() {
  }

  record Invitation(String url, Instant expiresAt) {
  }

  record LinkState(boolean linked, Instant linkedAt) {
  }
}
