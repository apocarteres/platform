package io.github.apocarteres.platform.telegram;

import java.net.URI;

// REQ-TELEGRAM-005, REQ-TELEGRAM-011
public interface TelegramBot {

  void send(long chat, String text);

  void useWebhook(URI url);
}
