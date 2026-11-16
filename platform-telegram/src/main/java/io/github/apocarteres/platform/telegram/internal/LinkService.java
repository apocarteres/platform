package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.telegram.TelegramLinks;
import io.github.apocarteres.platform.telegram.TelegramRefused;
import io.github.apocarteres.platform.telegram.internal.LinkStore.Invite;
import io.github.apocarteres.platform.telegram.internal.LinkStore.Link;
import io.github.apocarteres.platform.telegram.internal.TelegramSettings.Bot;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.BotLink;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.Invitation;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.Links;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-TELEGRAM-006, REQ-TELEGRAM-007, REQ-TELEGRAM-009
final class LinkService implements TelegramLinks {

  private static final SecureRandom RANDOM = new SecureRandom();
  private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");

  private final LinkStore store;
  private final TransactionTemplate transactions;
  private final TelegramSettings settings;
  private final Clock clock;

  LinkService(LinkStore store, TransactionTemplate transactions, TelegramSettings settings, Clock clock) {
    this.store = store;
    this.transactions = transactions;
    this.settings = settings;
    this.clock = clock;
  }

  // REQ-TELEGRAM-006
  Invitation invite(UUID account, String bot) {
    Bot declared = settings.bot(bot);
    if (store.find(account, declared.id()).isPresent()) {
      throw new TelegramRefused(TelegramRefused.ALREADY_LINKED, "Связь с этим ботом уже есть: сначала её снимают");
    }
    byte[] raw = new byte[32];
    RANDOM.nextBytes(raw);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    Instant expires = clock.instant().plus(settings.linkTtl());
    store.putInvite(account, declared.id(), Digest.of(token), expires);
    return new Invitation(declared.invitation(token).toString(), expires);
  }

  // REQ-TELEGRAM-007
  boolean accept(String bot, String token, long user, long chat, String language) {
    if (!TOKEN.matcher(token).matches()) {
      return false;
    }
    Boolean linked = transactions.execute(status -> {
      Optional<Invite> invite = store.takeInvite(bot, Digest.of(token));
      Instant now = clock.instant();
      if (invite.isEmpty() || !invite.get().expiresAt().isAfter(now)) {
        return false;
      }
      return store.insert(invite.get().account(), bot, user, chat, language.isEmpty() ? null : language, now);
    });
    return Boolean.TRUE.equals(linked);
  }

  // REQ-TELEGRAM-009
  Links links(UUID account) {
    Map<String, Link> found = store.all(account).stream().collect(Collectors.toMap(Link::bot, Function.identity()));
    return new Links(settings.bots().values().stream().sorted(java.util.Comparator.comparing(Bot::id)).map(bot -> {
      Link link = found.get(bot.id());
      return new BotLink(bot.id(), bot.name(), link != null, link == null ? null : link.linkedAt());
    }).toList());
  }

  // REQ-TELEGRAM-009
  void remove(UUID account, String bot) {
    store.delete(account, settings.bot(bot).id());
  }

  // REQ-TELEGRAM-009
  @Override
  public OptionalLong chat(UUID account, String bot) {
    return store.find(account, bot).map(link -> OptionalLong.of(link.chat())).orElse(OptionalLong.empty());
  }

  // REQ-TELEGRAM-019
  @Override
  public Optional<UUID> account(String bot, long telegramUser) {
    return store.account(bot, telegramUser);
  }

  // REQ-TELEGRAM-009
  @Override
  public boolean unlink(UUID account, String bot) {
    return store.delete(account, bot);
  }
}
