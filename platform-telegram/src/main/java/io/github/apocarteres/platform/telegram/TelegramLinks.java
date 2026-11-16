package io.github.apocarteres.platform.telegram;

import java.util.OptionalLong;
import java.util.UUID;

// REQ-TELEGRAM-009
public interface TelegramLinks {

  OptionalLong chat(UUID account);

  boolean unlink(UUID account);
}
