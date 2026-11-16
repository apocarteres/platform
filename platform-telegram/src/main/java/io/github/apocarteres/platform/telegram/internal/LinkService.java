package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.telegram.TelegramLinks;
import io.github.apocarteres.platform.telegram.TelegramRefused;
import io.github.apocarteres.platform.telegram.internal.LinkStore.Invite;
import io.github.apocarteres.platform.telegram.internal.LinkStore.Link;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.Invitation;
import io.github.apocarteres.platform.telegram.internal.TelegramViews.LinkState;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.regex.Pattern;
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
  Invitation invite(UUID account) {
    if (store.find(account).isPresent()) {
      throw new TelegramRefused(TelegramRefused.ALREADY_LINKED, "Связь с Telegram уже есть: сначала её снимают");
    }
    byte[] raw = new byte[32];
    RANDOM.nextBytes(raw);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    Instant expires = clock.instant().plus(settings.linkTtl());
    store.putInvite(account, Digest.of(token), expires);
    return new Invitation(settings.invitation(token).toString(), expires);
  }

  // REQ-TELEGRAM-007
  boolean accept(String token, long user, long chat) {
    if (!TOKEN.matcher(token).matches()) {
      return false;
    }
    Boolean linked = transactions.execute(status -> {
      Optional<Invite> invite = store.takeInvite(Digest.of(token));
      Instant now = clock.instant();
      if (invite.isEmpty() || !invite.get().expiresAt().isAfter(now)) {
        return false;
      }
      return store.insert(invite.get().account(), user, chat, now);
    });
    return Boolean.TRUE.equals(linked);
  }

  // REQ-TELEGRAM-009
  LinkState state(UUID account) {
    return store.find(account).map(link -> new LinkState(true, link.linkedAt())).orElse(new LinkState(false, null));
  }

  // REQ-TELEGRAM-009
  @Override
  public OptionalLong chat(UUID account) {
    return store.find(account).map(Link::chat).map(OptionalLong::of).orElse(OptionalLong.empty());
  }

  // REQ-TELEGRAM-009
  @Override
  public boolean unlink(UUID account) {
    return store.delete(account);
  }
}
