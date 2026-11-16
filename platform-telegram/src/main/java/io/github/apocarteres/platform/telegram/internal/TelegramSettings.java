package io.github.apocarteres.platform.telegram.internal;

import java.net.URI;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.ResolvableType;
import org.springframework.core.env.Environment;

// REQ-TELEGRAM-002, REQ-TELEGRAM-015, REQ-TELEGRAM-018, REQ-CONFIG-001
record TelegramSettings(Map<String, Bot> bots, Duration linkTtl, URI apiBase, URI linkBase, Duration miniAppAge) {

  static final String PREFIX = "platform.telegram.";

  private static final Pattern ID = Pattern.compile("[a-z][a-z0-9-]{0,15}");
  private static final Pattern TOKEN = Pattern.compile("[0-9]{1,20}:[A-Za-z0-9_-]{20,100}");
  private static final Pattern NAME = Pattern.compile("[A-Za-z][A-Za-z0-9_]{4,31}");
  private static final Pattern SECRET = Pattern.compile("[A-Za-z0-9_-]{32,256}");
  private static final Duration LONGEST = Duration.ofDays(1);
  private static final Duration LONGEST_AGE = Duration.ofDays(7);
  private static final Set<String> FORMER = Set.of("bot-token", "bot-name", "webhook-secret");

  // REQ-TELEGRAM-002
  record Bot(String id, String token, String name, String webhookSecret, MiniApp miniApp) {

    URI method(URI apiBase, String method) {
      return URI.create(apiBase + "/bot" + token + "/" + method);
    }

    // REQ-TELEGRAM-006
    URI invitation(String start) {
      return URI.create("https://t.me/" + name + "?start=" + start);
    }

    @Override
    public String toString() {
      return "Bot[id=" + id + ", name=" + name + "]";
    }
  }

  // REQ-TELEGRAM-018
  record MiniApp(List<String> paths, Set<String> roles) {

    static final MiniApp NONE = new MiniApp(List.of(), Set.of());
  }

  static TelegramSettings of(Environment environment) {
    Binder binder = Binder.get(environment);
    for (String former : FORMER) {
      if (binder.bind(PREFIX + former, String.class).isBound()) {
        throw new IllegalStateException("Настройка " + PREFIX + former + ": с 18.0.0 боты объявляются по идентификатору —"
          + " platform.telegram.bots.<бот>.token, .name, .webhook-secret (миграция — в документе выпуска 18.0.0)");
      }
    }
    Bindable<Map<String, Map<String, String>>> shape = Bindable.of(ResolvableType.forClassWithGenerics(Map.class,
      ResolvableType.forClass(String.class), ResolvableType.forClassWithGenerics(Map.class, String.class, String.class)));
    Map<String, Map<String, String>> declared = binder.bind(PREFIX + "bots", shape).orElse(Map.of());
    if (declared.isEmpty()) {
      throw new IllegalStateException("Настройка " + PREFIX + "bots: не объявлено ни одного бота —"
        + " platform.telegram.bots.<бот>.token, .name, .webhook-secret");
    }
    Map<String, Bot> bots = new TreeMap<>();
    Set<String> tokens = new HashSet<>();
    Set<String> names = new HashSet<>();
    Set<String> secrets = new HashSet<>();
    Set<String> paths = new HashSet<>();
    for (Map.Entry<String, Map<String, String>> entry : declared.entrySet()) {
      String id = entry.getKey();
      if (!ID.matcher(id).matches()) {
        throw refused("bots." + id, "идентификатор бота — строчные латинские буквы, цифры и дефис, до 16 знаков");
      }
      Map<String, String> values = entry.getValue();
      Bot bot = new Bot(id,
        required(values, id, "token", TOKEN, "токен бота из BotFather, вида <число>:<строка>"),
        required(values, id, "name", NAME, "имя бота без @, от 5 до 32 латинских букв, цифр и _"),
        required(values, id, "webhook-secret", SECRET, "от 32 до 256 латинских букв, цифр, _ и -"),
        miniApp(binder, id, paths));
      if (!tokens.add(bot.token())) {
        throw refused("bots." + id + ".token", "тот же токен объявлен у другого бота");
      }
      if (!names.add(bot.name().toLowerCase(java.util.Locale.ROOT))) {
        throw refused("bots." + id + ".name", "то же имя объявлено у другого бота");
      }
      if (!secrets.add(bot.webhookSecret())) {
        throw refused("bots." + id + ".webhook-secret", "секрет webhook у каждого бота свой");
      }
      bots.put(id, bot);
    }
    Duration ttl = binder.bind(PREFIX + "link-ttl", Duration.class).orElse(Duration.ofMinutes(10));
    if (ttl.isNegative() || ttl.isZero() || ttl.compareTo(LONGEST) > 0) {
      throw refused("link-ttl", ttl + ": срок ссылки связи — положительный и не длиннее суток");
    }
    String base = binder.bind(PREFIX + "api-base", String.class).orElse("https://api.telegram.org").trim();
    // REQ-TELEGRAM-015
    String site = binder.bind("platform.auth.link-base", String.class).orElse("").trim();
    if (site.isEmpty()) {
      throw new IllegalStateException("Настройка platform.auth.link-base: не задана, а ссылки уведомлений в Telegram строятся от неё");
    }
    // REQ-TELEGRAM-018
    Duration age = binder.bind(PREFIX + "mini-app.max-age", Duration.class).orElse(Duration.ofHours(1));
    if (age.isNegative() || age.isZero() || age.compareTo(LONGEST_AGE) > 0) {
      throw refused("mini-app.max-age", age + ": срок initData — положительный и не длиннее 7 суток");
    }
    return new TelegramSettings(Map.copyOf(bots), ttl,
      URI.create(base.endsWith("/") ? base.substring(0, base.length() - 1) : base), URI.create(site), age);
  }

