package io.github.apocarteres.platform.auth.internal;

import io.github.apocarteres.platform.auth.AccessKey;
import io.github.apocarteres.platform.auth.AccessKeys;
import io.github.apocarteres.platform.auth.AuthRefused;
import io.github.apocarteres.platform.auth.IssuedKey;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.transaction.support.TransactionTemplate;

// REQ-AUTH-029
final class AccessKeysService implements AccessKeys {

  static final String PREFIX = "pak_";
  static final int NAME_MAX = 100;

  private static final SecureRandom RANDOM = new SecureRandom();

  private final AccessKeyStore keys;
  private final AccountStore accounts;
  private final TransactionTemplate transactions;
  private final KeySettings settings;
  private final Clock clock;

  AccessKeysService(AccessKeyStore keys, AccountStore accounts, TransactionTemplate transactions, KeySettings settings, Clock clock) {
    this.keys = keys;
    this.accounts = accounts;
    this.transactions = transactions;
    this.settings = settings;
    this.clock = clock;
  }

  @Override
  public IssuedKey issue(UUID account, String name, int days) {
    String named = name == null ? "" : name.strip();
    if (named.isEmpty() || named.codePointCount(0, named.length()) > NAME_MAX) {
      throw new AuthRefused(AuthRefused.KEY_REQUEST, "Имя ключа — от 1 до " + NAME_MAX + " символов");
    }
    if (days < 1 || days > settings.maxDays()) {
      throw new AuthRefused(AuthRefused.KEY_REQUEST, "Срок ключа — от 1 до " + settings.maxDays() + " дней");
    }
    if (accounts.find(account).isEmpty()) {
      throw new IllegalArgumentException("Учётной записи " + account + " нет");
    }
    return transactions.execute(status -> {
      Instant now = clock.instant();
      if (keys.active(account, now) >= settings.maxPerAccount()) {
        throw new AuthRefused(AuthRefused.KEY_REQUEST, "У учётной записи уже " + settings.maxPerAccount() + " ключей: отзовите ненужный");
      }
      byte[] raw = new byte[32];
      RANDOM.nextBytes(raw);
      String value = PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
      AccessKey key = new AccessKey(UUID.randomUUID(), named, now, now.plus(Duration.ofDays(days)), null);
      keys.insert(account, key, TokenStore.digest(value));
      return new IssuedKey(key, value);
    });
  }

  @Override
  public List<AccessKey> list(UUID account) {
    return keys.list(account);
  }

  @Override
  public boolean revoke(UUID account, UUID key) {
    return keys.delete(account, key);
  }

  @Override
  public int revokeAll(UUID account) {
    return keys.deleteAll(account);
  }
}
