package io.github.apocarteres.platform.telegram;

import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;

// REQ-TELEGRAM-009, REQ-TELEGRAM-019
public interface TelegramLinks {

  OptionalLong chat(UUID account, String bot);

  boolean unlink(UUID account, String bot);

  // REQ-TELEGRAM-019
  Optional<UUID> account(String bot, long telegramUser);
}
