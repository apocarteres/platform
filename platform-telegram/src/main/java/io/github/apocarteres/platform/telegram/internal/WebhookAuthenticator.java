package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.ExternalIdentity;
import io.github.apocarteres.platform.auth.RequestAuthenticator;
import io.github.apocarteres.platform.telegram.internal.TelegramSettings.Bot;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

// REQ-TELEGRAM-003, REQ-AUTH-037
final class WebhookAuthenticator implements RequestAuthenticator {

  static final String HEADER = "X-Telegram-Bot-Api-Secret-Token";
  static final String KIND = "telegram-webhook";

  private final Map<String, Bot> byPath;

  WebhookAuthenticator(TelegramSettings settings) {
    this.byPath = settings.bots().values().stream().collect(Collectors.toUnmodifiableMap(WebhookAuthenticator::path, bot -> bot));
  }

  static String path(Bot bot) {
    return "/api/telegram/" + bot.id() + "/webhook";
  }

  @Override
  public Set<String> paths() {
    return byPath.keySet();
  }

  @Override
  public Optional<ExternalIdentity> authenticate(HttpServletRequest request) {
    Bot bot = byPath.get(request.getRequestURI().substring(request.getContextPath().length()));
    String presented = request.getHeader(HEADER);
    if (bot == null || presented == null || !MessageDigest.isEqual(bot.webhookSecret().getBytes(StandardCharsets.UTF_8),
      presented.getBytes(StandardCharsets.UTF_8))) {
      return Optional.empty();
    }
    return Optional.of(new ExternalIdentity(KIND, bot.id(), Set.of()));
  }
}
