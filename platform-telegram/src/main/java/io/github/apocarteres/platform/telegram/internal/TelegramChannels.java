package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.notifications.NotificationChannel;
import io.github.apocarteres.platform.notifications.NotificationChannels;
import io.github.apocarteres.platform.telegram.TelegramTexts;
import java.time.Clock;
import java.util.List;

// REQ-TELEGRAM-014, REQ-NOTIFICATIONS-011
final class TelegramChannels implements NotificationChannels {

  private final List<NotificationChannel> channels;

  TelegramChannels(LinkStore links, TelegramTexts texts, Bots bots, TelegramSettings settings, Clock clock) {
    this.channels = texts == null ? List.of() : bots.ids().stream().sorted()
      .<NotificationChannel>map(id -> new TelegramChannel(id, links, texts, bots.client(id), settings.linkBase(), clock)).toList();
  }

  @Override
  public List<NotificationChannel> channels() {
    return channels;
  }
}
