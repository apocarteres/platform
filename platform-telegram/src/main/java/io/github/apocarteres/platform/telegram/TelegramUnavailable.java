package io.github.apocarteres.platform.telegram;

// REQ-TELEGRAM-011
public final class TelegramUnavailable extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public TelegramUnavailable(String method, String reason) {
    super("Bot API, метод " + method + ": " + reason, null, false, false);
  }
}
