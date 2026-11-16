package io.github.apocarteres.platform.telegram.internal;

import java.net.URI;
import java.time.Duration;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

// REQ-TELEGRAM-002, REQ-CONFIG-001
record TelegramSettings(String botToken, String botName, String webhookSecret, Duration linkTtl, URI apiBase) {

  static final String PREFIX = "platform.telegram.";

  private static final Pattern TOKEN = Pattern.compile("[0-9]{1,20}:[A-Za-z0-9_-]{20,100}");
  private static final Pattern NAME = Pattern.compile("[A-Za-z][A-Za-z0-9_]{4,31}");
  private static final Pattern SECRET = Pattern.compile("[A-Za-z0-9_-]{32,256}");
  private static final Duration LONGEST = Duration.ofDays(1);

  static TelegramSettings of(Environment environment) {
    Binder binder = Binder.get(environment);
    String token = required(binder, "bot-token", TOKEN, "токен бота из BotFather, вида <число>:<строка>");
    String name = required(binder, "bot-name", NAME, "имя бота без @, от 5 до 32 латинских букв, цифр и _");
    String secret = required(binder, "webhook-secret", SECRET, "от 32 до 256 латинских букв, цифр, _ и -");
    Duration ttl = binder.bind(PREFIX + "link-ttl", Duration.class).orElse(Duration.ofMinutes(10));
    if (ttl.isNegative() || ttl.isZero() || ttl.compareTo(LONGEST) > 0) {
      throw refused("link-ttl", ttl + ": срок ссылки связи — положительный и не длиннее суток");
    }
    String base = binder.bind(PREFIX + "api-base", String.class).orElse("https://api.telegram.org").trim();
    return new TelegramSettings(token, name, secret, ttl, URI.create(base.endsWith("/") ? base.substring(0, base.length() - 1) : base));
  }

  // REQ-TELEGRAM-002
  private static String required(Binder binder, String key, Pattern form, String expected) {
    String value = binder.bind(PREFIX + key, String.class).map(String::trim).orElse("");
    if (value.isEmpty()) {
      throw refused(key, "не задана — значение приходит из окружения");
    }
    if (!form.matcher(value).matches()) {
      throw refused(key, "неверная форма: ожидается " + expected);
    }
    return value;
  }

  private static IllegalStateException refused(String key, String reason) {
    return new IllegalStateException("Настройка " + PREFIX + key + ": " + reason);
  }

  // REQ-TELEGRAM-011
  URI method(String name) {
    return URI.create(apiBase + "/bot" + botToken + "/" + name);
  }

  // REQ-TELEGRAM-006
  URI invitation(String token) {
    return URI.create("https://t.me/" + botName + "?start=" + token);
  }

  // REQ-TELEGRAM-002
  @Override
  public String toString() {
    return "TelegramSettings[botName=" + botName + ", linkTtl=" + linkTtl + ", apiBase=" + apiBase + "]";
  }
}
