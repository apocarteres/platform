package io.github.apocarteres.platform.telegram;

import java.net.URI;
import java.util.Map;
import java.util.UUID;

// REQ-TELEGRAM-015
public record TelegramNotice(String bot, UUID account, String kind, Map<String, String> params, URI link, String language) {

  public TelegramNotice {
    params = Map.copyOf(params);
    language = language == null ? "" : language;
  }
}