  // REQ-TELEGRAM-018
  private static MiniApp miniApp(Binder binder, String id, Set<String> taken) {
    String key = PREFIX + "bots." + id + ".mini-app.";
    List<String> paths = binder.bind(key + "paths", Bindable.listOf(String.class)).orElse(List.of()).stream().map(String::trim).toList();
    Set<String> roles = binder.bind(key + "roles", Bindable.listOf(String.class)).orElse(List.of()).stream().map(String::trim)
      .collect(java.util.stream.Collectors.toUnmodifiableSet());
    if (paths.isEmpty()) {
      if (!roles.isEmpty()) {
        throw refused("bots." + id + ".mini-app.roles", "роли объявлены, а пути Mini App — нет");
      }
      return MiniApp.NONE;
    }
    for (String path : paths) {
      if (!path.startsWith("/api/") || path.startsWith("/api/telegram/") || path.equals("/api/telegram")) {
        throw refused("bots." + id + ".mini-app.paths", path + ": пути Mini App — под /api/**, кроме путей модуля /api/telegram/**");
      }
      if (!taken.add(path)) {
        throw refused("bots." + id + ".mini-app.paths", path + ": путь уже отдан Mini App другого бота");
      }
    }
    Set<String> external = binder.bind("platform.auth.external.roles", Bindable.listOf(String.class)).orElse(List.of()).stream()
      .map(String::trim).collect(java.util.stream.Collectors.toSet());
    for (String role : roles) {
      if (!external.contains(role)) {
        throw refused("bots." + id + ".mini-app.roles", role + ": роль не объявлена в platform.auth.external.roles (REQ-AUTH-039)");
      }
    }
    return new MiniApp(List.copyOf(paths), roles);
  }

  // REQ-TELEGRAM-002
  private static String required(Map<String, String> values, String id, String key, Pattern form, String expected) {
    String value = values.getOrDefault(key, "").trim();
    if (value.isEmpty()) {
      throw refused("bots." + id + "." + key, "не задана — значение приходит из окружения");
    }
    if (!form.matcher(value).matches()) {
      throw refused("bots." + id + "." + key, "неверная форма: ожидается " + expected);
    }
    return value;
  }

  private static IllegalStateException refused(String key, String reason) {
    return new IllegalStateException("Настройка " + PREFIX + key + ": " + reason);
  }

  // REQ-TELEGRAM-002
  Bot bot(String id) {
    Bot bot = id == null ? null : bots.get(id);
    if (bot == null) {
      throw new io.github.apocarteres.platform.telegram.TelegramRefused(
        io.github.apocarteres.platform.telegram.TelegramRefused.BOT_NOT_FOUND, "Бот не объявлен");
    }
    return bot;
  }

  @Override
  public String toString() {
    return "TelegramSettings[bots=" + bots.keySet() + ", linkTtl=" + linkTtl + ", apiBase=" + apiBase + "]";
  }
}
