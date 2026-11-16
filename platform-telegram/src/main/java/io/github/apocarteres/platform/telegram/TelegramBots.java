package io.github.apocarteres.platform.telegram;

import java.util.Set;

// REQ-TELEGRAM-002, REQ-TELEGRAM-011
public interface TelegramBots {

  Set<String> ids();

  TelegramBot bot(String id);
}
