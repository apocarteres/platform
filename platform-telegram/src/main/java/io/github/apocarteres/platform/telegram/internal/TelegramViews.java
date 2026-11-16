package io.github.apocarteres.platform.telegram.internal;

import java.time.Instant;
import java.util.List;

// REQ-TELEGRAM-006, REQ-TELEGRAM-009, REQ-TELEGRAM-012
final class TelegramViews {

  private TelegramViews() {
  }

  record Invitation(String url, Instant expiresAt) {
  }

  record BotLink(String bot, String name, boolean linked, Instant linkedAt) {
  }

  record Links(List<BotLink> bots) {
  }

  // REQ-TELEGRAM-020
  record SignedIn(java.util.UUID id, String email, java.util.Set<String> roles) {
  }
}
