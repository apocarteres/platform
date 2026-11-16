package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.notifications.Delivery;
import io.github.apocarteres.platform.notifications.DeliveryNotice;
import io.github.apocarteres.platform.notifications.NotificationChannel;
import io.github.apocarteres.platform.telegram.TelegramNotice;
import io.github.apocarteres.platform.telegram.TelegramTexts;
import io.github.apocarteres.platform.telegram.TelegramUnavailable;
import io.github.apocarteres.platform.telegram.internal.BotClient.Answer;
import io.github.apocarteres.platform.telegram.internal.LinkStore.Link;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

// REQ-TELEGRAM-014, REQ-TELEGRAM-015, REQ-TELEGRAM-016, REQ-TELEGRAM-017, REQ-NOTIFICATIONS-011
final class TelegramChannel implements NotificationChannel {

  static final String PREFIX = "telegram-";
  static final int TEXT_CHARS = 4096;
  static final Duration PER_CHAT = Duration.ofSeconds(1);

  private static final Log LOG = LogFactory.getLog(TelegramChannel.class);

  private final String id;
  private final LinkStore links;
  private final TelegramTexts texts;
  private final BotClient bot;
  private final URI linkBase;
  private final Clock clock;
  private final Map<Long, Instant> lastSent = new ConcurrentHashMap<>();

  TelegramChannel(String id, LinkStore links, TelegramTexts texts, BotClient bot, URI linkBase, Clock clock) {
    this.id = id;
    this.links = links;
    this.texts = texts;
    this.bot = bot;
    this.linkBase = linkBase;
    this.clock = clock;
  }

  // REQ-TELEGRAM-014
  @Override
  public String name() {
    return PREFIX + id;
  }

  @Override
  public Delivery deliver(DeliveryNotice notice) {
    // REQ-TELEGRAM-016
    Optional<Link> link = links.find(notice.account(), id);
    if (link.isEmpty()) {
      return Delivery.skipped();
    }
    // REQ-TELEGRAM-015
    Optional<String> text = texts.text(new TelegramNotice(id, notice.account(), notice.kind(), notice.params(),
      notice.link() == null ? null : linkBase.resolve(notice.link()), link.get().language()));
    if (text.isEmpty() || text.get().isBlank()) {
      return Delivery.skipped();
    }
    if (text.get().length() > TEXT_CHARS) {
      LOG.warn("Текст уведомления вида " + notice.kind() + " длиннее " + TEXT_CHARS + " знаков: в Telegram не отправлен");
      return Delivery.failed();
    }
    long chat = link.get().chat();
    // REQ-TELEGRAM-017
    Instant now = clock.instant();
    Instant previous = lastSent.get(chat);
    if (previous != null && now.isBefore(previous.plus(PER_CHAT))) {
      return Delivery.later(PER_CHAT);
    }
    forgetBefore(now.minus(PER_CHAT));
    lastSent.put(chat, now);
    Answer answer;
    try {
      answer = bot.sendMessage(chat, text.get());
    } catch (TelegramUnavailable unavailable) {
      return Delivery.retry();
    }
    return outcome(notice, answer);
  }

  // REQ-TELEGRAM-016
  private Delivery outcome(DeliveryNotice notice, Answer answer) {
    if (answer.ok()) {
      return Delivery.delivered();
    }
    if (answer.code() == 429) {
      return Delivery.later(answer.retryAfter() == null ? PER_CHAT : answer.retryAfter());
    }
    if (answer.code() == 403) {
      links.delete(notice.account(), id);
      LOG.info("Получатель уведомления вида " + notice.kind() + " недоступен боту (403): связь с Telegram снята");
      return Delivery.failed();
    }
    if (answer.code() >= 400 && answer.code() < 500) {
      LOG.warn("Bot API отклонил уведомление вида " + notice.kind() + ": " + answer.code() + " " + answer.description());
      return Delivery.failed();
    }
    return Delivery.retry();
  }

  private void forgetBefore(Instant before) {
    if (lastSent.size() > 1000) {
      lastSent.values().removeIf(sent -> sent.isBefore(before));
    }
  }
}
