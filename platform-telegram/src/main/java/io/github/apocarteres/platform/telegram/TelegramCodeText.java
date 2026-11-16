package io.github.apocarteres.platform.telegram;

// REQ-TELEGRAM-021
public interface TelegramCodeText {

  String text(String bot, String language, String code);
}
