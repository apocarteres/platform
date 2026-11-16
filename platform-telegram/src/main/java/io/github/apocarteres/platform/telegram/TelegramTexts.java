package io.github.apocarteres.platform.telegram;

import java.util.Optional;

// REQ-TELEGRAM-014, REQ-TELEGRAM-015
public interface TelegramTexts {

  Optional<String> text(TelegramNotice notice);
}
