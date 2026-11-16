package io.github.apocarteres.platform.telegram.internal;

import io.github.apocarteres.platform.auth.Account;
import io.github.apocarteres.platform.auth.SecondFactor;
import io.github.apocarteres.platform.telegram.TelegramCodeText;
import io.github.apocarteres.platform.telegram.TelegramUnavailable;
import io.github.apocarteres.platform.telegram.internal.BotClient.Answer;
import io.github.apocarteres.platform.telegram.internal.CodeStore.Code;
import io.github.apocarteres.platform.telegram.internal.LinkStore.Link;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

// REQ-TELEGRAM-021, REQ-AUTH-041, REQ-AUTH-042
final class TelegramSecondFactor implements SecondFactor {

  static final Duration TTL = Duration.ofMinutes(5);

  private static final SecureRandom RANDOM = new SecureRandom();
  private static final Pattern CODE = Pattern.compile("[0-9]{6}");

  private final String bot;
  private final LinkStore links;
  private final CodeStore codes;
  private final BotClient client;
  private final TelegramCodeText text;
  private final Clock clock;

  TelegramSecondFactor(String bot, LinkStore links, CodeStore codes, BotClient client, TelegramCodeText text, Clock clock) {
    this.bot = bot;
    this.links = links;
    this.codes = codes;
    this.client = client;
    this.text = text;
    this.clock = clock;
  }

  @Override
  public boolean required(Account account) {
    return links.find(account.id(), bot).isPresent();
  }

  // REQ-TELEGRAM-021
  @Override
  public void challenge(Account account) {
    Optional<Link> link = links.find(account.id(), bot);
    if (link.isEmpty()) {
      return;
    }
    String code = String.format("%06d", RANDOM.nextInt(1_000_000));
    codes.put(account.id(), Digest.of(account.id() + ":" + code), clock.instant().plus(TTL));
    Answer answer = client.sendMessage(link.get().chat(), text.text(bot, link.get().language() == null ? "" : link.get().language(), code));
    if (!answer.ok()) {
      throw new TelegramUnavailable("sendMessage", "код второго шага не отправлен: " + answer.code());
    }
  }

  // REQ-TELEGRAM-021
  @Override
  public boolean verify(UUID account, String code) {
    Optional<Code> stored = codes.take(account);
    if (stored.isEmpty() || code == null || !CODE.matcher(code).matches() || !stored.get().expiresAt().isAfter(clock.instant())) {
      return false;
    }
    return MessageDigest.isEqual(stored.get().digest().getBytes(StandardCharsets.US_ASCII),
      Digest.of(account + ":" + code).getBytes(StandardCharsets.US_ASCII));
  }
}
