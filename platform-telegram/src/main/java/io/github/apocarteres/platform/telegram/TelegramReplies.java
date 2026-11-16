package io.github.apocarteres.platform.telegram;

import java.util.Optional;

// REQ-TELEGRAM-008
public interface TelegramReplies {

  TelegramReplies SILENT = new TelegramReplies() {
    @Override
    public Optional<String> linked(String bot, String language) {
      return Optional.empty();
    }

    @Override
    public Optional<String> refused(String bot, String language) {
      return Optional.empty();
    }
  };

  Optional<String> linked(String bot, String language);

  Optional<String> refused(String bot, String language);
}
