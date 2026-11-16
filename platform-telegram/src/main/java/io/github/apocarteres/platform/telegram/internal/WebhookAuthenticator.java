package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.auth.RequestAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import java.util.Set;

// REQ-TELEGRAM-003, REQ-AUTH-037
final class WebhookAuthenticator implements RequestAuthenticator {

  static final String PATH = "/api/telegram/webhook";
  static final String HEADER = "X-Telegram-Bot-Api-Secret-Token";
  static final ExternalIdentity IDENTITY = new ExternalIdentity("telegram", "webhook", Set.of());

  private final byte[] secret;

  WebhookAuthenticator(TelegramSettings settings) {
    this.secret = settings.webhookSecret().getBytes(StandardCharsets.UTF_8);
  }

  @Override
  public Set<String> paths() {
    return Set.of(PATH);
  }

  @Override
  public Optional<ExternalIdentity> authenticate(HttpServletRequest request) {
    String presented = request.getHeader(HEADER);
    if (presented == null || !MessageDigest.isEqual(secret, presented.getBytes(StandardCharsets.UTF_8))) {
      return Optional.empty();
    }
    return Optional.of(IDENTITY);
  }
}
